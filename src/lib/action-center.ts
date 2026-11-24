/**
 * Central de ações: o que o dono precisa fazer agora, montado só com contagens reais do banco.
 * Usada no painel ("Próximas ações") e no sino de notificações.
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { appointments, campaignMessages, campaigns, customers, recoveries } from "@/db/schema";
import type { OrgSettings } from "./settings";
import { addDays, monthStart, today } from "./dates";

export type ActionTone = "brand" | "warn" | "danger" | "neutral";
export interface ActionItem { key: string; tone: ActionTone; title: string; detail: string; href: string; cta: string; count: number }

export async function getActionItems(tx: Tx, orgId: string, s: OrgSettings, todayStr = today()): Promise<ActionItem[]> {
  const weekAgo = new Date(Date.parse(addDays(todayStr, -7) + "T00:00:00-03:00"));
  const capDate = new Date(Date.parse(addDays(todayStr, -s.frequencyCapDays) + "T00:00:00-03:00"));

  const [[req], [camp], [msg], [cust], [queuedCamp]] = await Promise.all([
    tx.select({ n: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.orgId, orgId), eq(appointments.status, "requested"))),
    tx.select({ pending: sql<number>`count(*) filter (where ${campaigns.status} = 'pending_approval')::int`, drafts: sql<number>`count(*) filter (where ${campaigns.status} = 'draft')::int` })
      .from(campaigns).where(eq(campaigns.orgId, orgId)),
    tx.select({
      queued: sql<number>`count(*) filter (where ${campaignMessages.status} = 'queued' and ${campaigns.status} in ('approved','sending'))::int`,
      failed: sql<number>`count(*) filter (where ${campaignMessages.status} = 'failed' and ${campaignMessages.createdAt} >= ${weekAgo})::int`,
      replied: sql<number>`count(*) filter (where ${campaignMessages.repliedAt} >= ${weekAgo})::int`,
    }).from(campaignMessages).innerJoin(campaigns, eq(campaigns.id, campaignMessages.campaignId)).where(eq(campaignMessages.orgId, orgId)),
    tx.select({
      // Afastados com algum canal autorizado e sem conversa dentro do intervalo mínimo.
      ready: sql<number>`count(*) filter (where ${customers.optedOutAt} is null and ((${customers.consentWhatsapp} and ${customers.phone} is not null) or (${customers.consentEmail} and ${customers.email} is not null) or (${customers.consentSms} and ${customers.phone} is not null)) and (${customers.lastContactAt} is null or ${customers.lastContactAt} < ${capDate}))::int`,
      noConsent: sql<number>`count(*) filter (where ${customers.optedOutAt} is null and not ${customers.consentWhatsapp} and not ${customers.consentEmail} and not ${customers.consentSms})::int`,
    }).from(customers).where(and(eq(customers.orgId, orgId), inArray(customers.status, ["at_risk", "inactive", "highly_inactive"]))),
    tx.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.orgId, orgId), inArray(campaigns.status, ["approved", "sending"]))).limit(1),
  ]);

  const items: ActionItem[] = [];
  const n = (v: unknown) => Number(v ?? 0);
  if (n(req?.n)) items.push({ key: "requests", tone: "brand", count: n(req.n), href: "/agenda", cta: "Ver pedidos",
    title: `${n(req.n)} pedido(s) de agendamento`, detail: "Clientes pediram horário pelo seu link. Confirme ou remarque." });
  if (n(camp?.pending)) items.push({ key: "approval", tone: "warn", count: n(camp.pending), href: "/campanhas", cta: "Revisar",
    title: `${n(camp.pending)} campanha(s) aguardando aprovação`, detail: "Nada é enviado antes de alguém aprovar." });
  if (n(msg?.queued)) items.push({ key: "queued", tone: "brand", count: n(msg.queued), href: queuedCamp ? `/campanhas/${queuedCamp.id}` : "/campanhas", cta: "Enviar",
    title: `${n(msg.queued)} mensagem(ns) aprovada(s) para enviar`, detail: "Campanha aprovada com mensagens na fila." });
  if (n(msg?.replied)) items.push({ key: "replied", tone: "brand", count: n(msg.replied), href: "/campanhas", cta: "Ver respostas",
    title: `${n(msg.replied)} cliente(s) responderam nos últimos 7 dias`, detail: "Responda rápido: quem responde tem mais chance de voltar." });
  if (n(msg?.failed)) items.push({ key: "failed", tone: "danger", count: n(msg.failed), href: "/campanhas", cta: "Ver falhas",
    title: `${n(msg.failed)} mensagem(ns) falharam esta semana`, detail: "Confira o número do cliente ou a conexão do canal em Integrações." });
  if (n(cust?.ready)) items.push({ key: "ready", tone: "neutral", count: n(cust.ready), href: "/inativos", cta: "Criar campanha",
    title: `${n(cust.ready)} cliente(s) afastados prontos para contato`, detail: "Têm autorização e não receberam mensagem recentemente." });
  if (n(camp?.drafts)) items.push({ key: "drafts", tone: "neutral", count: n(camp.drafts), href: "/campanhas", cta: "Continuar",
    title: `${n(camp.drafts)} campanha(s) em rascunho`, detail: "Revise as mensagens e envie para aprovação." });
  if (n(cust?.noConsent)) items.push({ key: "consent", tone: "neutral", count: n(cust.noConsent), href: "/inativos", cta: "Ver clientes",
    title: `${n(cust.noConsent)} afastado(s) sem autorização de contato`, detail: "Peça autorização no próximo atendimento para poder chamá-los." });
  return items;
}

/** Retornos deste mês até hoje x mesmo período do mês passado. */
export async function getMonthComparison(tx: Tx, orgId: string, todayStr = today()) {
  const ms = monthStart(todayStr);
  const day = Number(todayStr.slice(8, 10));
  const prevStart = monthStart(addDays(ms, -1));
  const prevDays = Number(addDays(ms, -1).slice(8, 10));
  const prevEnd = addDays(prevStart, Math.min(day, prevDays) - 1);
  const [r] = await tx.select({
    cur: sql<number>`count(*) filter (where ${recoveries.returnedAt} >= ${ms}::date)::int`,
    curRev: sql<number>`coalesce(sum(${recoveries.revenueCents}) filter (where ${recoveries.returnedAt} >= ${ms}::date),0)::bigint`,
    prev: sql<number>`count(*) filter (where ${recoveries.returnedAt} between ${prevStart}::date and ${prevEnd}::date)::int`,
    prevRev: sql<number>`coalesce(sum(${recoveries.revenueCents}) filter (where ${recoveries.returnedAt} between ${prevStart}::date and ${prevEnd}::date),0)::bigint`,
  }).from(recoveries).where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, prevStart)));
  // Taxa de recuperação dos últimos 90 dias: clientes que voltaram / clientes que receberam mensagem.
  const since = new Date(Date.parse(addDays(todayStr, -90) + "T00:00:00-03:00"));
  const [rate] = await tx.select({
    contacted: sql<number>`count(distinct ${campaignMessages.customerId}) filter (where ${campaignMessages.sentAt} >= ${since})::int`,
  }).from(campaignMessages).where(and(eq(campaignMessages.orgId, orgId), isNull(campaignMessages.skipReason)));
  const [back] = await tx.select({ n: sql<number>`count(distinct ${recoveries.customerId})::int` }).from(recoveries)
    .where(and(eq(recoveries.orgId, orgId), gte(recoveries.returnedAt, addDays(todayStr, -90))));
  const contacted = Number(rate?.contacted ?? 0);
  return {
    cur: Number(r?.cur ?? 0), curRev: Number(r?.curRev ?? 0), prev: Number(r?.prev ?? 0), prevRev: Number(r?.prevRev ?? 0),
    contacted90: contacted, recovered90: Number(back?.n ?? 0), rate90: contacted ? Number(back?.n ?? 0) / contacted : null,
  };
}
