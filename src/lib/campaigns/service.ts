/**
 * Ciclo de vida da campanha: criar (rascunho) → enviar p/ aprovação → aprovar → disparar.
 * Chamadas de rede (IA e canais) acontecem fora de transações do banco.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import {
  campaignMessages, campaigns, customers, organizations,
  type Audience, type Campaign, type Channel, type CustomerStatus, type Organization,
} from "@/db/schema";
import { resolveSettings, type OrgSettings } from "@/lib/settings";
import { customerWhere, getBlockedSet, getContactHistory } from "@/lib/customers";
import { LAPSED } from "@/lib/classification";
import { today, daysBetween } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { consumeAiQuota, getPlan, getUsage, incrementUsage, PlanLimitError } from "@/lib/plans";
import { assertBillingActive } from "@/lib/billing/service";
import { aiEnabled } from "@/lib/ai/client";
import { unsubscribeToken } from "@/lib/crypto";
import { firstName } from "@/lib/format";
import { getAdapter, CHANNEL_LABEL, ChannelError } from "@/lib/channels";
import { checkEligibility, contactAddress, optOutFooter } from "./compliance";
import { generateCopy, type AudienceProfile, type GeneratedCopy } from "./generator";
import { renderMessage } from "./templates";

export const MAX_AUDIENCE = 5000;

export interface Actor { type: "user" | "agent" | "automation"; userId: string | null }

export interface CreateCampaignInput {
  name: string;
  audience: Audience;
  channel: Channel;
  tone?: string;
  offer?: string | null;
  objective?: string | null;
  variants?: string[];
  emailSubject?: string | null;
  automationId?: string | null;
  requiresApproval?: boolean;
}

async function loadOrg(tx: Tx, orgId: string) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new Error("Empresa não encontrada");
  return org;
}

export async function selectAudience(tx: Tx, orgId: string, a: Audience) {
  const statuses = a.customerIds?.length ? a.statuses : (a.statuses?.length ? a.statuses : LAPSED);
  return tx.select().from(customers)
    .where(customerWhere(orgId, { ...a, statuses }))
    .orderBy(desc(customers.priorityScore), asc(customers.lastVisitAt))
    .limit(Math.min(a.limit ?? MAX_AUDIENCE, MAX_AUDIENCE));
}

export function profileOf(list: (typeof customers.$inferSelect)[], todayStr = today()): AudienceProfile {
  const top = (vals: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  const days = list.filter((c) => c.lastVisitAt).map((c) => daysBetween(c.lastVisitAt!, todayStr));
  return {
    count: list.length,
    statuses: [...new Set(list.map((c) => c.status))] as CustomerStatus[],
    avgDaysSince: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    avgTicketCents: list.length ? Math.round(list.reduce((a, c) => a + c.avgTicketCents, 0) / list.length) : 0,
    topServices: top(list.map((c) => c.favoriteService)),
    topStaff: top(list.map((c) => c.preferredStaff)),
  };
}

export function composeBody(template: string, c: typeof customers.$inferSelect, org: Organization, s: OrgSettings, channel: Channel, offer: string | null) {
  const text = renderMessage(template, {
    name: c.name, business: org.name, offer, service: c.favoriteService, staff: c.preferredStaff,
  });
  const sig = s.signature?.trim() ? `\n${s.signature.trim()}` : "";
  return `${text}${sig}${optOutFooter(channel)}`;
}

/** Monta as mensagens individuais, aplicando as regras de compliance a cada cliente. */
async function buildMessages(tx: Tx, org: Organization, s: OrgSettings, campaign: Campaign, list: (typeof customers.$inferSelect)[]) {
  const blocked = await getBlockedSet(tx, org.id);
  const history = await getContactHistory(tx, org.id, list.map((c) => c.id));
  const t = today();
  const rows = list.map((c, i) => {
    const elig = checkEligibility(c, campaign.channel, s, blocked, history.get(c.id) ?? { lastSentAt: null, sentLast30Days: 0 }, t);
    const variantIndex = i % Math.max(1, campaign.variants.length);
    return {
      orgId: org.id, campaignId: campaign.id, customerId: c.id, channel: campaign.channel, variantIndex,
      body: composeBody(campaign.variants[variantIndex] ?? "", c, org, s, campaign.channel, campaign.offer),
      status: elig.ok ? ("queued" as const) : ("skipped" as const),
      skipReason: elig.ok ? null : elig.reason,
    };
  });
  for (let i = 0; i < rows.length; i += 500) await tx.insert(campaignMessages).values(rows.slice(i, i + 500));
  return { queued: rows.filter((r) => r.status === "queued").length, skipped: rows.filter((r) => r.status === "skipped").length };
}

export interface CreateResult { campaign: Campaign; queued: number; skipped: number; copy: GeneratedCopy | null; notice?: string }

export async function createCampaign(orgId: string, input: CreateCampaignInput, actor: Actor): Promise<CreateResult> {
  // 1) Público e perfil (leitura)
  const { org, list, aiAllowed } = await withOrg(orgId, async (tx) => {
    const org = await loadOrg(tx, orgId);
    await assertBillingActive(tx, orgId);
    const plan = await getPlan(tx, org.planId);
    if (!plan.limits.channels.includes(input.channel))
      throw new PlanLimitError(`O canal ${CHANNEL_LABEL[input.channel]} não está incluído no plano ${plan.name}.`);
    const list = await selectAudience(tx, orgId, input.audience);
    let aiAllowed = false;
    if (!input.variants?.length && aiEnabled()) {
      try { await consumeAiQuota(tx, orgId, org.planId); aiAllowed = true; } catch (e) { if (!(e instanceof PlanLimitError)) throw e; }
    }
    return { org, list, aiAllowed };
  });
  if (!list.length) throw new Error("Nenhum cliente corresponde a este público.");
  const s = resolveSettings(org);

  // 2) Texto (fora da transação)
  let copy: GeneratedCopy | null = null;
  let notice: string | undefined;
  if (!input.variants?.length) {
    const profile = profileOf(list);
    copy = await generateCopy({
      businessName: org.name, segmentId: org.segment, channel: input.channel, tone: input.tone ?? "acolhedor",
      offer: input.offer ?? null, objective: input.objective ?? null, profile, useAi: aiAllowed,
    });
    if (!aiAllowed && aiEnabled()) notice = "Cota mensal de IA do plano esgotada — usamos os modelos do segmento.";
    notice = copy.notice ?? notice;
  }
  const variants = input.variants?.length ? input.variants : copy!.variants;

  // 3) Gravação
  return withOrg(orgId, async (tx) => {
    const [campaign] = await tx.insert(campaigns).values({
      orgId, name: input.name.slice(0, 120), objective: input.objective ?? null, audience: input.audience,
      channel: input.channel, tone: input.tone ?? "acolhedor", offer: input.offer ?? null, variants,
      emailSubject: input.emailSubject ?? copy?.subject ?? null,
      requiresApproval: input.requiresApproval ?? s.requireApproval,
      generatedBy: input.variants?.length ? "user" : copy!.generatedBy,
      rationale: copy?.rationale ?? null, createdByType: actor.type, createdBy: actor.userId, automationId: input.automationId ?? null,
    }).returning();
    const counts = await buildMessages(tx, org, s, campaign, list);
    await audit(tx, {
      orgId, actorType: actor.type === "automation" ? "system" : actor.type, actorId: actor.userId,
      action: "campaign.create", entity: "campaign", entityId: campaign.id,
      summary: `Campanha "${campaign.name}" criada: ${counts.queued} elegíveis, ${counts.skipped} bloqueados por regras de contato`,
    });
    return { campaign, ...counts, copy, notice };
  });
}

const EDITABLE: Campaign["status"][] = ["draft", "pending_approval"];

/** Atualiza textos e re-renderiza as mensagens ainda não enviadas. */
export async function updateCampaignCopy(orgId: string, campaignId: string, data: { variants: string[]; emailSubject?: string | null; offer?: string | null; name?: string }, actor: Actor) {
  return withOrg(orgId, async (tx) => {
    const org = await loadOrg(tx, orgId);
    const s = resolveSettings(org);
    const [c] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
    if (!c) throw new Error("Campanha não encontrada");
    if (!EDITABLE.includes(c.status)) throw new Error("Só é possível editar campanhas em rascunho ou aguardando aprovação.");
    const variants = data.variants.map((v) => v.trim()).filter(Boolean).slice(0, 5);
    if (!variants.length) throw new Error("Informe ao menos uma mensagem.");
    const [updated] = await tx.update(campaigns).set({
      variants, emailSubject: data.emailSubject ?? c.emailSubject, offer: data.offer === undefined ? c.offer : data.offer,
      name: data.name?.trim() || c.name, status: "draft", approvedAt: null, approvedBy: null,
    }).where(eq(campaigns.id, c.id)).returning();
    const msgs = await tx.select({ m: campaignMessages, c: customers }).from(campaignMessages)
      .innerJoin(customers, eq(customers.id, campaignMessages.customerId))
      .where(and(eq(campaignMessages.campaignId, c.id), inArray(campaignMessages.status, ["queued", "skipped"])));
    for (const { m, c: cust } of msgs) {
      const vi = m.variantIndex % variants.length;
      await tx.update(campaignMessages).set({ variantIndex: vi, body: composeBody(variants[vi], cust, org, s, c.channel, updated.offer) })
        .where(eq(campaignMessages.id, m.id));
    }
    await audit(tx, { orgId, actorType: actor.type === "automation" ? "system" : actor.type, actorId: actor.userId, action: "campaign.edit", entity: "campaign", entityId: c.id });
    return updated;
  });
}

export async function transitionCampaign(orgId: string, campaignId: string, action: "submit" | "approve" | "cancel", actor: Actor) {
  return withOrg(orgId, async (tx) => {
    const [c] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
    if (!c) throw new Error("Campanha não encontrada");
    let patch: Partial<Campaign> = {};
    if (action === "submit") {
      if (c.status !== "draft") throw new Error("A campanha não está em rascunho.");
      patch = c.requiresApproval ? { status: "pending_approval" } : { status: "approved", approvedAt: new Date(), approvedBy: actor.userId };
    } else if (action === "approve") {
      if (c.status !== "pending_approval" && c.status !== "draft") throw new Error("A campanha não está aguardando aprovação.");
      if (actor.type !== "user") throw new Error("A aprovação precisa ser feita por uma pessoa.");
      patch = { status: "approved", approvedAt: new Date(), approvedBy: actor.userId };
    } else {
      if (c.status === "completed" || c.status === "cancelled") throw new Error("Campanha já finalizada.");
      patch = { status: "cancelled", completedAt: new Date() };
      await tx.update(campaignMessages).set({ status: "skipped", skipReason: "cancelled" })
        .where(and(eq(campaignMessages.campaignId, c.id), eq(campaignMessages.status, "queued")));
    }
    const [u] = await tx.update(campaigns).set(patch).where(eq(campaigns.id, c.id)).returning();
    await audit(tx, { orgId, actorType: actor.type === "automation" ? "system" : actor.type, actorId: actor.userId, action: `campaign.${action}`, entity: "campaign", entityId: c.id });
    return u;
  });
}

export interface DispatchResult { sent: number; failed: number; skipped: number; remaining: number; notConfigured?: boolean; errors: string[] }

/** Dispara as mensagens na fila pelo canal configurado. Revalida elegibilidade no momento do envio. */
export async function dispatchCampaign(orgId: string, campaignId: string, actor: Actor, batchSize = 200): Promise<DispatchResult> {
  const prep = await withOrg(orgId, async (tx) => {
    const org = await loadOrg(tx, orgId);
    const s = resolveSettings(org);
    const [c] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
    if (!c) throw new Error("Campanha não encontrada");
    if (c.status !== "approved" && c.status !== "sending") throw new Error("A campanha precisa estar aprovada para ser enviada.");
    await assertBillingActive(tx, orgId);
    const adapter = await getAdapter(tx, orgId, c.channel);
    if (!adapter) return { notConfigured: true as const };
    const plan = await getPlan(tx, org.planId);
    const usage = await getUsage(tx, orgId);
    const quota = Math.max(0, plan.limits.messagesPerMonth - usage.messagesSent);
    const queue = await tx.select({ m: campaignMessages, c: customers }).from(campaignMessages)
      .innerJoin(customers, eq(customers.id, campaignMessages.customerId))
      .where(and(eq(campaignMessages.campaignId, c.id), eq(campaignMessages.status, "queued"))).limit(Math.min(batchSize, quota));
    const blocked = await getBlockedSet(tx, orgId);
    const history = await getContactHistory(tx, orgId, queue.map((q) => q.c.id));
    await tx.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, c.id));
    return { org, s, c, adapter, queue, blocked, history, quota };
  });
  if ("notConfigured" in prep) return { sent: 0, failed: 0, skipped: 0, remaining: 0, notConfigured: true, errors: [] };

  const { org, s, c, adapter, queue, blocked, history } = prep;
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0, remaining: 0, errors: [] };
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const t = today();
  for (const { m, c: cust } of queue) {
    const elig = checkEligibility(cust, c.channel, s, blocked, history.get(cust.id) ?? { lastSentAt: null, sentLast30Days: 0 }, t);
    if (!elig.ok) {
      await withOrg(orgId, (tx) => tx.update(campaignMessages).set({ status: "skipped", skipReason: elig.reason }).where(eq(campaignMessages.id, m.id)));
      result.skipped++; continue;
    }
    try {
      const r = await adapter.send({
        to: contactAddress(cust, c.channel)!, body: m.body, subject: c.emailSubject, firstName: firstName(cust.name),
        unsubscribeUrl: `${appUrl}/descadastro/${unsubscribeToken(orgId, cust.id)}`, businessName: org.name,
      });
      await withOrg(orgId, async (tx) => {
        await tx.update(campaignMessages).set({ status: "sent", sentAt: new Date(), sentVia: "api", providerMessageId: r.providerMessageId, error: null }).where(eq(campaignMessages.id, m.id));
        await incrementUsage(tx, orgId, "messagesSent");
      });
      history.set(cust.id, { lastSentAt: new Date(), sentLast30Days: (history.get(cust.id)?.sentLast30Days ?? 0) + 1 });
      result.sent++;
    } catch (e) {
      const msg = e instanceof ChannelError ? e.message : "Falha de comunicação com o provedor";
      await withOrg(orgId, (tx) => tx.update(campaignMessages).set({ status: "failed", error: msg.slice(0, 300) }).where(eq(campaignMessages.id, m.id)));
      result.failed++;
      if (result.errors.length < 5) result.errors.push(msg);
    }
  }
  return withOrg(orgId, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(campaignMessages)
      .where(and(eq(campaignMessages.campaignId, c.id), eq(campaignMessages.status, "queued")));
    result.remaining = Number(n);
    if (!result.remaining) await tx.update(campaigns).set({ status: "completed", completedAt: new Date() }).where(eq(campaigns.id, c.id));
    await audit(tx, { orgId, actorType: actor.type === "automation" ? "system" : actor.type, actorId: actor.userId, action: "campaign.dispatch", entity: "campaign", entityId: c.id, summary: `${result.sent} enviadas, ${result.failed} falhas, ${result.skipped} bloqueadas na revalidação` });
    return result;
  });
}

/**
 * Envio assistido: quando não há API configurada, a equipe envia pelo próprio WhatsApp (link wa.me)
 * e marca aqui. As regras de compliance continuam valendo (só mensagens "queued" podem ser marcadas).
 */
export async function markManuallySent(orgId: string, campaignId: string, messageIds: string[], actor: Actor) {
  return withOrg(orgId, async (tx) => {
    const [c] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
    if (!c) throw new Error("Campanha não encontrada");
    if (c.status !== "approved" && c.status !== "sending") throw new Error("A campanha precisa estar aprovada.");
    const updated = await tx.update(campaignMessages).set({ status: "sent", sentAt: new Date(), sentVia: "manual" })
      .where(and(eq(campaignMessages.campaignId, c.id), eq(campaignMessages.status, "queued"), inArray(campaignMessages.id, messageIds)))
      .returning({ id: campaignMessages.id });
    if (updated.length) await incrementUsage(tx, orgId, "messagesSent", updated.length);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(campaignMessages)
      .where(and(eq(campaignMessages.campaignId, c.id), eq(campaignMessages.status, "queued")));
    await tx.update(campaigns).set(Number(n) ? { status: "sending" } : { status: "completed", completedAt: new Date() }).where(eq(campaigns.id, c.id));
    await audit(tx, { orgId, actorType: "user", actorId: actor.userId, action: "campaign.manual_sent", entity: "campaign", entityId: c.id, summary: `${updated.length} marcadas como enviadas manualmente` });
    return updated.length;
  });
}
