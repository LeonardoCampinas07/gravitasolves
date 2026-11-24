/**
 * Relatórios por período e inteligência do painel. Tudo calculado com dados reais da empresa
 * (sem IA, sem números estimados apresentados como fatos). Todas as consultas filtram por org_id.
 */
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { campaignMessages, campaigns, customers, recoveries } from "@/db/schema";
import type { OrgSettings } from "./settings";
import { addDays, monthStart, today } from "./dates";
import { money, num, pct } from "./format";

const CID = sql.raw(`"campaigns"."id"`);
const startOf = (day: string) => new Date(Date.parse(`${day}T00:00:00-03:00`));
const endOf = (day: string) => new Date(Date.parse(`${addDays(day, 1)}T00:00:00-03:00`));

export interface PeriodTotals {
  from: string; to: string;
  contacted: number; sent: number; replied: number; failed: number;
  recovered: number; revenueCents: number; recoveriesWithRevenue: number;
}

/** Totais de um período [from, to] (datas inclusivas, fuso do estabelecimento). */
export async function getPeriodTotals(tx: Tx, orgId: string, from: string, to: string): Promise<PeriodTotals> {
  const a = startOf(from), b = endOf(to);
  const [m] = await tx.select({
    contacted: sql<number>`count(distinct ${campaignMessages.customerId}) filter (where ${campaignMessages.sentAt} >= ${a} and ${campaignMessages.sentAt} < ${b})::int`,
    sent: sql<number>`count(*) filter (where ${campaignMessages.sentAt} >= ${a} and ${campaignMessages.sentAt} < ${b})::int`,
    replied: sql<number>`count(*) filter (where ${campaignMessages.repliedAt} >= ${a} and ${campaignMessages.repliedAt} < ${b})::int`,
    failed: sql<number>`count(*) filter (where ${campaignMessages.status} = 'failed' and ${campaignMessages.createdAt} >= ${a} and ${campaignMessages.createdAt} < ${b})::int`,
  }).from(campaignMessages).where(eq(campaignMessages.orgId, orgId));
  const [r] = await tx.select({
    n: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
    withRevenue: sql<number>`count(*) filter (where ${recoveries.revenueCents} > 0)::int`,
  }).from(recoveries).where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, from), lte(recoveries.returnedAt, to)));
  return {
    from, to, contacted: Number(m?.contacted ?? 0), sent: Number(m?.sent ?? 0), replied: Number(m?.replied ?? 0), failed: Number(m?.failed ?? 0),
    recovered: Number(r?.n ?? 0), revenueCents: Number(r?.revenue ?? 0), recoveriesWithRevenue: Number(r?.withRevenue ?? 0),
  };
}

/** Período atual de N dias terminando hoje e o período anterior de mesmo tamanho. */
export async function getPeriodComparison(tx: Tx, orgId: string, days: number, todayStr = today()) {
  const curFrom = addDays(todayStr, -(days - 1));
  const prevTo = addDays(curFrom, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const [cur, prev] = await Promise.all([getPeriodTotals(tx, orgId, curFrom, todayStr), getPeriodTotals(tx, orgId, prevFrom, prevTo)]);
  return { cur, prev };
}

/** Retornos por mês (últimos N meses), para a evolução mensal. */
export async function getMonthlyRecoveries(tx: Tx, orgId: string, months = 6, todayStr = today()) {
  let start = monthStart(todayStr);
  for (let i = 1; i < months; i++) start = monthStart(addDays(start, -1));
  const rows = await tx.select({
    month: sql<string>`to_char(${recoveries.returnedAt}, 'YYYY-MM')`,
    n: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
  }).from(recoveries).where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, start))).groupBy(sql`1`).orderBy(sql`1`);
  const by = new Map(rows.map((r) => [r.month, r]));
  const out: { month: string; recovered: number; revenueCents: number }[] = [];
  let m = start;
  for (let i = 0; i < months; i++) {
    const k = m.slice(0, 7);
    out.push({ month: k, recovered: Number(by.get(k)?.n ?? 0), revenueCents: Number(by.get(k)?.revenue ?? 0) });
    m = addDays(`${k}-28`, 5).slice(0, 7) + "-01";
  }
  return out;
}

/** Retornos agrupados pelo serviço preferido do cliente (o "segmento" de clientes mais útil na prática). */
export async function getRecoveriesByService(tx: Tx, orgId: string, from: string, to: string) {
  const rows = await tx.select({
    key: sql<string>`coalesce(${customers.favoriteService}, 'Não informado')`,
    n: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${recoveries.revenueCents}),0)::bigint`,
  }).from(recoveries).innerJoin(customers, eq(customers.id, recoveries.customerId))
    .where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, from), lte(recoveries.returnedAt, to)))
    .groupBy(sql`1`).orderBy(sql`2 desc`).limit(8);
  return rows.map((r) => ({ key: r.key, recovered: Number(r.n), revenueCents: Number(r.revenue) }));
}

/** Linhas para exportação CSV dos clientes recuperados. */
export async function getRecoveryRows(tx: Tx, orgId: string, from: string, to: string) {
  return tx.select({
    returnedAt: recoveries.returnedAt, revenueCents: recoveries.revenueCents,
    customer: customers.name, phone: customers.phone, service: customers.favoriteService, campaign: campaigns.name,
  }).from(recoveries)
    .innerJoin(customers, eq(customers.id, recoveries.customerId))
    .leftJoin(campaigns, eq(campaigns.id, recoveries.campaignId))
    .where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, from), lte(recoveries.returnedAt, to)))
    .orderBy(desc(recoveries.returnedAt)).limit(10_000);
}

// ---------------------------------------------------------------------------------------------
// Inteligência do painel: frases objetivas, cada uma com o número real e um link para agir.
// ---------------------------------------------------------------------------------------------

export interface Insight { key: string; tone: "brand" | "warn" | "neutral"; text: string; href: string; cta: string }

export async function getDashboardInsights(tx: Tx, orgId: string, s: OrgSettings, todayStr = today()): Promise<Insight[]> {
  const lapsed = sql`${customers.status} in ('at_risk','inactive','highly_inactive')`;
  const contactable = sql`(${customers.optedOutAt} is null and ((${customers.consentWhatsapp} and ${customers.phone} is not null) or (${customers.consentEmail} and ${customers.email} is not null) or (${customers.consentSms} and ${customers.phone} is not null)))`;
  // Intervalo pessoal médio (dias) — mesma regra de classification.personalInterval (3+ visitas).
  const interval = sql`((${customers.lastVisitAt} - ${customers.firstVisitAt})::numeric / nullif(${customers.visitCount} - 1, 0))`;
  const daysSince = sql`(${todayStr}::date - ${customers.lastVisitAt})`;
  const newRiskSince = addDays(todayStr, -7);

  const [r] = await tx.select({
    monthlyLapsed: sql<number>`count(*) filter (where ${lapsed} and ${customers.visitCount} >= 3 and ${interval} <= 35 and ${daysSince} > 45)::int`,
    monthlyLapsedTicket: sql<number>`coalesce(sum(${customers.avgTicketCents}) filter (where ${lapsed} and ${customers.visitCount} >= 3 and ${interval} <= 35 and ${daysSince} > 45),0)::bigint`,
    riskContactable: sql<number>`count(*) filter (where ${customers.status} = 'at_risk' and ${contactable})::int`,
    newRisk: sql<number>`count(*) filter (where ${customers.status} = 'at_risk' and ${customers.lastVisitAt} between ${addDays(newRiskSince, -s.thresholds.atRiskDays)}::date and ${addDays(todayStr, -s.thresholds.atRiskDays)}::date)::int`,
    loyalLapsed: sql<number>`count(*) filter (where ${lapsed} and ${customers.visitCount} >= 10)::int`,
    noConsent: sql<number>`count(*) filter (where ${lapsed} and ${customers.optedOutAt} is null and not ${customers.consentWhatsapp} and not ${customers.consentEmail} and not ${customers.consentSms})::int`,
    lapsedTotal: sql<number>`count(*) filter (where ${lapsed})::int`,
  }).from(customers).where(eq(customers.orgId, orgId));

  const out: Insight[] = [];
  const n = (v: unknown) => Number(v ?? 0);
  if (n(r?.monthlyLapsed)) out.push({ key: "monthly", tone: "warn", href: "/inativos?status=prioritarios#prioridade", cta: "Ver quem são",
    text: `${num(n(r.monthlyLapsed))} cliente(s) que voltavam todo mês estão há mais de 45 dias sem vir — juntos, ${money(n(r.monthlyLapsedTicket))} por visita.` });
  if (n(r?.newRisk)) out.push({ key: "newrisk", tone: "brand", href: "/inativos?status=at_risk#prioridade", cta: "Chamar agora",
    text: `${num(n(r.newRisk))} cliente(s) passaram do intervalo nesta semana. É a melhor janela para chamar de volta.` });
  else if (n(r?.riskContactable)) out.push({ key: "risk", tone: "brand", href: "/inativos?status=at_risk#prioridade", cta: "Criar campanha",
    text: `${num(n(r.riskContactable))} cliente(s) em risco têm contato autorizado e ainda lembram de você.` });
  if (n(r?.loyalLapsed)) out.push({ key: "loyal", tone: "warn", href: "/inativos#prioridade", cta: "Ver clientes",
    text: `${num(n(r.loyalLapsed))} cliente(s) com 10 ou mais visitas estão afastados. Clientes fiéis costumam responder melhor a um contato pessoal.` });
  if (n(r?.noConsent) && n(r?.lapsedTotal)) out.push({ key: "consent", tone: "neutral", href: "/inativos#prioridade", cta: "Entender",
    text: `${pct(n(r.noConsent) / n(r.lapsedTotal), 0)} dos afastados (${num(n(r.noConsent))}) não autorizaram contato. Peça autorização no próximo atendimento.` });

  // Melhor campanha (só com envios suficientes para comparar).
  const camp = await tx.select({
    name: campaigns.name,
    sent: sql<number>`(select count(*) from campaign_messages m where m.campaign_id = ${CID} and m.sent_at is not null)::int`,
    returned: sql<number>`(select count(*) from recoveries x where x.campaign_id = ${CID})::int`,
  }).from(campaigns).where(and(eq(campaigns.orgId, orgId), inArray(campaigns.status, ["sending", "completed", "approved"])));
  const best = camp.map((c) => ({ ...c, sent: n(c.sent), returned: n(c.returned) })).filter((c) => c.sent >= 10 && c.returned > 0)
    .sort((a, b) => b.returned / b.sent - a.returned / a.sent)[0];
  if (best) out.push({ key: "best", tone: "brand", href: "/resultados", cta: "Ver resultados",
    text: `Sua campanha com melhor resultado é “${best.name}”: ${pct(best.returned / best.sent, 0)} dos contatados voltaram (${num(best.returned)} de ${num(best.sent)}).` });
  return out;
}

/** Resumo do mês corrente (retenção): só números verificáveis. */
export async function getMonthSummary(tx: Tx, orgId: string, todayStr = today()) {
  const ms = monthStart(todayStr);
  const t = await getPeriodTotals(tx, orgId, ms, todayStr);
  const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), gte(campaigns.createdAt, startOf(ms))));
  return { ...t, campaignsCreated: Number(c?.n ?? 0) };
}

/** Clientes que cruzaram o limite de "em risco" a partir de uma data (oportunidades novas). */
export async function countNewOpportunities(tx: Tx, orgId: string, s: OrgSettings, from: string, todayStr = today()) {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(
    eq(customers.orgId, orgId), inArray(customers.status, ["at_risk", "inactive", "highly_inactive"]), isNotNull(customers.lastVisitAt),
    gte(customers.lastVisitAt, addDays(from, -s.thresholds.atRiskDays)), lte(customers.lastVisitAt, addDays(todayStr, -s.thresholds.atRiskDays)),
  ));
  return Number(r?.n ?? 0);
}
