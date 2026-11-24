import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, Users, AlertTriangle, UserMinus, RotateCcw, Megaphone, Sparkles, Cable, TrendingUp, TrendingDown, Phone, CheckCircle2 } from "lucide-react";
import { getActionItems, getMonthComparison } from "@/lib/action-center";
import { countNewOpportunities, getDashboardInsights, getMonthSummary } from "@/lib/reports";
import { monthStart } from "@/lib/dates";
import { Lightbulb, CalendarCheck } from "lucide-react";
import { GoalCard } from "@/components/goal-editor";
import { can } from "@/lib/auth/permissions";
import { SetupChecklist } from "@/components/setup-checklist";
import { withOrg } from "@/db/client";
import { auditLogs, customers } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { getOverview, getRecoveryTrend } from "@/lib/analytics";
import { STATUS_LABEL, LAPSED, lastActivity } from "@/lib/classification";
import { getSegment } from "@/lib/segments";
import { daysBetween, today } from "@/lib/dates";
import { money, num, pct } from "@/lib/format";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, ScorePill, STATUS_COLOR, StatusBadge } from "@/components/ui";
import { RecoveryTrend, RevenueArea, StatusDonut } from "@/components/charts";
import { ActivityFeed } from "@/components/activity";
import type { CustomerStatus } from "@/db/schema";
import { and, inArray } from "drizzle-orm";

export const metadata = { title: "Visão geral" };

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default async function OverviewPage() {
  const ctx = await requireCtx();
  const seg = getSegment(ctx.org.segment);
  const t = today();
  const { o, trend, top, activity, actions, cmp, insights, summary, opportunities } = await withOrg(ctx.org.id, async (tx) => ({
    insights: await getDashboardInsights(tx, ctx.org.id, ctx.settings, t),
    summary: await getMonthSummary(tx, ctx.org.id, t),
    opportunities: await countNewOpportunities(tx, ctx.org.id, ctx.settings, monthStart(t), t),
    actions: await getActionItems(tx, ctx.org.id, ctx.settings, t),
    cmp: await getMonthComparison(tx, ctx.org.id, t),
    o: await getOverview(tx, ctx.org.id, ctx.settings),
    trend: await getRecoveryTrend(tx, ctx.org.id, 12),
    top: await tx.select().from(customers).where(and(eq(customers.orgId, ctx.org.id), inArray(customers.status, LAPSED)))
      .orderBy(desc(customers.priorityScore)).limit(5),
    activity: await tx.select().from(auditLogs).where(eq(auditLogs.orgId, ctx.org.id)).orderBy(desc(auditLogs.createdAt)).limit(4),
  }));

  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })) % 24;
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const firstName = ctx.user.name.trim().split(/\s+/)[0] ?? "";
  const eyebrow = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const title = `${greeting}${firstName ? `, ${firstName}` : ""}`;

  if (o.total === 0) {
    return (
      <>
        <PageHeader guide="visao-geral" eyebrow={eyebrow} title={title} description={ctx.org.name} />
        <SetupChecklist ctx={ctx} />
        <Card>
          <EmptyState icon={<Cable className="size-5" />} title="Sua base ainda está vazia"
            description="Conecte o jeito que você já atende — agenda, WhatsApp, link de agendamento ou contatos — e o GravitaSolves descobre sozinho quem está sumindo."
            action={<ButtonLink href="/fontes">Conectar meus clientes</ButtonLink>} />
        </Card>
      </>
    );
  }

  const lapsedTotal = o.byStatus.at_risk + o.byStatus.inactive + o.byStatus.highly_inactive;
  const donut = (["active", "recovered", "at_risk", "inactive", "highly_inactive", "unknown"] as CustomerStatus[])
    .map((s) => ({ label: STATUS_LABEL[s], value: o.byStatus[s], color: STATUS_COLOR[s] }));
  const revenue12w = trend.reduce((a, w) => a + w.revenueCents, 0);
  const recovered12w = trend.reduce((a, w) => a + w.recovered, 0);
  const featured = top[0];
  const featuredLast = featured ? lastActivity(featured, ctx.settings) : null;
  const featuredDays = featuredLast ? daysBetween(featuredLast, t) : null;
  const chips = [
    { label: "Clientes", value: num(o.total), icon: Users, color: "text-white/70" },
    { label: "Em risco", value: num(o.byStatus.at_risk), icon: AlertTriangle, color: "text-st-risk" },
    { label: "Inativos", value: num(o.byStatus.inactive + o.byStatus.highly_inactive), icon: UserMinus, color: "text-st-inactive" },
    { label: "Voltaram no mês", value: num(o.recoveredThisMonth), icon: RotateCcw, color: "text-[#4ee39f]" },
  ];

  return (
    <>
      <PageHeader guide="visao-geral" eyebrow={eyebrow} title={title}
        description={`${ctx.org.name} · ${seg.label}`}
        actions={<ButtonLink href="/campanhas?nova=1"><Megaphone className="size-4" />Nova campanha</ButtonLink>} />

      <SetupChecklist ctx={ctx} />

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Receita recuperável */}
        <Card className="relative overflow-hidden p-6 animate-rise">
          <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-[#4ee39f]/[0.14] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] text-white/55">Receita recuperável</div>
                <div className="num mt-2 text-[40px] font-semibold leading-none tracking-[-0.045em] text-white [text-shadow:0_0_40px_rgba(78,227,159,.35)] sm:text-[52px]">{money(o.projectedRecoverableCents)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-white/50">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#4ee39f]/15 px-2 py-0.5 font-medium text-[#4ee39f]"><TrendingUp className="size-3.5" />{money(o.recoveredRevenueThisMonthCents)} recuperados no mês</span>
                  <span>{num(lapsedTotal)} afastados · {num(o.contactableLapsed)} com contato autorizado</span>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/50">projeção</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {chips.map(({ label, value, icon: I, color }) => (
                <div key={label} className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 truncate text-[11.5px] text-white/45"><I className={`size-3.5 shrink-0 ${color}`} />{label}</div>
                  <div className="num mt-1 text-[19px] font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="relative -mx-2 mt-4">
              <RevenueArea data={trend} />
              {revenue12w === 0 && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
                  <span className="rounded-full border border-white/10 bg-[#0d1411]/85 px-3 py-1 text-center text-[12px] text-white/50">A receita recuperada aparece aqui quando clientes contatados voltarem</span>
                </div>
              )}
            </div>

            <p className="mt-3 text-[11.5px] leading-relaxed text-white/35">
              Projeção, não faturamento garantido: considera que {pct(ctx.settings.returnProbability.at_risk, 0)} dos clientes em risco, {pct(ctx.settings.returnProbability.inactive, 0)} dos inativos e {pct(ctx.settings.returnProbability.highly_inactive, 0)} dos altamente inativos voltem uma vez, pelo ticket médio de cada um. Premissas ajustáveis em Configurações.
            </p>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {/* Cliente em destaque (cartão 3D) */}
          {featured ? (
            <Link href={`/clientes/${featured.id}`} className="group block animate-rise [perspective:1100px]">
              <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(140deg,rgba(78,227,159,.22),rgba(18,163,122,.06)_45%,rgba(255,255,255,.03))] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,.9),inset_0_1px_0_rgba(255,255,255,.12)] transition-transform duration-500 [transform:rotateX(6deg)_rotateY(-8deg)] group-hover:[transform:rotateX(0deg)_rotateY(0deg)_translateY(-2px)]">
                <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-[#4ee39f]/25 blur-3xl" />
                <div className="relative flex items-center justify-between text-[11.5px] text-white/55">
                  <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#4ee39f] shadow-[0_0_8px_#4ee39f]" />Maior potencial de retorno</span>
                  <ArrowUpRight className="size-4 transition group-hover:text-white" />
                </div>
                <div className="relative mt-4 flex items-center gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#4ee39f] to-[#0e8463] text-[15px] font-semibold text-[#06130d] shadow-[0_10px_24px_-10px_rgba(78,227,159,.9)]">
                    {initials(featured.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-semibold text-white">{featured.name}</div>
                    <div className="mt-1 flex items-center gap-2"><StatusBadge status={featured.status} />{featured.phone && <Phone className="size-3.5 text-white/40" aria-label="Tem telefone" />}</div>
                  </div>
                  <ScorePill score={featured.priorityScore} />
                </div>
                <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-[11px] text-white/45">
                  <div><div className="num text-[15px] font-semibold text-white">{featuredDays ?? "—"}</div>dias sem vir</div>
                  <div className="min-w-0"><div className="num truncate text-[15px] font-semibold text-white">{money(featured.avgTicketCents)}</div>ticket médio</div>
                  <div><div className="num text-[15px] font-semibold text-white">{featured.visitCount}</div>{seg.vocab.visits}</div>
                </div>
              </div>
            </Link>
          ) : (
            <Card className="grid place-items-center p-6 text-center text-sm text-white/50 animate-rise">Nenhum cliente afastado. Ótimo sinal!</Card>
          )}

          {/* Recuperados por semana */}
          <Card className="p-5 animate-rise">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-white/55">Clientes que voltaram</div>
                <div className="num mt-1 text-[26px] font-semibold text-white">{num(recovered12w)}<span className="ml-1.5 text-[12px] font-normal text-white/40">em 12 semanas</span></div>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/45">{num(o.activeCampaigns)} campanha{o.activeCampaigns === 1 ? "" : "s"} ativa{o.activeCampaigns === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-2">
              {trend.some((w) => w.recovered) ? <RecoveryTrend data={trend} height={150} /> :
                <p className="py-12 text-center text-[13px] text-white/40">Os retornos aparecem aqui quando clientes contatados voltarem.</p>}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Inteligência da sua base" description="Padrões encontrados agora nos seus dados — cada número é real e clicável" />
          {insights.length ? (
            <ul className="divide-y divide-line">
              {insights.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className="flex items-start gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                    <Lightbulb className={`mt-0.5 size-4 shrink-0 ${i.tone === "warn" ? "text-st-risk" : i.tone === "brand" ? "text-[#4ee39f]" : "text-white/40"}`} />
                    <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-700">{i.text}</span>
                    <span className="hidden shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand-600 sm:inline-flex">{i.cta}<ArrowUpRight className="size-3.5" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-sm text-ink-500">Nenhum padrão relevante agora. Conforme a base ganha histórico de visitas, os padrões aparecem aqui.</p>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[13px] text-white/55"><CalendarCheck className="size-4 text-[#4ee39f]" />Resumo do mês</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
            Neste mês, sua empresa identificou <b className="num text-white">{num(opportunities)}</b> nova{opportunities === 1 ? "" : "s"} oportunidade{opportunities === 1 ? "" : "s"} de recuperação,
            contatou <b className="num text-white">{num(summary.contacted)}</b> cliente{summary.contacted === 1 ? "" : "s"}, recebeu <b className="num text-white">{num(summary.replied)}</b> resposta{summary.replied === 1 ? "" : "s"}
            {" "}e recuperou <b className="num text-white">{num(summary.recovered)}</b> cliente{summary.recovered === 1 ? "" : "s"}{summary.revenueCents > 0 ? <>, com <b className="num text-white">{money(summary.revenueCents)}</b> registrados</> : ""}.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] text-ink-500">
            <li className="rounded-lg border border-line px-2.5 py-2"><b className="num block text-[15px] text-white">{num(summary.campaignsCreated)}</b>campanhas criadas</li>
            <li className="rounded-lg border border-line px-2.5 py-2"><b className="num block text-[15px] text-white">{num(summary.sent)}</b>mensagens enviadas</li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-white/35">Oportunidades = clientes que passaram do limite de “em risco” neste mês. Recuperados = retornos atribuídos a campanhas.</p>
          <Link href="/resultados" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:underline">Ver relatório completo<ArrowUpRight className="size-3.5" /></Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Próximas ações" description="O que fazer agora, a partir dos seus dados" />
          {actions.length ? (
            <ul className="divide-y divide-line">
              {actions.slice(0, 6).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                    <span className={`size-2 shrink-0 rounded-full ${a.tone === "danger" ? "bg-st-high" : a.tone === "warn" ? "bg-st-risk" : a.tone === "brand" ? "bg-[#4ee39f] shadow-[0_0_8px_#4ee39f]" : "bg-white/30"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-ink-500">{a.detail}</div>
                    </div>
                    <span className="hidden shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand-600 sm:inline-flex">{a.cta}<ArrowUpRight className="size-3.5" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-ink-500"><CheckCircle2 className="size-5 text-[#4ee39f]" />Tudo em dia. Nenhuma pendência agora.</div>
          )}
        </Card>
        <Card className="space-y-5 p-5">
          <GoalCard goal={ctx.settings.monthlyGoal} done={cmp.cur} canEdit={can(ctx.role, "settings:write")} />
          <div className="border-t border-line pt-4">
            <div className="text-[13px] text-white/55">Este mês x mês passado <span className="text-white/35">(até o dia {Number(t.slice(8, 10))})</span></div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Compare label="Clientes que voltaram" cur={cmp.cur} prev={cmp.prev} fmt={num} />
              <Compare label="Receita recuperada" cur={cmp.curRev} prev={cmp.prevRev} fmt={money} />
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <div className="text-[13px] text-white/55">Taxa de recuperação <span className="text-white/35">(90 dias)</span></div>
            {cmp.rate90 !== null ? (
              <p className="mt-1 text-[12.5px] text-white/50"><b className="num text-[22px] font-semibold text-white">{pct(cmp.rate90, 0)}</b> · {num(cmp.recovered90)} de {num(cmp.contacted90)} clientes contatados voltaram</p>
            ) : <p className="mt-1 text-[12.5px] text-white/45">Aparece depois que você enviar a primeira campanha.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Maior potencial de retorno" description="Score combina valor, fidelidade, recência e contato autorizado" action={<Link href="/inativos" className="text-[13px] font-medium text-brand-600 hover:underline">Ver todos</Link>} />
          <ul className="divide-y divide-line">
            {top.map((c) => {
              const last = lastActivity(c, ctx.settings);
              return (
                <li key={c.id}>
                  <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                    <ScorePill score={c.priorityScore} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="truncate text-xs text-ink-500">{c.favoriteService ?? "—"} · {c.visitCount} {seg.vocab.visits} · ticket {money(c.avgTicketCents)}</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <StatusBadge status={c.status} />
                      <div className="mt-1 text-[11px] text-ink-500">{last ? `${daysBetween(last, t)} dias` : "—"}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {!top.length && <li className="px-5 py-8 text-center text-sm text-ink-500">Nenhum cliente afastado. Ótimo sinal!</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            <ButtonLink href="/inativos">Ver prioridades<ArrowUpRight className="size-4" /></ButtonLink>
            <Link href="/agente" className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-950"><Sparkles className="size-3.5" />Pedir um plano ao agente</Link>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Saúde da base" description="Distribuição por status" />
            <div className="grid grid-cols-[minmax(140px,1fr)_1fr] items-center gap-4 p-4">
              <StatusDonut data={donut} />
              <ul className="space-y-2 text-[13px]">
                {donut.filter((d) => d.value > 0).map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink-700"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.label}</span>
                    <span className="num text-ink-500">{num(d.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card>
            <CardHeader title="Atividade recente" action={<Link href="/configuracoes#auditoria" className="text-[13px] font-medium text-brand-600 hover:underline">Ver tudo</Link>} />
            <ActivityFeed items={activity} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Compare({ label, cur, prev, fmt }: { label: string; cur: number; prev: number; fmt: (n: number) => string }) {
  const diff = prev ? (cur - prev) / prev : null;
  const up = cur >= prev;
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <div className="truncate text-[11.5px] text-white/45">{label}</div>
      <div className="num mt-1 truncate text-[17px] font-semibold text-white">{fmt(cur)}</div>
      <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${cur === prev ? "text-white/40" : up ? "text-[#4ee39f]" : "text-st-high-text"}`}>
        {cur !== prev && (up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
        {diff === null ? (cur ? "sem base no mês passado" : "igual ao mês passado") : `${diff > 0 ? "+" : ""}${Math.round(diff * 100)}% · antes ${fmt(prev)}`}
      </div>
    </div>
  );
}
