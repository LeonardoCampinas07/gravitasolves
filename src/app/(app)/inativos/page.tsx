import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Megaphone, Sparkles, Search, MessageSquareText, CheckCheck, LineChart, ArrowRight } from "lucide-react";
import { withOrg } from "@/db/client";
import { customers, type CustomerStatus } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { InfoTip } from "@/components/guide";
import { getInactivityPatterns } from "@/lib/analytics";
import { LAPSED, lastActivity, STATUS_LABEL } from "@/lib/classification";
import { PRIORITY_MIN_SCORE, recoveryReason, type NextStepKind } from "@/lib/recovery";
import { getSegment } from "@/lib/segments";
import { daysBetween, today } from "@/lib/dates";
import { money, num, pct } from "@/lib/format";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, ScorePill, STATUS_COLOR, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { HBars } from "@/components/charts";
import { ReclassifyButton } from "./reclassify";

export const metadata = { title: "Central de recuperação" };

const GROUP_COPY: Record<string, string> = {
  at_risk: "Passaram do intervalo habitual. É a melhor janela: ainda lembram de você.",
  inactive: "Já quebraram o hábito. Precisam de um motivo concreto para voltar.",
  highly_inactive: "Afastados há muito tempo. Retorno menos provável — priorize os de maior valor.",
};

const TABS = [
  { key: undefined, label: "Todos afastados" },
  { key: "prioritarios", label: "Prioritários" },
  { key: "at_risk", label: STATUS_LABEL.at_risk },
  { key: "inactive", label: STATUS_LABEL.inactive },
  { key: "highly_inactive", label: "Muito tempo" },
  { key: "recovered", label: "Recuperados" },
] as const;

const NEXT_TONE: Record<NextStepKind, string> = {
  invite: "text-[#4ee39f]", winback: "text-[#4ee39f]", consent: "text-st-risk-text", wait: "text-ink-500", blocked: "text-st-high-text", follow: "text-ink-500",
};

const FLOW = [
  { icon: Search, label: "Identificar", text: "quem passou do ritmo", href: "#prioridade" },
  { icon: Sparkles, label: "Entender", text: "peça a análise ao agente", href: "/agente" },
  { icon: MessageSquareText, label: "Mensagem", text: "campanha com texto editável", href: "/campanhas?nova=1" },
  { icon: CheckCheck, label: "Aprovar e enviar", text: "nada sai sem aprovação", href: "/campanhas" },
  { icon: LineChart, label: "Acompanhar", text: "quem voltou e quanto gerou", href: "/resultados" },
];

export default async function RecoveryCenterPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireCtx("customers:read");
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.status)?.key;
  const filter: CustomerStatus[] = tab === "recovered" ? ["recovered"] : LAPSED.includes(tab as CustomerStatus) ? [tab as CustomerStatus] : LAPSED;
  const seg = getSegment(ctx.org.segment);
  const t = today();
  const { groups, list, patterns, median, recoveredCount, priorityCount } = await withOrg(ctx.org.id, async (tx) => {
    const groups = await tx.select({
      status: customers.status, n: sql<number>`count(*)::int`,
      ticket: sql<number>`coalesce(sum(${customers.avgTicketCents}),0)::bigint`,
      avgDays: sql<number>`coalesce(avg(current_date - ${customers.lastVisitAt}),0)::int`,
      contactable: sql<number>`count(*) filter (where ${customers.optedOutAt} is null and ((${customers.consentWhatsapp} and ${customers.phone} is not null) or (${customers.consentEmail} and ${customers.email} is not null) or (${customers.consentSms} and ${customers.phone} is not null)))::int`,
    }).from(customers).where(and(eq(customers.orgId, ctx.org.id), inArray(customers.status, LAPSED))).groupBy(customers.status);
    const where = and(eq(customers.orgId, ctx.org.id), inArray(customers.status, filter), tab === "prioritarios" ? gte(customers.priorityScore, PRIORITY_MIN_SCORE) : undefined);
    const list = await tx.select().from(customers).where(where)
      .orderBy(tab === "recovered" ? desc(customers.recoveredAt) : desc(customers.priorityScore)).limit(60);
    const [m] = await tx.select({
      median: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${customers.avgTicketCents}) filter (where ${customers.avgTicketCents} > 0),0)::int`,
      recovered: sql<number>`count(*) filter (where ${customers.status} = 'recovered')::int`,
      priority: sql<number>`count(*) filter (where ${customers.status} in ('at_risk','inactive','highly_inactive') and ${customers.priorityScore} >= ${PRIORITY_MIN_SCORE})::int`,
    }).from(customers).where(eq(customers.orgId, ctx.org.id));
    return {
      groups, list, patterns: await getInactivityPatterns(tx, ctx.org.id),
      median: Number(m?.median ?? 0), recoveredCount: Number(m?.recovered ?? 0), priorityCount: Number(m?.priority ?? 0),
    };
  });
  const g = Object.fromEntries(groups.map((x) => [x.status, x]));
  const total = groups.reduce((a, x) => a + Number(x.n), 0);

  return (
    <>
      <PageHeader guide="inativos" title="Central de recuperação" description={`${num(total)} clientes deixaram de vir no ritmo esperado · ${num(priorityCount)} prioritários · ${num(recoveredCount)} recuperados. Critérios para ${seg.label.toLowerCase()}: ${ctx.settings.thresholds.atRiskDays} / ${ctx.settings.thresholds.inactiveDays} / ${ctx.settings.thresholds.highlyInactiveDays} dias.`}
        actions={<><ReclassifyButton /><ButtonLink href="/agente" variant="secondary"><Sparkles className="size-4" />Analisar com o agente</ButtonLink></>} />

      <ol className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Fluxo de recuperação">
        {FLOW.map(({ icon: I, label, text, href }, i) => (
          <li key={label}>
            <Link href={href} className="group flex h-full items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:border-brand-300">
              <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[#4ee39f]"><I className="size-3.5" /><span className="num absolute -left-1 -top-1 grid size-3.5 place-items-center rounded-full bg-[#4ee39f] text-[9px] font-semibold text-[#06130d]">{i + 1}</span></span>
              <span className="min-w-0"><span className="block text-[12.5px] font-medium">{label}</span><span className="block text-[11.5px] leading-snug text-ink-500">{text}</span></span>
            </Link>
          </li>
        ))}
      </ol>

      {!total && !recoveredCount ? (
        <Card><EmptyState title="Nenhum cliente afastado"
          description="Aqui aparecem os clientes que passaram do intervalo habitual de visitas, com o motivo e o próximo passo. Para isso, a base precisa ter clientes com data de última visita."
          action={<ButtonLink href="/fontes">Conectar meus clientes<ArrowRight className="size-4" /></ButtonLink>} /></Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {LAPSED.map((s) => {
              const x = g[s];
              return (
                <Card key={s} className="relative overflow-hidden p-5 animate-rise">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[s] }} />
                  <div className="flex items-center justify-between"><StatusBadge status={s} /><span className="text-xs text-ink-400">média {x ? x.avgDays : 0} dias</span></div>
                  <div className="num mt-3 text-3xl font-semibold">{num(Number(x?.n ?? 0))}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{GROUP_COPY[s]}</p>
                  <div className="mt-3 flex justify-between border-t border-line pt-3 text-[12px] text-ink-500">
                    <span>Ticket somado <b className="num text-ink-800">{money(Number(x?.ticket ?? 0))}</b></span>
                    <span>Contatáveis <b className="num text-ink-800">{num(Number(x?.contactable ?? 0))}</b></span>
                  </div>
                  {x && <ButtonLink href={`/campanhas?nova=1&status=${s}`} variant="secondary" className="mt-3 w-full"><Megaphone className="size-4" />Campanha para este grupo</ButtonLink>}
                </Card>
              );
            })}
          </div>

          <Card className="mt-4" id="prioridade">
            <CardHeader title="Quem chamar e por quê" description="Motivo calculado com o histórico de cada cliente e o próximo passo recomendado. Ordenado pelo potencial de retorno."
              action={<div className="flex flex-wrap gap-1">
                {TABS.map((x) => (
                  <Link key={x.key ?? "all"} href={x.key ? `/inativos?status=${x.key}#prioridade` : "/inativos#prioridade"} className={cx("rounded-md px-2.5 py-1 text-xs", tab === x.key ? "bg-ink-950 text-white" : "text-ink-500 hover:bg-paper")}>
                    {x.label}{x.key === "prioritarios" ? ` (${num(priorityCount)})` : x.key === "recovered" ? ` (${num(recoveredCount)})` : ""}
                  </Link>
                ))}
              </div>} />
            {list.length ? (
              <Table>
                <thead><tr>
                  <Th><span className="inline-flex items-center gap-1">Potencial <InfoTip text="O potencial (0–100) combina quanto o cliente gastava, com que frequência vinha, há quanto tempo sumiu e se autorizou contato. Quanto maior, maior a chance de voltar." /></span></Th>
                  <Th>Cliente</Th><Th>Status</Th>
                  <Th><span className="inline-flex items-center gap-1">Por que está aqui <InfoTip text="Calculado com o histórico real do cliente: o intervalo médio entre as visitas dele (quando há 3 ou mais) ou os prazos do seu segmento." /></span></Th>
                  <Th className="text-right">Ticket médio</Th><Th>Próximo passo</Th>
                </tr></thead>
                <tbody>
                  {list.map((c) => {
                    const r = recoveryReason(c, ctx.settings, t, median);
                    const last = lastActivity(c, ctx.settings);
                    return (
                      <tr key={c.id} className="hover:bg-paper/60">
                        <Td>{c.status === "recovered" ? <span className="text-xs text-ink-400">—</span> : <ScorePill score={c.priorityScore} />}</Td>
                        <Td><Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link><div className="text-xs text-ink-500">{c.visitCount} {seg.vocab.visits}{last ? ` · última há ${daysBetween(last, t)} dias` : ""}</div></Td>
                        <Td><StatusBadge status={c.status} /></Td>
                        <Td className="min-w-[220px] max-w-[320px] whitespace-normal"><div className="text-[12.5px] leading-snug text-ink-700">{r.why}</div>{r.detail && <div className="mt-0.5 text-[11.5px] text-ink-500">{r.detail}</div>}</Td>
                        <Td className="num text-right">{money(c.avgTicketCents)}</Td>
                        <Td className="whitespace-normal"><Link href={`/clientes/${c.id}`} className={cx("text-[12.5px] font-medium hover:underline", NEXT_TONE[r.next.kind])}>{r.next.text}</Link></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState title={tab === "recovered" ? "Ninguém recuperado ainda" : tab === "prioritarios" ? "Nenhum cliente prioritário agora" : "Ninguém neste grupo"}
                description={tab === "recovered" ? "Quando um cliente contatado por campanha voltar e a visita for registrada, ele aparece aqui." : tab === "prioritarios" ? `Prioritários são afastados com potencial ${PRIORITY_MIN_SCORE} ou mais. Veja a lista completa em “Todos afastados”.` : "Nenhum cliente com este status no momento."} />
            )}
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              { title: `Por ${seg.vocab.service}`, rows: patterns.byService },
              { title: `Por ${seg.vocab.staff}`, rows: patterns.byStaff },
              { title: "Por fidelidade", rows: patterns.byLoyalty },
            ].map((p) => (
              <Card key={p.title}>
                <CardHeader title={`Taxa de afastamento ${p.title.toLowerCase()}`} description="% dos clientes do grupo que estão afastados" />
                <div className="p-5">
                  {p.rows.length ? <HBars data={p.rows.map((r) => ({ label: r.key, value: r.rate, sub: `${pct(r.rate, 0)} · ${r.lapsed}/${r.total}` }))} /> : <p className="text-sm text-ink-500">Sem dados.</p>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
