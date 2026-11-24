import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarCheck, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { withOrg } from "@/db/client";
import { campaignMessages, campaigns, consentEvents, customers, recoveries, visits } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { classify, STATUS_LABEL } from "@/lib/classification";
import { getSegment } from "@/lib/segments";
import { dayOf, daysBetween, today } from "@/lib/dates";
import { customerInsight } from "@/lib/insights";
import { dateBR, dateTimeBR, money } from "@/lib/format";
import { SKIP_LABEL, type SkipReason } from "@/lib/campaigns/compliance";
import { Badge, Card, CardHeader, ScorePill, StatusBadge } from "@/components/ui";
import { CustomerActions, ConsentToggles, ProfileEditor, StartRecoveryButton } from "./customer-actions";

const MSG_STATUS: Record<string, string> = { queued: "Na fila", skipped: "Não enviada", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", replied: "Respondeu" };
const CH: Record<string, string> = { whatsapp: "WhatsApp", email: "e-mail", sms: "SMS" };
const SRC: Record<string, string> = { manual: "registrado pela equipe", quick: "cadastro rápido", import: "importação", csv: "planilha", api: "integração", booking_page: "página de agendamento", google_calendar: "Google Agenda", whatsapp_export: "conversas do WhatsApp", demo: "demonstração", opt_out: "pedido do cliente" };

export const metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("customers:read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withOrg(ctx.org.id, async (tx) => {
    const [c] = await tx.select().from(customers).where(and(eq(customers.id, id), eq(customers.orgId, ctx.org.id)));
    if (!c) return null;
    return {
      c,
      visits: await tx.select().from(visits).where(and(eq(visits.orgId, ctx.org.id), eq(visits.customerId, id))).orderBy(desc(visits.occurredAt)).limit(20),
      messages: await tx.select({ m: campaignMessages, name: campaigns.name }).from(campaignMessages).innerJoin(campaigns, eq(campaigns.id, campaignMessages.campaignId))
        .where(and(eq(campaignMessages.orgId, ctx.org.id), eq(campaignMessages.customerId, id))).orderBy(desc(campaignMessages.createdAt)).limit(20),
      consents: await tx.select().from(consentEvents).where(and(eq(consentEvents.orgId, ctx.org.id), eq(consentEvents.customerId, id))).orderBy(desc(consentEvents.createdAt)).limit(20),
      recs: await tx.select().from(recoveries).where(and(eq(recoveries.orgId, ctx.org.id), eq(recoveries.customerId, id))),
    };
  });
  if (!data) notFound();
  const { c } = data;
  const seg = getSegment(ctx.org.segment);
  const cl = classify(c, ctx.settings, today());
  const canWrite = can(ctx.role, "customers:write");
  const sentDates = data.messages.map(({ m }) => m.sentAt).filter(Boolean) as Date[];
  const lastSent = sentDates.length ? sentDates.reduce((a, b) => (a > b ? a : b)) : null;
  const insight = customerInsight(c, cl, ctx.settings, {
    daysSinceLastMessage: lastSent ? daysBetween(dayOf(lastSent), today()) : null,
    replied: data.messages.some(({ m }) => m.status === "replied"),
  });
  const channel = c.consentWhatsapp && c.phone ? "whatsapp" : c.consentEmail && c.email ? "email" : c.consentSms && c.phone ? "sms" : "whatsapp";
  type Ev = { at: Date; kind: "visit" | "message" | "consent"; node: React.ReactNode };
  const timeline: Ev[] = [
    ...data.visits.map((v): Ev => {
      const rec = data.recs.find((r) => r.visitId === v.id);
      return { at: new Date(v.occurredAt), kind: "visit", node: <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]"><span>Visita · <span className="text-ink-500">{v.description ?? v.source}</span></span><span className="flex items-center gap-2">{rec && <Badge tone="violet">Retorno por campanha</Badge>}<span className="num">{v.amountCents ? money(v.amountCents) : "—"}</span></span></div> };
    }),
    ...data.messages.map(({ m, name }): Ev => ({ at: m.sentAt ?? m.createdAt, kind: "message", node: <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span>Mensagem · <Link href={`/campanhas/${m.campaignId}`} className="font-medium hover:underline">{name}</Link></span>
        <Badge tone={m.status === "skipped" || m.status === "failed" ? "warn" : m.status === "queued" ? "neutral" : "brand"}>{MSG_STATUS[m.status]}</Badge>
      </div>
      {m.skipReason && <p className="mt-1 text-xs text-ink-500">{SKIP_LABEL[m.skipReason as SkipReason] ?? m.skipReason}</p>}
      <details className="mt-1 text-[12.5px] text-ink-600"><summary className="cursor-pointer text-ink-400">Ver texto</summary><p className="mt-1 whitespace-pre-line">{m.body}</p></details>
    </> })),
    ...data.consents.map((e): Ev => ({ at: e.createdAt, kind: "consent", node: <p className="text-[13px]">Autorização de {CH[e.channel] ?? e.channel}: <b className={e.action === "granted" ? "text-brand-700" : "text-st-high"}>{e.action === "granted" ? "autorizado" : "revogado"}</b> <span className="text-ink-500">· {SRC[e.source] ?? e.source}</span></p> })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const ICON = { visit: CalendarCheck, message: MessageSquare, consent: ShieldCheck };

  return (
    <>
      <Link href="/clientes" className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-950"><ArrowLeft className="size-3.5" />Clientes</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-rise">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{c.name}</h1>
            <StatusBadge status={c.status} />
            {c.isDemo && <Badge tone="violet">Demonstração</Badge>}
            {c.optedOutAt && <Badge tone="danger">Descadastrado em {dateBR(c.optedOutAt)}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">{[c.phone, c.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
        </div>
        {canWrite && <CustomerActions customerId={c.id} canDelete={can(ctx.role, "customers:delete")} canExport={can(ctx.role, "data:export")} optedOut={!!c.optedOutAt} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Última visita", dateBR(c.lastVisitAt), cl.daysSince !== null ? `${cl.daysSince} dias atrás` : ""],
              [cap(seg.vocab.visits), String(c.visitCount), cl.personalInterval ? `a cada ~${Math.round(cl.personalInterval)} dias` : ""],
              ["Ticket médio", money(c.avgTicketCents), `total ${money(c.totalSpentCents)}`],
              ["Potencial de retorno", "", ""],
            ].map(([l, v, h], i) => (
              <Card key={l} className="p-4">
                <div className="text-[12px] text-ink-500">{l}</div>
                <div className="num mt-1.5 text-lg font-semibold">{i === 3 ? <ScorePill score={c.priorityScore} /> : v}</div>
                {h && <div className="mt-0.5 text-[11px] text-ink-400">{h}</div>}
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Por que este cliente merece atenção" description="Calculado com os dados reais dele — nada inventado" />
            <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_260px]">
              <ul className="space-y-1.5 text-sm text-ink-700">{insight.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" />{r}</li>)}</ul>
              <div className="rounded-xl bg-paper p-4 ring-1 ring-line">
                <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-500"><Sparkles className="size-3.5" />Próximo passo</div>
                <p className="mb-3 text-[13.5px] font-medium">{insight.next.text}</p>
                {insight.next.action === "campaign" && can(ctx.role, "campaigns:write") && <StartRecoveryButton customerId={c.id} channel={channel} />}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Como o GravitaSolves classifica este cliente" />
            <div className="space-y-2 px-5 py-4 text-sm text-ink-700">
              <p>Limites aplicados: em risco a partir de <b className="num">{cl.thresholds.atRiskDays}</b> dias, inativo a partir de <b className="num">{cl.thresholds.inactiveDays}</b>, altamente inativo a partir de <b className="num">{cl.thresholds.highlyInactiveDays}</b>.
                {cl.personalInterval && ctx.settings.useIndividualRhythm ? ` Ajustados ao ritmo deste cliente (média de ${Math.round(cl.personalInterval)} dias entre ${seg.vocab.visits}).` : " Padrão da empresa."}</p>
              <p className="text-ink-500">Status atual: <b>{STATUS_LABEL[cl.status]}</b>.{c.favoriteService ? ` Serviço preferido: ${c.favoriteService}.` : ""}{c.preferredStaff ? ` ${cap(seg.vocab.staff)}: ${c.preferredStaff}.` : ""}</p>
              {c.lastContactAt && <p className="text-ink-500">Última conversa: <b>{dateTimeBR(c.lastContactAt)}</b>{c.contactCount ? ` · ${c.contactCount} mensagens registradas` : ""}{ctx.settings.countContactAsActivity ? " (conta como atividade)" : ""}.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Linha do tempo" description="Visitas, mensagens e autorizações, da mais recente para a mais antiga" />
            {timeline.length ? (
              <ol className="relative px-5 py-4">
                {timeline.slice(0, 40).map((e, i) => {
                  const Icon = ICON[e.kind];
                  return (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < Math.min(timeline.length, 40) - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" />}
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper ring-1 ring-line"><Icon className="size-3.5 text-ink-500" /></span>
                      <div className="min-w-0 flex-1"><div className="num text-[11.5px] text-ink-400">{dateTimeBR(e.at)}</div>{e.node}</div>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="px-5 py-6 text-sm text-ink-500">Nada registrado ainda — os totais vieram da importação.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Etiquetas e anotações" />
            <ProfileEditor customerId={c.id} notes={c.notes ?? ""} tags={c.tags ?? []} editable={canWrite} />
          </Card>
          <Card>
            <CardHeader title="Autorização de contato" description="LGPD: só canais autorizados recebem mensagens" />
            <div className="px-5 py-4">
              <ConsentToggles customerId={c.id} disabled={!canWrite || !!c.optedOutAt}
                state={{ whatsapp: c.consentWhatsapp, email: c.consentEmail, sms: c.consentSms }} has={{ whatsapp: !!c.phone, email: !!c.email, sms: !!c.phone }} />
              <dl className="mt-4 space-y-1 text-[12px] text-ink-500">
                <div>Base legal: <span className="text-ink-700">{c.legalBasis === "consent" ? "Consentimento" : c.legalBasis === "legitimate_interest" ? "Legítimo interesse" : "Não registrada"}</span></div>
                {c.consentSource && <div>Origem: <span className="text-ink-700">{c.consentSource}</span></div>}
                {c.consentAt && <div>Registrado em: <span className="text-ink-700">{dateTimeBR(c.consentAt)}</span></div>}
              </dl>
            </div>
            {data.consents.length > 0 && (
              <details className="border-t border-line px-5 py-3 text-[12px]">
                <summary className="cursor-pointer text-ink-600">Histórico de consentimento ({data.consents.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {data.consents.map((e) => <li key={e.id} className="text-ink-500"><span className="num">{dateTimeBR(e.createdAt)}</span> — {CH[e.channel] ?? e.channel}: <b className={e.action === "granted" ? "text-brand-700" : "text-st-high"}>{e.action === "granted" ? "autorizado" : "revogado"}</b> · {SRC[e.source] ?? e.source}</li>)}
                </ul>
              </details>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
