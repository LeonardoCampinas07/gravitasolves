import Link from "next/link";
import { Download, LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { withOrg } from "@/db/client";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCampaignStats, getMessageFunnel, getOverview, getRecoveryTrend } from "@/lib/analytics";
import { getMonthlyRecoveries, getPeriodComparison, getRecoveriesByService } from "@/lib/reports";
import { CHANNEL_LABEL } from "@/lib/channels";
import { money, num, pct } from "@/lib/format";
import { today } from "@/lib/dates";
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, ProgressBar, Table, Td, Th, cx } from "@/components/ui";
import { HBars, RecoveryTrend } from "@/components/charts";
import { InfoTip } from "@/components/guide";

export const metadata = { title: "Resultados" };

const PERIODS = [30, 90, 365] as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await requireCtx("customers:read");
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.dias) ?? 30;
  const t = today();
  const { o, funnel, stats, trend, cmp, monthly, byService } = await withOrg(ctx.org.id, async (tx) => {
    const cmp = await getPeriodComparison(tx, ctx.org.id, days, t);
    return {
      o: await getOverview(tx, ctx.org.id, ctx.settings),
      funnel: await getMessageFunnel(tx, ctx.org.id),
      stats: await getCampaignStats(tx, ctx.org.id),
      trend: await getRecoveryTrend(tx, ctx.org.id, 12),
      monthly: await getMonthlyRecoveries(tx, ctx.org.id, 6, t),
      byService: await getRecoveriesByService(tx, ctx.org.id, cmp.cur.from, t),
      cmp,
    };
  });
  const canExport = can(ctx.role, "data:export") && !ctx.sim;
  const lapsed = o.byStatus.at_risk + o.byStatus.inactive + o.byStatus.highly_inactive;
  const steps = [
    { label: "Identificados como afastados (hoje)", value: lapsed },
    { label: "Mensagens enviadas", value: funnel.sent },
    { label: "Entregues", value: funnel.delivered },
    { label: "Responderam", value: funnel.replied },
    { label: "Retornaram", value: funnel.returned },
  ];
  const sent = stats.filter((s) => s.sent > 0);
  const ranking = [...sent].sort((a, b) => b.recoveryRate - a.recoveryRate || b.returned - a.returned);
  const best = ranking[0];
  const byChannel = Object.entries(sent.reduce<Record<string, { sent: number; returned: number }>>((acc, s) => {
    acc[s.channel] ??= { sent: 0, returned: 0 }; acc[s.channel].sent += s.sent; acc[s.channel].returned += s.returned; return acc;
  }, {}));
  const maxMonth = Math.max(1, ...monthly.map((m) => m.recovered));
  const { cur, prev } = cmp;

  return (
    <>
      <PageHeader guide="resultados" title="Resultados" description={`Retornos são atribuídos à campanha quando o cliente volta em até ${ctx.settings.attributionWindowDays} dias após a mensagem. Receita considera apenas valores registrados nas visitas.`}
        actions={canExport ? <>
          <a href={`/api/export/recuperados?dias=${days}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper"><Download className="size-4" />Recuperados (CSV)</a>
          <a href={`/api/export/campanhas?dias=${days}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper"><Download className="size-4" />Campanhas (CSV)</a>
        </> : undefined} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Clientes recuperados" value={num(o.recoveriesTotal)} accent="var(--color-st-recovered)" hint={`${num(o.recoveredThisMonth)} neste mês`} />
        <Kpi label="Receita recuperada" value={money(o.recoveredRevenueTotalCents)} accent="var(--color-st-recovered)" hint={`${money(o.recoveredRevenueThisMonthCents)} neste mês`} />
        <Kpi label="Taxa de recuperação" value={funnel.sent ? pct(funnel.returned / funnel.sent) : "—"} hint="retornos ÷ mensagens enviadas" />
        <Kpi label="Taxa de resposta" value={funnel.sent ? pct(funnel.replied / funnel.sent) : "—"} hint={funnel.failed ? `${num(funnel.failed)} falhas de envio` : "respostas ÷ enviadas"} />
      </div>

      {/* Comparação de períodos */}
      <Card className="mt-4">
        <CardHeader title="Comparação de períodos" description={`Últimos ${days} dias x os ${days} dias anteriores`}
          action={<div className="flex gap-1">{PERIODS.map((p) => (
            <Link key={p} href={`/resultados?dias=${p}`} className={cx("rounded-md px-2.5 py-1 text-xs", p === days ? "bg-ink-950 text-white" : "text-ink-500 hover:bg-paper")}>{p === 365 ? "12 meses" : `${p} dias`}</Link>
          ))}</div>} />
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
          <Delta label="Clientes contatados" cur={cur.contacted} prev={prev.contacted} fmt={num} />
          <Delta label="Mensagens enviadas" cur={cur.sent} prev={prev.sent} fmt={num} />
          <Delta label="Respostas" cur={cur.replied} prev={prev.replied} fmt={num} />
          <Delta label="Clientes que voltaram" cur={cur.recovered} prev={prev.recovered} fmt={num} />
          <Delta label="Receita confirmada" cur={cur.revenueCents} prev={prev.revenueCents} fmt={money} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* Confirmado x potencial */}
        <Card>
          <CardHeader title="Receita confirmada x potencial" description="Separados de propósito: só o confirmado é dinheiro que entrou." />
          <div className="space-y-4 p-5">
            <div>
              <div className="flex items-center justify-between text-[13px]"><span className="text-ink-700">Confirmada ({days === 365 ? "12 meses" : `${days} dias`})</span><Badge tone="brand">real</Badge></div>
              <div className="num mt-1 text-2xl font-semibold">{money(cur.revenueCents)}</div>
              <p className="text-xs text-ink-500">{num(cur.recovered)} retorno(s) atribuídos{cur.recovered ? ` · ${num(cur.recoveriesWithRevenue)} com valor registrado` : ""}.</p>
            </div>
            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between text-[13px]"><span className="inline-flex items-center gap-1 text-ink-700">Potencial hoje <InfoTip text="Estimativa: soma do ticket médio dos afastados ponderada pela chance de retorno de cada grupo (ajustável em Configurações). Não é faturamento." /></span><Badge>projeção</Badge></div>
              <div className="num mt-1 text-2xl font-semibold text-ink-700">{money(o.projectedRecoverableCents)}</div>
              <p className="text-xs text-ink-500">{num(lapsed)} afastados · {num(o.contactableLapsed)} com contato autorizado.</p>
            </div>
            {cur.recovered > 0 && cur.recoveriesWithRevenue < cur.recovered && (
              <p className="rounded-lg bg-st-risk/10 px-3 py-2 text-xs text-st-risk-text">{num(cur.recovered - cur.recoveriesWithRevenue)} retorno(s) sem valor registrado. Informe o valor ao registrar a visita para medir a receita com precisão.</p>
            )}
          </div>
        </Card>

        {/* Evolução mensal */}
        <Card>
          <CardHeader title="Evolução mensal" description="Clientes que voltaram por mês (últimos 6 meses)" />
          {monthly.some((m) => m.recovered) ? (
            <div className="flex h-[210px] items-end gap-2 px-5 pb-5 pt-2">
              {monthly.map((m) => (
                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="num text-[11.5px] font-medium">{m.recovered || ""}</span>
                  <div className="w-full max-w-[44px] rounded-t-md bg-[#4ee39f]/80" style={{ height: `${Math.max(2, (m.recovered / maxMonth) * 140)}px` }} title={`${m.recovered} retornos · ${money(m.revenueCents)}`} />
                  <span className="text-[11px] text-ink-500">{MONTHS[Number(m.month.slice(5, 7)) - 1]}</span>
                  <span className="num truncate text-[10.5px] text-ink-400">{m.revenueCents ? money(m.revenueCents) : "—"}</span>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-16 text-center text-sm text-ink-500">Os retornos aparecem aqui mês a mês depois da primeira campanha.</p>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader title="Funil de recuperação" />
          <div className="space-y-4 p-5">
            {steps.map((s, i) => (
              <div key={s.label}>
                <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-ink-700">{s.label}</span><span className="num font-medium">{num(s.value)}</span></div>
                <ProgressBar value={steps[0].value ? s.value / Math.max(steps[0].value, steps[1].value) : 0} color={i === steps.length - 1 ? "var(--color-st-recovered)" : "var(--color-brand-500)"} />
              </div>
            ))}
            <p className="text-xs text-ink-500">Entregas e respostas dependem dos webhooks do provedor (WhatsApp/Twilio). No envio assistido só registramos o envio.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Recuperados por semana" />
          <div className="p-4">{trend.some((x) => x.recovered) ? <RecoveryTrend data={trend} /> : <p className="py-16 text-center text-sm text-ink-500">Sem retornos atribuídos ainda.</p>}</div>
        </Card>
      </div>

      {(byChannel.length > 0 || byService.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {byChannel.length > 0 && (
            <Card>
              <CardHeader title="Por canal" description="Taxa de retorno de cada canal de envio" />
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {byChannel.map(([ch, v]) => (
                  <div key={ch} className="rounded-xl border border-line p-3">
                    <div className="text-[13px] text-ink-500">{CHANNEL_LABEL[ch as "whatsapp"]}</div>
                    <div className="num mt-1 text-xl font-semibold">{pct(v.sent ? v.returned / v.sent : 0)}</div>
                    <div className="text-xs text-ink-500">{num(v.returned)} de {num(v.sent)} envios</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {byService.length > 0 && (
            <Card>
              <CardHeader title="Recuperados por serviço" description={`Serviço preferido de quem voltou (${days === 365 ? "12 meses" : `${days} dias`})`} />
              <div className="p-5"><HBars color="#4ee39f" data={byService.map((r) => ({ label: r.key, value: r.recovered / Math.max(1, cur.recovered), sub: `${num(r.recovered)} · ${money(r.revenueCents)}` }))} /></div>
            </Card>
          )}
        </div>
      )}

      <Card className="mt-4">
        <CardHeader title="Ranking de campanhas" description={best ? `Melhor taxa até agora: ${best.name} (${pct(best.recoveryRate)})` : "Ordenado pela taxa de recuperação"} />
        {stats.length ? (
          <Table>
            <thead><tr><Th className="w-10">#</Th><Th>Campanha</Th><Th>Canal</Th><Th className="text-right">Enviadas</Th><Th className="text-right">Entregues</Th><Th className="text-right">Respostas</Th><Th className="text-right">Retornos</Th><Th className="text-right">Receita</Th><Th className="w-40">Taxa de recuperação</Th></tr></thead>
            <tbody>
              {[...ranking, ...stats.filter((s) => !s.sent)].map((s, i) => (
                <tr key={s.id} className="hover:bg-paper/60">
                  <Td className="num text-ink-500">{s.sent ? i + 1 : "—"}</Td>
                  <Td><Link href={`/campanhas/${s.id}`} className="font-medium hover:underline">{s.name}</Link>{s.generatedBy === "ai" && <Badge tone="dark" className="ml-2">IA</Badge>}</Td>
                  <Td>{CHANNEL_LABEL[s.channel as "whatsapp"]}</Td>
                  <Td className="num text-right">{num(s.sent)}</Td><Td className="num text-right">{num(s.delivered)}</Td>
                  <Td className="num text-right">{num(s.replied)}</Td><Td className="num text-right">{num(s.returned)}</Td>
                  <Td className="num text-right">{money(s.revenueCents)}</Td>
                  <Td><div className="flex items-center gap-2"><ProgressBar value={s.recoveryRate} color="var(--color-st-recovered)" /><span className="num w-12 text-right text-xs">{s.sent ? pct(s.recoveryRate) : "—"}</span></div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState icon={<LineChart className="size-5" />} title="Sem campanhas para comparar"
              description="Os resultados aparecem quando você enviar a primeira campanha e os clientes contatados voltarem."
              action={<Link href="/campanhas?nova=1" className="text-[13px] font-medium text-brand-700 hover:underline">Criar a primeira campanha</Link>} />}
      </Card>
    </>
  );
}

function Delta({ label, cur, prev, fmt }: { label: string; cur: number; prev: number; fmt: (n: number) => string }) {
  const diff = prev ? (cur - prev) / prev : null;
  return (
    <div className="min-w-0 rounded-xl border border-line px-3 py-2.5">
      <div className="truncate text-[11.5px] text-ink-500">{label}</div>
      <div className="num mt-1 truncate text-[18px] font-semibold">{fmt(cur)}</div>
      <div className={cx("mt-0.5 flex items-center gap-1 truncate text-[11px]", cur === prev ? "text-ink-400" : cur > prev ? "text-[#4ee39f]" : "text-st-high-text")}>
        {cur !== prev && (cur > prev ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
        {diff === null ? (cur ? "sem base anterior" : "sem variação") : `${diff > 0 ? "+" : ""}${Math.round(diff * 100)}% · antes ${fmt(prev)}`}
      </div>
    </div>
  );
}
