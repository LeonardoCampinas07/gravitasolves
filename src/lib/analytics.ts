/** Indicadores agregados. Todas as consultas filtram por org_id. */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { campaignMessages, campaigns, customers, recoveries, type CustomerStatus } from "@/db/schema";
import type { OrgSettings } from "./settings";
import { addDays, monthStart, today } from "./dates";
import { LAPSED } from "./classification";

export interface Overview {
  total: number;
  byStatus: Record<CustomerStatus, number>;
  /** Soma do ticket médio dos clientes afastados — quanto eles costumavam gastar por visita. */
  lapsedTicketSumCents: number;
  /** Histórico total gasto pelos clientes afastados. */
  lapsedLifetimeCents: number;
  /** Projeção: receita esperada se a taxa de retorno premissa se confirmar (uma visita cada). */
  projectedRecoverableCents: number;
  contactableLapsed: number;
  recoveredThisMonth: number;
  recoveredRevenueThisMonthCents: number;
  recoveredRevenueTotalCents: number;
  recoveriesTotal: number;
  activeCampaigns: number;
  demoCustomers: number;
}

export async function getOverview(tx: Tx, orgId: string, s: OrgSettings, todayStr = today()): Promise<Overview> {
  const byStatusRows = await tx.select({
    status: customers.status,
    n: sql<number>`count(*)::int`,
    ticket: sql<number>`coalesce(sum(${customers.avgTicketCents}),0)::bigint`,
    lifetime: sql<number>`coalesce(sum(${customers.totalSpentCents}),0)::bigint`,
    contactable: sql<number>`count(*) filter (where ${customers.optedOutAt} is null and (
      (${customers.consentWhatsapp} and ${customers.phone} is not null) or
      (${customers.consentSms} and ${customers.phone} is not null) or
      (${customers.consentEmail} and ${customers.email} is not null)))::int`,
    demo: sql<number>`count(*) filter (where ${customers.isDemo})::int`,
  }).from(customers).where(eq(customers.orgId, orgId)).groupBy(customers.status);

  const byStatus = { active: 0, at_risk: 0, inactive: 0, highly_inactive: 0, recovered: 0, unknown: 0 } as Record<CustomerStatus, number>;
  let total = 0, lapsedTicket = 0, lapsedLifetime = 0, projected = 0, contactableLapsed = 0, demo = 0;
  for (const r of byStatusRows) {
    byStatus[r.status] = Number(r.n);
    total += Number(r.n);
    demo += Number(r.demo);
    if (LAPSED.includes(r.status)) {
      lapsedTicket += Number(r.ticket);
      lapsedLifetime += Number(r.lifetime);
      contactableLapsed += Number(r.contactable);
      projected += Number(r.ticket) * s.returnProbability[r.status as "at_risk" | "inactive" | "highly_inactive"];
    }
  }

  const ms = monthStart(todayStr);
  const [rec] = await tx.select({
    month: sql<number>`count(*) filter (where ${recoveries.returnedAt} >= ${ms}::date)::int`,
    monthRev: sql<number>`coalesce(sum(${recoveries.revenueCents}) filter (where ${recoveries.returnedAt} >= ${ms}::date),0)::bigint`,
    totalRev: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
    total: sql<number>`count(*)::int`,
  }).from(recoveries).where(eq(recoveries.orgId, orgId));

  const [camp] = await tx.select({ n: sql<number>`count(*)::int` }).from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), inArray(campaigns.status, ["pending_approval", "approved", "sending"])));

  return {
    total, byStatus, lapsedTicketSumCents: lapsedTicket, lapsedLifetimeCents: lapsedLifetime,
    projectedRecoverableCents: Math.round(projected), contactableLapsed,
    recoveredThisMonth: Number(rec?.month ?? 0), recoveredRevenueThisMonthCents: Number(rec?.monthRev ?? 0),
    recoveredRevenueTotalCents: Number(rec?.totalRev ?? 0), recoveriesTotal: Number(rec?.total ?? 0),
    activeCampaigns: Number(camp?.n ?? 0), demoCustomers: demo,
  };
}

export interface CampaignStats {
  id: string; name: string; channel: string; status: string; createdAt: Date; generatedBy: string;
  audience: number; skipped: number; sent: number; delivered: number; read: number; replied: number; failed: number;
  returned: number; revenueCents: number; recoveryRate: number;
}

const CID = sql.raw(`"campaigns"."id"`);

export async function getCampaignStats(tx: Tx, orgId: string, campaignId?: string): Promise<CampaignStats[]> {
  const cond = campaignId ? and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId)) : eq(campaigns.orgId, orgId);
  const rows = await tx.select({
    id: campaigns.id, name: campaigns.name, channel: campaigns.channel, status: campaigns.status,
    createdAt: campaigns.createdAt, generatedBy: campaigns.generatedBy,
    audience: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID})::int`,
    skipped: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.status = 'skipped')::int`,
    sent: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.sent_at is not null)::int`,
    delivered: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.status in ('delivered','read','replied'))::int`,
    read: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.status in ('read','replied'))::int`,
    replied: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.replied_at is not null)::int`,
    failed: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.status = 'failed')::int`,
    returned: sql<number>`(select count(*) from recoveries r where r.campaign_id = ${CID})::int`,
    revenueCents: sql<number>`(select coalesce(sum(r.revenue_cents),0) from recoveries r where r.campaign_id = ${CID})::bigint`,
  }).from(campaigns).where(cond).orderBy(desc(campaigns.createdAt));
  return rows.map((r) => ({
    ...r, audience: Number(r.audience), skipped: Number(r.skipped), sent: Number(r.sent), delivered: Number(r.delivered),
    read: Number(r.read), replied: Number(r.replied), failed: Number(r.failed), returned: Number(r.returned),
    revenueCents: Number(r.revenueCents), recoveryRate: Number(r.sent) ? Number(r.returned) / Number(r.sent) : 0,
  }));
}

/** Série semanal de recuperações (últimas N semanas). */
export async function getRecoveryTrend(tx: Tx, orgId: string, weeks = 12, todayStr = today()) {
  // Semanas começam na segunda-feira; a última da série é a semana atual.
  const cur = new Date(`${todayStr}T00:00:00Z`);
  cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
  const start = addDays(cur.toISOString().slice(0, 10), -7 * (weeks - 1));
  const rows = await tx.select({
    week: sql<string>`to_char(date_trunc('week', ${recoveries.returnedAt}), 'YYYY-MM-DD')`,
    n: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
  }).from(recoveries).where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, start), lte(recoveries.returnedAt, todayStr)))
    .groupBy(sql`1`).orderBy(sql`1`);
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  const out: { week: string; recovered: number; revenueCents: number }[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < weeks; i++) {
    const w = d.toISOString().slice(0, 10);
    const r = byWeek.get(w);
    out.push({ week: w, recovered: Number(r?.n ?? 0), revenueCents: Number(r?.revenue ?? 0) });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/** Recuperações e receita em um período. */
export async function getRecoveredBetween(tx: Tx, orgId: string, from: string, to: string) {
  const [r] = await tx.select({
    n: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
    withRevenue: sql<number>`count(*) filter (where ${recoveries.revenueCents} > 0)::int`,
  }).from(recoveries).where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, from), lte(recoveries.returnedAt, to)));
  return { recovered: Number(r.n), revenueCents: Number(r.revenue), withRevenueInformed: Number(r.withRevenue) };
}

/** Padrões de inatividade: onde se concentram os clientes afastados. */
export async function getInactivityPatterns(tx: Tx, orgId: string) {
  const lapsed = sql`${customers.status} in ('at_risk','inactive','highly_inactive')`;
  const byService = await tx.select({
    key: sql<string>`coalesce(${customers.favoriteService}, 'Não informado')`,
    lapsed: sql<number>`count(*) filter (where ${lapsed})::int`,
    total: sql<number>`count(*)::int`,
    ticket: sql<number>`coalesce(avg(${customers.avgTicketCents}) filter (where ${lapsed}),0)::bigint`,
  }).from(customers).where(eq(customers.orgId, orgId)).groupBy(sql`1`).orderBy(sql`2 desc`).limit(8);
  const byStaff = await tx.select({
    key: sql<string>`coalesce(${customers.preferredStaff}, 'Não informado')`,
    lapsed: sql<number>`count(*) filter (where ${lapsed})::int`,
    total: sql<number>`count(*)::int`,
  }).from(customers).where(eq(customers.orgId, orgId)).groupBy(sql`1`).orderBy(sql`2 desc`).limit(8);
  const byLoyalty = await tx.select({
    key: sql<string>`case when ${customers.visitCount} <= 1 then '1 visita' when ${customers.visitCount} <= 4 then '2–4 visitas'
      when ${customers.visitCount} <= 10 then '5–10 visitas' else '11+ visitas' end`,
    lapsed: sql<number>`count(*) filter (where ${lapsed})::int`,
    total: sql<number>`count(*)::int`,
  }).from(customers).where(eq(customers.orgId, orgId)).groupBy(sql`1`).orderBy(sql`1`);
  const norm = <T extends { lapsed: number; total: number }>(rows: T[]) =>
    rows.map((r) => ({ ...r, lapsed: Number(r.lapsed), total: Number(r.total), rate: Number(r.total) ? Number(r.lapsed) / Number(r.total) : 0 }));
  return { byService: norm(byService).map((r) => ({ ...r, ticket: Number(r.ticket) })), byStaff: norm(byStaff), byLoyalty: norm(byLoyalty) };
}

export async function getMessageFunnel(tx: Tx, orgId: string) {
  const [r] = await tx.select({
    queued: sql<number>`count(*) filter (where ${campaignMessages.status} = 'queued')::int`,
    sent: sql<number>`count(*) filter (where ${campaignMessages.sentAt} is not null)::int`,
    delivered: sql<number>`count(*) filter (where ${campaignMessages.status} in ('delivered','read','replied'))::int`,
    replied: sql<number>`count(*) filter (where ${campaignMessages.repliedAt} is not null)::int`,
    failed: sql<number>`count(*) filter (where ${campaignMessages.status} = 'failed')::int`,
  }).from(campaignMessages).where(eq(campaignMessages.orgId, orgId));
  const [rec] = await tx.select({ n: sql<number>`count(*)::int` }).from(recoveries).where(eq(recoveries.orgId, orgId));
  return { queued: Number(r.queued), sent: Number(r.sent), delivered: Number(r.delivered), replied: Number(r.replied), failed: Number(r.failed), returned: Number(rec.n) };
}
