/** Serviços de clientes: reclassificação, visitas, atribuição de retorno, consentimento. */
import { and, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  blocklist, campaignMessages, consentEvents, customers, recoveries, visits,
  type Channel, type CustomerStatus, type Organization,
} from "@/db/schema";
import { classify, median, priorityScore } from "./classification";
import { hasChannelPermission, type ContactHistory } from "./campaigns/compliance";
import { addDays, dayOf, today } from "./dates";
import { resolveSettings, type OrgSettings } from "./settings";
import { audit } from "./audit";

export interface Transition { customerId: string; from: CustomerStatus; to: CustomerStatus }

/** Recalcula status e score de todos os clientes da empresa. Retorna as mudanças de status. */
export async function reclassifyOrg(tx: Tx, org: Pick<Organization, "id" | "segment" | "settings">, todayStr = today()) {
  const s = resolveSettings(org);
  const rows = await tx.select({
    id: customers.id, status: customers.status, lastVisitAt: customers.lastVisitAt, firstVisitAt: customers.firstVisitAt,
    visitCount: customers.visitCount, recoveredAt: customers.recoveredAt, avgTicketCents: customers.avgTicketCents,
    lastContactAt: customers.lastContactAt,
    priorityScore: customers.priorityScore, phone: customers.phone, email: customers.email, optedOutAt: customers.optedOutAt,
    consentWhatsapp: customers.consentWhatsapp, consentEmail: customers.consentEmail, consentSms: customers.consentSms,
    legalBasis: customers.legalBasis,
  }).from(customers).where(eq(customers.orgId, org.id));

  const med = median(rows.map((r) => r.avgTicketCents));
  const transitions: Transition[] = [];
  const updates: { id: string; status: CustomerStatus; score: number }[] = [];
  for (const r of rows) {
    const cl = classify(r, s, todayStr);
    const contactable = !r.optedOutAt && (["whatsapp", "email", "sms"] as Channel[])
      .some((ch) => (ch === "email" ? r.email : r.phone) && hasChannelPermission(r, ch, s));
    const score = priorityScore({ ...cl, avgTicketCents: r.avgTicketCents, visitCount: r.visitCount, contactable }, med);
    if (cl.status !== r.status || score !== r.priorityScore) updates.push({ id: r.id, status: cl.status, score });
    if (cl.status !== r.status) transitions.push({ customerId: r.id, from: r.status, to: cl.status });
  }
  for (let i = 0; i < updates.length; i += 1000) {
    const chunk = updates.slice(i, i + 1000);
    const values = sql.join(chunk.map((u) => sql`(${u.id}::uuid, ${u.status}::text, ${u.score}::int)`), sql`, `);
    await tx.execute(sql`
      update customers c set
        status_changed_at = case when c.status <> v.status then now() else c.status_changed_at end,
        status = v.status, priority_score = v.score, updated_at = now()
      from (values ${values}) as v(id, status, score)
      where c.id = v.id and c.org_id = ${org.id}`);
  }
  return { total: rows.length, changed: updates.length, transitions };
}

/**
 * Atribui um retorno à campanha mais recente enviada ao cliente dentro da janela de atribuição.
 * Sem mensagem enviada na janela → retorno orgânico (não conta como recuperação).
 */
export async function attributeReturn(
  tx: Tx, orgId: string, s: OrgSettings,
  input: { customerId: string; visitDate: string; revenueCents: number; visitId: string | null },
) {
  const windowStart = addDays(input.visitDate, -s.attributionWindowDays);
  const [msg] = await tx.select().from(campaignMessages).where(and(
    eq(campaignMessages.orgId, orgId), eq(campaignMessages.customerId, input.customerId),
    inArray(campaignMessages.status, ["sent", "delivered", "read", "replied"]), isNotNull(campaignMessages.sentAt),
    gte(campaignMessages.sentAt, new Date(`${windowStart}T00:00:00-03:00`)),
  )).orderBy(desc(campaignMessages.sentAt)).limit(1);
  if (!msg || !msg.sentAt || dayOf(msg.sentAt) > input.visitDate) return null;
  const [already] = await tx.select({ id: recoveries.id }).from(recoveries)
    .where(and(eq(recoveries.orgId, orgId), eq(recoveries.messageId, msg.id)));
  if (already) return null;
  const [rec] = await tx.insert(recoveries).values({
    orgId, customerId: input.customerId, campaignId: msg.campaignId, messageId: msg.id, visitId: input.visitId,
    returnedAt: input.visitDate, revenueCents: input.revenueCents,
  }).returning();
  await tx.update(customers).set({ recoveredAt: new Date(), status: "recovered", statusChangedAt: new Date() })
    .where(and(eq(customers.id, input.customerId), eq(customers.orgId, orgId)));
  return rec;
}

/** Registra visita/compra, atualiza métricas do cliente e verifica atribuição a campanha. */
export async function recordVisit(
  tx: Tx, org: Pick<Organization, "id" | "segment" | "settings">, customerId: string,
  input: { date: string; amountCents: number; description?: string | null; source: string },
) {
  const [c] = await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, org.id)));
  if (!c) throw new Error("Cliente não encontrado");
  const [visit] = await tx.insert(visits).values({
    orgId: org.id, customerId, occurredAt: input.date, amountCents: input.amountCents,
    description: input.description ?? null, source: input.source,
  }).returning();
  const visitCount = c.visitCount + 1;
  const totalSpentCents = c.totalSpentCents + input.amountCents;
  await tx.update(customers).set({
    visitCount, totalSpentCents,
    avgTicketCents: input.amountCents > 0 || c.totalSpentCents > 0 ? Math.round(totalSpentCents / visitCount) : c.avgTicketCents,
    lastVisitAt: !c.lastVisitAt || input.date > c.lastVisitAt ? input.date : c.lastVisitAt,
    firstVisitAt: !c.firstVisitAt || input.date < c.firstVisitAt ? input.date : c.firstVisitAt,
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId));
  const recovery = await attributeReturn(tx, org.id, resolveSettings(org), {
    customerId, visitDate: input.date, revenueCents: input.amountCents, visitId: visit.id,
  });
  await reclassifyOne(tx, org, customerId);
  return { visit, recovery };
}

export async function reclassifyOne(tx: Tx, org: Pick<Organization, "id" | "segment" | "settings">, customerId: string) {
  const s = resolveSettings(org);
  const [c] = await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, org.id)));
  if (!c) return;
  const cl = classify(c, s, today());
  const lapsed = cl.status === "at_risk" || cl.status === "inactive" || cl.status === "highly_inactive";
  let score = 0;
  if (lapsed) {
    // Mesmo cálculo da reclassificação completa: o cliente que acabou de ficar inativo já entra com potencial de retorno.
    const tickets = await tx.select({ t: customers.avgTicketCents }).from(customers).where(eq(customers.orgId, org.id));
    const contactable = !c.optedOutAt && (["whatsapp", "email", "sms"] as Channel[])
      .some((ch) => (ch === "email" ? c.email : c.phone) && hasChannelPermission(c, ch, s));
    score = priorityScore({ ...cl, avgTicketCents: c.avgTicketCents, visitCount: c.visitCount, contactable }, median(tickets.map((r) => r.t)));
  }
  if (cl.status !== c.status || c.priorityScore !== score)
    await tx.update(customers).set({
      status: cl.status, ...(cl.status !== c.status ? { statusChangedAt: new Date() } : {}), priorityScore: score,
    }).where(eq(customers.id, customerId));
}

export async function getContactHistory(tx: Tx, orgId: string, customerIds: string[]) {
  const map = new Map<string, ContactHistory>();
  if (!customerIds.length) return map;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await tx.select({
    customerId: campaignMessages.customerId,
    lastSentAt: sql<Date | null>`max(${campaignMessages.sentAt})`,
    sent30: sql<number>`count(*) filter (where ${campaignMessages.sentAt} >= ${since})`,
  }).from(campaignMessages)
    .where(and(eq(campaignMessages.orgId, orgId), isNotNull(campaignMessages.sentAt)))
    .groupBy(campaignMessages.customerId);
  const wanted = new Set(customerIds);
  for (const r of rows) {
    if (!wanted.has(r.customerId)) continue;
    map.set(r.customerId, { lastSentAt: r.lastSentAt ? new Date(r.lastSentAt) : null, sentLast30Days: Number(r.sent30) });
  }
  return map;
}

export async function getBlockedSet(tx: Tx, orgId: string) {
  const rows = await tx.select({ value: blocklist.value }).from(blocklist).where(eq(blocklist.orgId, orgId));
  return new Set(rows.map((r) => r.value));
}

/** Opt-out: revoga todos os canais, registra evento e cancela mensagens pendentes. */
export async function optOutCustomer(tx: Tx, orgId: string, customerId: string, source: string, actor: string) {
  const [c] = await tx.update(customers).set({
    optedOutAt: new Date(), consentWhatsapp: false, consentEmail: false, consentSms: false, updatedAt: new Date(),
  }).where(and(eq(customers.id, customerId), eq(customers.orgId, orgId))).returning({ id: customers.id });
  if (!c) return false;
  for (const channel of ["whatsapp", "email", "sms"])
    await tx.insert(consentEvents).values({ orgId, customerId, channel, action: "revoked", source, actor });
  await tx.update(campaignMessages).set({ status: "skipped", skipReason: "opted_out" })
    .where(and(eq(campaignMessages.orgId, orgId), eq(campaignMessages.customerId, customerId), eq(campaignMessages.status, "queued")));
  await audit(tx, { orgId, actorType: actor === "customer" ? "system" : "user", action: "customer.opt_out", entity: "customer", entityId: customerId, summary: `Opt-out via ${source}` });
  return true;
}

export async function setConsent(
  tx: Tx, orgId: string, customerId: string, channel: Channel, granted: boolean,
  meta: { source: string; actor: string; legalBasis?: "consent" | "legitimate_interest" },
) {
  if (channel !== "whatsapp" && channel !== "email" && channel !== "sms") throw new Error("Canal inválido.");
  const patch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  if (channel === "whatsapp") patch.consentWhatsapp = granted;
  if (channel === "email") patch.consentEmail = granted;
  if (channel === "sms") patch.consentSms = granted;
  if (granted) {
    patch.consentAt = new Date(); patch.consentSource = meta.source; patch.legalBasis = meta.legalBasis ?? "consent"; patch.optedOutAt = null;
  }
  const [hit] = await tx.update(customers).set(patch).where(and(eq(customers.id, customerId), eq(customers.orgId, orgId))).returning({ id: customers.id });
  if (!hit) throw new Error("Cliente não encontrado.");
  await tx.insert(consentEvents).values({
    orgId, customerId, channel, action: granted ? "granted" : "revoked", legalBasis: meta.legalBasis ?? "consent", source: meta.source, actor: meta.actor,
  });
}

export interface CustomerFilter {
  statuses?: CustomerStatus[];
  search?: string;
  minDaysInactive?: number;
  maxDaysInactive?: number;
  minAvgTicketCents?: number;
  minPriority?: number;
  customerIds?: string[];
  tag?: string;
  minVisits?: number;
  minSpentCents?: number;
  /** Só quem pode receber mensagem em algum canal (não descadastrado e com autorização). */
  contactable?: boolean;
}

export function customerWhere(orgId: string, f: CustomerFilter, todayStr = today()): SQL {
  const conds: SQL[] = [sql`${customers.orgId} = ${orgId}`];
  if (f.statuses?.length) conds.push(inArray(customers.status, f.statuses));
  if (f.search) {
    const q = `%${f.search.trim().toLowerCase()}%`;
    conds.push(sql`(lower(${customers.name}) like ${q} or ${customers.phone} like ${q} or lower(coalesce(${customers.email}, '')) like ${q})`);
  }
  // Última atividade = visita ou contato mais recente (GREATEST ignora nulos).
  const activity = sql`greatest(${customers.lastVisitAt}, (${customers.lastContactAt} at time zone 'America/Sao_Paulo')::date)`;
  if (f.minDaysInactive !== undefined) conds.push(sql`${activity} <= ${addDays(todayStr, -f.minDaysInactive)}::date`);
  if (f.maxDaysInactive !== undefined) conds.push(sql`${activity} >= ${addDays(todayStr, -f.maxDaysInactive)}::date`);
  if (f.minAvgTicketCents !== undefined) conds.push(sql`${customers.avgTicketCents} >= ${f.minAvgTicketCents}`);
  if (f.minPriority !== undefined) conds.push(sql`${customers.priorityScore} >= ${f.minPriority}`);
  if (f.customerIds?.length) conds.push(inArray(customers.id, f.customerIds));
  if (f.tag) conds.push(sql`${f.tag} = any(${customers.tags})`);
  if (f.minVisits !== undefined) conds.push(sql`${customers.visitCount} >= ${f.minVisits}`);
  if (f.minSpentCents !== undefined) conds.push(sql`${customers.totalSpentCents} >= ${f.minSpentCents}`);
  if (f.contactable) conds.push(sql`${customers.optedOutAt} is null and ((${customers.consentWhatsapp} and ${customers.phone} is not null) or (${customers.consentEmail} and ${customers.email} is not null) or (${customers.consentSms} and ${customers.phone} is not null))`);
  return sql.join(conds, sql` and `);
}
