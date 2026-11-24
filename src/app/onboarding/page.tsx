import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Check } from "lucide-react";
import { withOrg } from "@/db/client";
import { campaigns, customers } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { SEGMENTS, getSegment } from "@/lib/segments";
import { getOverview } from "@/lib/analytics";
import { LAPSED, lastActivity } from "@/lib/classification";
import { daysBetween, today } from "@/lib/dates";
import { money, num } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import { Card, ScorePill, StatusBadge, cx } from "@/components/ui";
import { skipOnboardingAction } from "@/app/actions";
import { StepName, StepSegment, StepSize, StepConnect, StepRules, StepContinue, StepCampaign } from "./steps";
import { loadSourceState } from "@/lib/sources/state";

export const metadata = { title: "Primeiros passos" };

const STEPS = ["Estabelecimento", "Segmento", "Tamanho da base", "Conectar clientes", "Critérios de inatividade", "Primeira análise", "Primeira campanha"];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const ctx = await requireCtx();
  if (ctx.org.onboardingDone) redirect("/visao-geral");
  const sp = await searchParams;
  const reached = ctx.org.onboardingStep;
  const step = Math.min(Math.max(1, Number(sp.step) || reached), reached, 7);
  const seg = getSegment(ctx.org.segment);
  const t = today();

  const analysis = step >= 6 ? await withOrg(ctx.org.id, async (tx) => ({
    o: await getOverview(tx, ctx.org.id, ctx.settings),
    top: await tx.select().from(customers).where(and(eq(customers.orgId, ctx.org.id), inArray(customers.status, LAPSED))).orderBy(desc(customers.priorityScore)).limit(5),
    lastCampaign: (await tx.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, ctx.org.id)).orderBy(desc(campaigns.createdAt)).limit(1))[0],
  })) : null;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="bg-ink-950 px-6 py-6 text-white lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:py-10">
        <Logo tone="light" />
        <ol className="mt-8 hidden space-y-1 lg:block">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < reached, current = n === step;
            return (
              <li key={label}>
                <Link href={n <= reached ? `/onboarding?step=${n}` : "#"} className={cx("flex items-center gap-3 rounded-lg px-2 py-2 text-[13.5px]", current ? "bg-white/[0.07] text-white" : n <= reached ? "text-ink-300 hover:text-white" : "pointer-events-none text-ink-600")}>
                  <span className={cx("grid size-6 place-items-center rounded-full text-[11px] font-semibold", done ? "bg-citrus text-ink-950" : current ? "bg-white text-ink-950" : "bg-white/5 text-ink-500")}>{done ? <Check className="size-3.5" /> : n}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 lg:hidden">
          <div className="text-xs text-ink-400">Passo {step} de 7 · {STEPS[step - 1]}</div>
          <div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-1 rounded-full bg-citrus" style={{ width: `${(step / 7) * 100}%` }} /></div>
        </div>
        <form action={skipOnboardingAction} className="mt-8 hidden lg:block"><button className="text-xs text-ink-500 hover:text-ink-300">Pular configuração inicial</button></form>
      </aside>

      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-10 sm:px-8 lg:py-16">
        <div key={step} className="animate-rise">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-brand-600">Passo {step} de 7</div>
          {step === 1 && <StepName name={ctx.org.name} />}
          {step === 2 && <StepSegment current={ctx.org.segment} segments={SEGMENTS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, hint: `${s.thresholds.atRiskDays}/${s.thresholds.inactiveDays}/${s.thresholds.highlyInactiveDays} dias` }))} />}
          {step === 3 && <StepSize current={ctx.org.baseSize} />}
          {step === 4 && <StepConnect state={await loadSourceState(ctx)} />}
          {step === 5 && <StepRules s={ctx.settings} segmentLabel={seg.label} />}
          {step === 6 && analysis && (
            <>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">Sua primeira análise</h1>
              <p className="mt-1 text-sm text-ink-500">Com base nos dados importados e nos critérios de {seg.label.toLowerCase()}.</p>
              {analysis.o.total === 0 ? <p className="mt-6 text-sm">Nenhum cliente ainda. <Link className="underline" href="/onboarding?step=4">Voltar e conectar uma fonte</Link>.</p> : (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <Card className="p-4"><div className="text-xs text-ink-500">Clientes analisados</div><div className="num mt-1 text-2xl font-semibold">{num(analysis.o.total)}</div></Card>
                    <Card className="p-4"><div className="text-xs text-ink-500">Afastados (risco + inativos)</div><div className="num mt-1 text-2xl font-semibold text-st-inactive">{num(analysis.o.byStatus.at_risk + analysis.o.byStatus.inactive + analysis.o.byStatus.highly_inactive)}</div></Card>
                    <Card className="p-4"><div className="text-xs text-ink-500">Projeção recuperável</div><div className="num mt-1 text-2xl font-semibold">{money(analysis.o.projectedRecoverableCents)}</div><div className="text-[11px] text-ink-400">estimativa, não garantia</div></Card>
                  </div>
                  <Card className="mt-4">
                    <div className="border-b border-line px-5 py-3 text-sm font-semibold">Quem tem mais chance de voltar</div>
                    <ul className="divide-y divide-line">
                      {analysis.top.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                          <ScorePill score={c.priorityScore} /><span className="flex-1 font-medium">{c.name}</span>
                          <span className="hidden text-xs text-ink-500 sm:inline">{lastActivity(c, ctx.settings) ? `${daysBetween(lastActivity(c, ctx.settings)!, t)} dias` : ""} · ticket {money(c.avgTicketCents)}</span>
                          <StatusBadge status={c.status} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                  <p className="mt-4 text-[13px] text-ink-500">{num(analysis.o.contactableLapsed)} desses clientes autorizaram contato por algum canal — são eles que podem receber a campanha.</p>
                </>
              )}
              <StepContinue step={6} label="Ver campanha sugerida" />
            </>
          )}
          {step === 7 && <StepCampaign existing={analysis?.lastCampaign ?? null} tone={seg.defaultTone} />}
        </div>
      </main>
    </div>
  );
}
