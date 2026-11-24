"use server";
/**
 * Server Actions da aplicação. Toda ação: (1) exige sessão e permissão via requireCtx,
 * (2) opera dentro de withOrg(ctx.org.id) e (3) registra auditoria quando altera dados.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withOrg } from "@/db/client";
import {
  apiKeys, automations, blocklist, customers, integrations, memberships, organizations, users,
  type Channel, type CustomerStatus, type Provider, type Role,
} from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { hashPassword, normalizeEmail } from "@/lib/auth/core";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { parseSpreadsheet } from "@/lib/import/parse";
import { detectMapping, FIELDS, type Mapping } from "@/lib/import/mapping";
import { importRows, type ImportResult } from "@/lib/import/run";
import { normalizeEmail as normEmail, normalizePhone, parseMoneyCents, parseDate } from "@/lib/import/normalize";
import { loadDemoData, removeDemoData } from "@/lib/demo";
import { optOutCustomer, reclassifyOrg, recordVisit, setConsent } from "@/lib/customers";
import { deleteCustomerData } from "@/lib/lgpd";
import {
  createCampaign, dispatchCampaign, markManuallySent, transitionCampaign, updateCampaignCopy, type DispatchResult,
} from "@/lib/campaigns/service";
import { runAgentTurn, type AgentReply } from "@/lib/ai/agent";
import { validateThresholds, type OrgSettings } from "@/lib/settings";
import { SEGMENTS } from "@/lib/segments";
import { buildAdapter, PROVIDER_FIELDS, ChannelError } from "@/lib/channels";
import { encryptSecret, decryptSecret, randomToken, sha256 } from "@/lib/crypto";
import { getPlan } from "@/lib/plans";
import { today } from "@/lib/dates";

export interface ActionResult<T = undefined> { ok: boolean; error?: string; data?: T }
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: e instanceof Error ? e.message : "Erro inesperado." });

// ───────────────────────── Importação ─────────────────────────
const MAX_FILE = 10 * 1024 * 1024;

async function readUpload(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Selecione um arquivo.");
  if (file.size > MAX_FILE) throw new Error("Arquivo maior que 10 MB.");
  return { file, sheet: await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name) };
}

export interface PreviewData { filename: string; headers: string[]; sample: Record<string, string>[]; totalRows: number; mapping: Mapping }

export async function importPreviewAction(fd: FormData): Promise<ActionResult<PreviewData>> {
  try {
    await requireCtx("import");
    const { file, sheet } = await readUpload(fd);
    if (!sheet.rows.length) throw new Error("A planilha não tem linhas de dados.");
    const sample = sheet.rows.slice(0, 5).map((r) => Object.fromEntries(sheet.headers.map((h) => [h, fmtCell(r[h])])));
    return { ok: true, data: { filename: file.name, headers: sheet.headers, sample, totalRows: sheet.rows.length, mapping: detectMapping(sheet.headers) } };
  } catch (e) { return fail(e); }
}

function fmtCell(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v === null || v === undefined ? "" : String(v).slice(0, 60);
}

export async function importCommitAction(fd: FormData): Promise<ActionResult<ImportResult>> {
  try {
    const ctx = await requireCtx("import");
    const { file, sheet } = await readUpload(fd);
    const mapping = JSON.parse(String(fd.get("mapping") ?? "{}")) as Mapping;
    const validKeys = new Set<string>(FIELDS.map((f) => f.key));
    for (const [k, v] of Object.entries(mapping)) if (!validKeys.has(k) || (v && !sheet.headers.includes(v))) delete mapping[k as keyof Mapping];
    if (!mapping.name) throw new Error("Indique qual coluna contém o nome do cliente.");
    const declared = { whatsapp: fd.get("consent_whatsapp") === "on", email: fd.get("consent_email") === "on", sms: fd.get("consent_sms") === "on" };
    const result = await withOrg(ctx.org.id, (tx) => importRows(tx, ctx.org, sheet.rows, {
      filename: file.name, source: file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv", userId: ctx.user.id, mapping,
      declaredConsent: declared.whatsapp || declared.email || declared.sms ? declared : undefined,
      declaredLegitimateInterest: fd.get("legitimate_interest") === "on",
    }));
    revalidatePath("/", "layout");
    return { ok: true, data: { ...result, errors: result.errors.slice(0, 100) } };
  } catch (e) { return fail(e); }
}

export async function loadDemoAction(): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("import");
    await withOrg(ctx.org.id, (tx) => loadDemoData(tx, ctx.org, ctx.user.id));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeDemoAction(): Promise<ActionResult<number>> {
  try {
    const ctx = await requireCtx("customers:delete");
    const n = await withOrg(ctx.org.id, (tx) => removeDemoData(tx, ctx.org.id, ctx.user.id));
    revalidatePath("/", "layout");
    return { ok: true, data: n };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Clientes ─────────────────────────
export async function createCustomerAction(fd: FormData): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("customers:write");
    const name = String(fd.get("name") ?? "").trim();
    if (name.length < 2) throw new Error("Informe o nome.");
    const phone = normalizePhone(fd.get("phone"));
    const email = normEmail(fd.get("email"));
    if (fd.get("phone") && !phone) throw new Error("Telefone inválido.");
    const consentWa = fd.get("consent_whatsapp") === "on", consentEm = fd.get("consent_email") === "on", consentSms = fd.get("consent_sms") === "on";
    const id = await withOrg(ctx.org.id, async (tx) => {
      const plan = await getPlan(tx, ctx.org.planId);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, ctx.org.id));
      if (Number(n) >= plan.limits.maxCustomers) throw new Error(`Limite de ${plan.limits.maxCustomers} clientes do plano atingido.`);
      const [c] = await tx.insert(customers).values({
        orgId: ctx.org.id, name, phone, email, source: "manual",
        favoriteService: String(fd.get("favoriteService") ?? "").trim() || null,
        preferredStaff: String(fd.get("preferredStaff") ?? "").trim() || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
      }).returning({ id: customers.id });
      for (const [ch, on] of [["whatsapp", consentWa], ["email", consentEm], ["sms", consentSms]] as const)
        if (on) await setConsent(tx, ctx.org.id, c.id, ch, true, { source: "Cadastro manual pela equipe", actor: `user:${ctx.user.id}` });
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "customer.create", entity: "customer", entityId: c.id });
      return c.id;
    });
    revalidatePath("/clientes");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

export async function recordVisitAction(customerId: string, fd: FormData): Promise<ActionResult<{ recovered: boolean }>> {
  try {
    const ctx = await requireCtx("customers:write");
    const date = parseDate(String(fd.get("date") ?? today()));
    if (!date) throw new Error("Data inválida (não pode ser futura).");
    const amountCents = parseMoneyCents(fd.get("amount")) ?? 0;
    const r = await withOrg(ctx.org.id, (tx) => recordVisit(tx, ctx.org, customerId, { date, amountCents, description: String(fd.get("description") ?? "") || null, source: "manual" }));
    revalidatePath("/", "layout");
    return { ok: true, data: { recovered: !!r.recovery } };
  } catch (e) { return fail(e); }
}

export async function setConsentAction(customerId: string, channel: Channel, granted: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("customers:write");
    await withOrg(ctx.org.id, (tx) => setConsent(tx, ctx.org.id, customerId, channel, granted, { source: granted ? "Registrado manualmente pela equipe (autorização verbal/escrita do cliente)" : "Revogado pela equipe", actor: `user:${ctx.user.id}` }));
    revalidatePath(`/clientes/${customerId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function optOutAction(customerId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("customers:write");
    await withOrg(ctx.org.id, (tx) => optOutCustomer(tx, ctx.org.id, customerId, "Solicitação registrada pela equipe", `user:${ctx.user.id}`));
    revalidatePath(`/clientes/${customerId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

const cleanTag = (t: string) => t.trim().replace(/\s+/g, " ").slice(0, 30);

/** Observações internas e etiquetas do cliente (visíveis só para a equipe). */
export async function saveCustomerProfileAction(customerId: string, notes: string, tags: string[]): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("customers:write");
    const list = [...new Set(tags.map(cleanTag).filter(Boolean))].slice(0, 12);
    await withOrg(ctx.org.id, async (tx) => {
      const r = await tx.update(customers).set({ notes: notes.trim().slice(0, 2000) || null, tags: list, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), eq(customers.orgId, ctx.org.id))).returning({ id: customers.id });
      if (!r.length) throw new Error("Cliente não encontrado.");
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "customer.profile", entity: "customer", entityId: customerId });
    });
    revalidatePath(`/clientes/${customerId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Ações em lote na lista de clientes: etiquetar/desetiquetar. Só afeta clientes da própria empresa. */
export async function bulkTagAction(ids: string[], op: "add" | "remove", tag: string): Promise<ActionResult<number>> {
  try {
    const ctx = await requireCtx("customers:write");
    const t = cleanTag(tag);
    if (!t) throw new Error("Informe a etiqueta.");
    const sel = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 500);
    if (!sel.length) throw new Error("Selecione clientes.");
    const n = await withOrg(ctx.org.id, async (tx) => {
      const where = and(eq(customers.orgId, ctx.org.id), inArray(customers.id, sel));
      const r = op === "add"
        ? await tx.update(customers).set({ tags: sql`array_append(array_remove(${customers.tags}, ${t}), ${t})` }).where(where).returning({ id: customers.id })
        : await tx.update(customers).set({ tags: sql`array_remove(${customers.tags}, ${t})` }).where(where).returning({ id: customers.id });
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: `customer.bulk_tag_${op}`, entity: "customer", summary: `Etiqueta "${t}" ${op === "add" ? "adicionada a" : "removida de"} ${r.length} cliente(s)`, metadata: { tag: t, count: r.length } });
      return r.length;
    });
    revalidatePath("/clientes");
    return { ok: true, data: n };
  } catch (e) { return fail(e); }
}

/** Cria uma campanha em rascunho só com os clientes selecionados. As regras de contato (LGPD, frequência) continuam valendo. */
export async function campaignFromSelectionAction(ids: string[], channel: Channel): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("campaigns:write");
    const sel = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 500);
    if (!sel.length) throw new Error("Selecione clientes.");
    if (!["whatsapp", "email", "sms"].includes(channel)) throw new Error("Canal inválido.");
    const r = await createCampaign(ctx.org.id, {
      name: `Seleção de ${sel.length} cliente${sel.length > 1 ? "s" : ""} — ${new Date().toLocaleDateString("pt-BR")}`,
      channel, audience: { customerIds: sel, limit: sel.length },
    }, { type: "user", userId: ctx.user.id });
    revalidatePath("/campanhas");
    return { ok: true, data: r.campaign.id };
  } catch (e) { return fail(e); }
}

/** Meta mensal de clientes recuperados (0 desliga). */
export async function saveGoalAction(goal: number): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    const g = Math.max(0, Math.min(10000, Math.round(Number(goal) || 0)));
    await withOrg(ctx.org.id, async (tx) => {
      const [org] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, ctx.org.id));
      await tx.update(organizations).set({ settings: { ...(org?.settings ?? {}), monthlyGoal: g } }).where(eq(organizations.id, ctx.org.id));
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "settings.goal", entity: "organization", entityId: ctx.org.id, summary: `Meta mensal: ${g} clientes recuperados`, metadata: { goal: g } });
    });
    revalidatePath("/visao-geral");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteCustomerAction(customerId: string, keepBlocked: boolean) {
  const ctx = await requireCtx("customers:delete");
  await withOrg(ctx.org.id, (tx) => deleteCustomerData(tx, ctx.org.id, customerId, ctx.user.id, keepBlocked));
  revalidatePath("/", "layout");
  redirect("/clientes");
}

export async function reclassifyAction(): Promise<ActionResult<number>> {
  try {
    const ctx = await requireCtx("customers:write");
    const r = await withOrg(ctx.org.id, (tx) => reclassifyOrg(tx, ctx.org));
    revalidatePath("/", "layout");
    return { ok: true, data: r.changed };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Campanhas ─────────────────────────
const CampaignForm = z.object({
  name: z.string().trim().min(3, "Dê um nome à campanha."),
  channel: z.enum(["whatsapp", "email", "sms"]),
  tone: z.string().trim().max(60).optional(),
  offer: z.string().trim().max(200).optional(),
  objective: z.string().trim().max(300).optional(),
  minDays: z.coerce.number().int().min(0).optional(),
  maxDays: z.coerce.number().int().min(0).optional(),
  minPriority: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

export async function createCampaignAction(fd: FormData): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("campaigns:write");
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
    const p = CampaignForm.parse(raw);
    const statuses = fd.getAll("statuses").map(String).filter((s) => ["at_risk", "inactive", "highly_inactive"].includes(s)) as CustomerStatus[];
    const r = await createCampaign(ctx.org.id, {
      name: p.name, channel: p.channel, tone: p.tone, offer: p.offer || null, objective: p.objective || null,
      audience: { statuses: statuses.length ? statuses : undefined, minDaysInactive: p.minDays, maxDaysInactive: p.maxDays, minPriority: p.minPriority, limit: p.limit },
    }, { type: "user", userId: ctx.user.id });
    revalidatePath("/campanhas");
    return { ok: true, data: r.campaign.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return fail(e);
  }
}

export async function updateCampaignCopyAction(campaignId: string, fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("campaigns:write");
    await updateCampaignCopy(ctx.org.id, campaignId, {
      variants: fd.getAll("variant").map(String),
      emailSubject: fd.get("emailSubject") ? String(fd.get("emailSubject")) : undefined,
      name: String(fd.get("name") ?? ""),
    }, { type: "user", userId: ctx.user.id });
    revalidatePath(`/campanhas/${campaignId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function campaignTransitionAction(campaignId: string, action: "submit" | "approve" | "cancel"): Promise<ActionResult> {
  try {
    if (action !== "submit" && action !== "approve" && action !== "cancel") return { ok: false, error: "Ação inválida." };
    const ctx = await requireCtx(action === "approve" ? "campaigns:approve" : "campaigns:write");
    await transitionCampaign(ctx.org.id, campaignId, action, { type: "user", userId: ctx.user.id });
    revalidatePath(`/campanhas/${campaignId}`);
    revalidatePath("/campanhas");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function dispatchCampaignAction(campaignId: string): Promise<ActionResult<DispatchResult>> {
  try {
    const ctx = await requireCtx("campaigns:send");
    const r = await dispatchCampaign(ctx.org.id, campaignId, { type: "user", userId: ctx.user.id });
    revalidatePath(`/campanhas/${campaignId}`);
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

export async function markManualAction(campaignId: string, messageIds: string[]): Promise<ActionResult<number>> {
  try {
    const ctx = await requireCtx("campaigns:send");
    if (!Array.isArray(messageIds)) return { ok: false, error: "Dados inválidos." };
    const n = await markManuallySent(ctx.org.id, campaignId, messageIds.filter((x) => typeof x === "string").slice(0, 1000), { type: "user", userId: ctx.user.id });
    revalidatePath(`/campanhas/${campaignId}`);
    return { ok: true, data: n };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Agente ─────────────────────────
export async function agentAction(conversationId: string, text: string): Promise<ActionResult<AgentReply & { conversationId: string }>> {
  try {
    const ctx = await requireCtx("agent:use");
    const r = await runAgentTurn({ org: ctx.org, userId: ctx.user.id, role: ctx.role }, conversationId, text);
    if (r.actions.length) revalidatePath("/campanhas");
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Configurações ─────────────────────────
export async function saveBusinessAction(fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    const name = String(fd.get("name") ?? "").trim();
    const segment = String(fd.get("segment") ?? "");
    if (name.length < 2) throw new Error("Informe o nome do estabelecimento.");
    if (!SEGMENTS.some((s) => s.id === segment)) throw new Error("Segmento inválido.");
    const resetThresholds = segment !== ctx.org.segment;
    await withOrg(ctx.org.id, async (tx) => {
      const settings = { ...ctx.org.settings, signature: String(fd.get("signature") ?? "").slice(0, 120) };
      if (resetThresholds) delete settings.thresholds; // volta ao padrão do novo segmento
      const [org] = await tx.update(organizations).set({ name, segment, baseSize: String(fd.get("baseSize") ?? "") || ctx.org.baseSize, settings }).where(eq(organizations.id, ctx.org.id)).returning();
      if (resetThresholds) await reclassifyOrg(tx, org);
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "settings.business" });
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveRulesAction(fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    const n = (k: string) => Number(fd.get(k));
    const thresholds = { atRiskDays: n("atRiskDays"), inactiveDays: n("inactiveDays"), highlyInactiveDays: n("highlyInactiveDays") };
    const err = validateThresholds(thresholds);
    if (err) throw new Error(err);
    const patch: Partial<OrgSettings> = { thresholds, useIndividualRhythm: fd.get("useIndividualRhythm") === "on" };
    if (fd.has("frequencyCapDays")) {
      const fc = n("frequencyCapDays"), mm = n("maxMessagesPer30Days"), aw = n("attributionWindowDays");
      if (!(fc >= 1 && fc <= 90 && mm >= 1 && mm <= 10 && aw >= 1 && aw <= 120)) throw new Error("Valores de frequência/atribuição fora do intervalo permitido.");
      Object.assign(patch, {
        frequencyCapDays: fc, maxMessagesPer30Days: mm, attributionWindowDays: aw,
        requireApproval: fd.get("requireApproval") === "on", allowLegitimateInterestEmail: fd.get("allowLegitimateInterestEmail") === "on",
      });
    }
    const retention = fd.has("retentionDays") ? Number(fd.get("retentionDays")) : undefined;
    if (retention !== undefined && !(retention >= 180 && retention <= 3650)) throw new Error("Retenção deve ficar entre 180 e 3650 dias.");
    await withOrg(ctx.org.id, async (tx) => {
      const [org] = await tx.update(organizations).set({ settings: { ...ctx.org.settings, ...patch }, ...(retention ? { dataRetentionDays: retention } : {}) })
        .where(eq(organizations.id, ctx.org.id)).returning();
      await reclassifyOrg(tx, org);
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "settings.rules", metadata: { thresholds } });
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function blocklistAction(op: "add" | "remove", value: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("customers:write");
    const v = normalizePhone(value) ?? normEmail(value);
    if (!v) throw new Error("Informe um telefone ou e-mail válido.");
    await withOrg(ctx.org.id, async (tx) => {
      if (op === "add") await tx.insert(blocklist).values({ orgId: ctx.org.id, value: v, reason: "Adicionado manualmente" }).onConflictDoNothing();
      else await tx.delete(blocklist).where(and(eq(blocklist.orgId, ctx.org.id), eq(blocklist.value, v)));
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: `blocklist.${op}` });
    });
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addMemberAction(fd: FormData): Promise<ActionResult<{ tempPassword?: string }>> {
  try {
    const ctx = await requireCtx("members:write");
    const email = normalizeEmail(String(fd.get("email") ?? ""));
    const role = String(fd.get("role")) as Role;
    if (!["admin", "manager", "viewer"].includes(role)) throw new Error("Papel inválido.");
    if (!z.string().email().safeParse(email).success) throw new Error("E-mail inválido.");
    const db = await getDb();
    const plan = await withOrg(ctx.org.id, (tx) => getPlan(tx, ctx.org.planId));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.orgId, ctx.org.id));
    if (Number(n) >= plan.limits.members) throw new Error(`O plano ${plan.name} permite até ${plan.limits.members} usuários.`);
    let [user] = await db.select().from(users).where(eq(users.email, email));
    let tempPassword: string | undefined;
    if (!user) {
      tempPassword = randomToken(9);
      [user] = await db.insert(users).values({ email, name: String(fd.get("name") ?? email.split("@")[0]), passwordHash: await hashPassword(tempPassword) }).returning();
    }
    await db.insert(memberships).values({ userId: user.id, orgId: ctx.org.id, role }).onConflictDoUpdate({ target: [memberships.userId, memberships.orgId], set: { role } });
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "member.add", entityId: user.id, metadata: { role } }));
    revalidatePath("/configuracoes");
    return { ok: true, data: { tempPassword } };
  } catch (e) { return fail(e); }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("members:write");
    if (userId === ctx.user.id) throw new Error("Você não pode remover a si mesmo.");
    const db = await getDb();
    const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
    if (m?.role === "owner") throw new Error("O proprietário não pode ser removido.");
    await db.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "member.remove", entityId: userId }));
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Integrações ─────────────────────────
export async function saveIntegrationAction(provider: Provider, fd: FormData): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("integrations:write");
    const def = PROVIDER_FIELDS[provider];
    if (!def) throw new Error("Provedor inválido.");
    const config: Record<string, string> = {};
    for (const f of def.fields) {
      const v = String(fd.get(f.key) ?? "").trim();
      if (f.required && !v) throw new Error(`Preencha: ${f.label}.`);
      if (v) config[f.key] = v.slice(0, 200);
    }
    const secret = String(fd.get("secret") ?? "").trim();
    const db = await getDb();
    const [existing] = await db.select().from(integrations).where(and(eq(integrations.orgId, ctx.org.id), eq(integrations.provider, provider)));
    if (!secret && !existing?.secretEncrypted) throw new Error(`Informe: ${def.secretLabel}.`);
    const secretEncrypted = secret ? encryptSecret(secret) : existing!.secretEncrypted;
    // Testa a conexão com a credencial antes de salvar.
    const msg = await buildAdapter(provider, config, decryptSecret(secretEncrypted!), ctx.org.id).test();
    await db.insert(integrations).values({ orgId: ctx.org.id, provider, config, secretEncrypted, status: "configured" })
      .onConflictDoUpdate({ target: [integrations.orgId, integrations.provider], set: { config, secretEncrypted, status: "configured", updatedAt: new Date() } });
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "integration.save", entity: "integration", entityId: provider }));
    revalidatePath("/integracoes");
    return { ok: true, data: msg };
  } catch (e) {
    if (e instanceof ChannelError) return { ok: false, error: `O provedor recusou a credencial: ${e.message}` };
    return fail(e);
  }
}

export async function removeIntegrationAction(provider: Provider): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("integrations:write");
    const db = await getDb();
    await db.delete(integrations).where(and(eq(integrations.orgId, ctx.org.id), eq(integrations.provider, provider)));
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "integration.remove", entityId: provider }));
    revalidatePath("/integracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function createApiKeyAction(name: string): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("integrations:write");
    const plan = await withOrg(ctx.org.id, (tx) => getPlan(tx, ctx.org.planId));
    if (!plan.limits.apiAccess) throw new Error(`A API está disponível a partir do plano Profissional.`);
    const key = `gv_${randomToken(24)}`;
    const db = await getDb();
    await db.insert(apiKeys).values({ orgId: ctx.org.id, name: name.trim().slice(0, 60) || "Integração", prefix: key.slice(0, 9), keyHash: sha256(key) });
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "api_key.create" }));
    revalidatePath("/integracoes");
    return { ok: true, data: key };
  } catch (e) { return fail(e); }
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("integrations:write");
    const db = await getDb();
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, ctx.org.id)));
    revalidatePath("/integracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Automações ─────────────────────────
export async function createAutomationAction(fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("automations:write");
    const trigger = String(fd.get("triggerStatus")) as "at_risk" | "inactive" | "highly_inactive";
    const channel = String(fd.get("channel")) as Channel;
    if (!["at_risk", "inactive", "highly_inactive"].includes(trigger) || !["whatsapp", "email", "sms"].includes(channel)) throw new Error("Dados inválidos.");
    await withOrg(ctx.org.id, async (tx) => {
      const plan = await getPlan(tx, ctx.org.planId);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(automations).where(eq(automations.orgId, ctx.org.id));
      if (Number(n) >= plan.limits.automations) throw new Error(plan.limits.automations ? `O plano ${plan.name} permite ${plan.limits.automations} automações.` : "Automações estão disponíveis a partir do plano Profissional.");
      const [a] = await tx.insert(automations).values({
        orgId: ctx.org.id, name: String(fd.get("name") ?? "").trim() || "Automação", triggerStatus: trigger, channel,
        tone: String(fd.get("tone") ?? "acolhedor"), offer: String(fd.get("offer") ?? "").trim() || null,
        requiresApproval: fd.get("requiresApproval") === "on" || !can(ctx.role, "campaigns:approve"),
      }).returning();
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "automation.create", entityId: a.id });
    });
    revalidatePath("/automacoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function toggleAutomationAction(id: string, op: "toggle" | "delete"): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("automations:write");
    await withOrg(ctx.org.id, async (tx) => {
      if (op === "delete") await tx.delete(automations).where(and(eq(automations.id, id), eq(automations.orgId, ctx.org.id)));
      else await tx.update(automations).set({ enabled: sql`not ${automations.enabled}` }).where(and(eq(automations.id, id), eq(automations.orgId, ctx.org.id)));
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: `automation.${op}`, entityId: id });
    });
    revalidatePath("/automacoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Onboarding ─────────────────────────
export async function onboardingStepAction(step: number, fd: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    await withOrg(ctx.org.id, async (tx) => {
      const patch: Partial<typeof organizations.$inferInsert> = { onboardingStep: Math.max(ctx.org.onboardingStep, step + 1) };
      if (step === 1) {
        const name = String(fd.get("name") ?? "").trim();
        if (name.length < 2) throw new Error("Informe o nome do estabelecimento.");
        patch.name = name;
      }
      if (step === 2) {
        const segment = String(fd.get("segment"));
        if (!SEGMENTS.some((s) => s.id === segment)) throw new Error("Selecione um segmento.");
        patch.segment = segment;
        const settings = { ...ctx.org.settings };
        delete settings.thresholds;
        patch.settings = settings;
      }
      if (step === 3) patch.baseSize = String(fd.get("baseSize") ?? "") || null;
      if (step === 7) patch.onboardingDone = true;
      await tx.update(organizations).set(patch).where(eq(organizations.id, ctx.org.id));
    });
    revalidatePath("/onboarding");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function skipOnboardingAction() {
  const ctx = await requireCtx();
  const db = await getDb();
  await db.update(organizations).set({ onboardingDone: true }).where(eq(organizations.id, ctx.org.id));
  redirect("/visao-geral");
}

// ───────────────────────── Assinatura (Asaas) ─────────────────────────
// O navegador nunca ativa plano: estas ações só criam/alteram/cancelam a cobrança no Asaas.
// A ativação acontece no webhook /api/webhooks/asaas, após reconsulta da cobrança.
const subscribeSchema = z.object({
  planId: z.string().min(1).max(40),
  name: z.string().trim().min(3, "Informe o nome ou razão social.").max(120),
  email: z.string().trim().email("E-mail de cobrança inválido.").max(160),
  document: z.string().trim().min(11, "Informe CPF ou CNPJ.").max(20),
});

export async function subscribeAction(fd: FormData): Promise<ActionResult<{ invoiceUrl: string | null; changedOnly: boolean }>> {
  try {
    const ctx = await requireCtx("settings:write");
    const input = subscribeSchema.parse(Object.fromEntries(fd));
    const { startSubscription } = await import("@/lib/billing/service");
    const r = await startSubscription({ orgId: ctx.org.id, userId: ctx.user.id, ...input });
    revalidatePath("/configuracoes");
    return { ok: true, data: r };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    return fail(e);
  }
}

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    const { cancelSubscription } = await import("@/lib/billing/service");
    await cancelSubscription(ctx.org.id, ctx.user.id);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function refreshPaymentsAction(): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    const { syncPayments } = await import("@/lib/billing/service");
    const db = await getDb();
    const { subscriptions } = await import("@/db/schema");
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id));
    if (s?.providerSubscriptionId) await syncPayments(ctx.org.id, s.providerSubscriptionId);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Verificação de e-mail ─────────────────────────
export async function resendVerificationAction(): Promise<void> {
  const ctx = await requireCtx();
  const { rateLimit } = await import("@/lib/rate-limit");
  if (!rateLimit(`verify:${ctx.user.id}`, 3, 3600_000).ok) return;
  const { sendVerificationEmail } = await import("@/lib/auth/tokens");
  await sendVerificationEmail(ctx.user.id);
}
