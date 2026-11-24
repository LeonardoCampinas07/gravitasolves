import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { appointments, campaigns, customers } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { getPlan } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai/client";
import { Sidebar } from "@/components/sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { WelcomeTour } from "@/components/guide";
import Link from "next/link";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { accessState, billingEnforced, getSubscription } from "@/lib/billing/service";
import { Topbar } from "@/components/topbar";
import { getActionItems } from "@/lib/action-center";
import { SimBanner, SimTour } from "@/components/sim-tour";
import { Suspense } from "react";
import { HelpAssistant } from "@/components/help-assistant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.org.onboardingDone) redirect("/onboarding");
  const { lapsed, pending, demo, plan, requests, notifications } = await withOrg(ctx.org.id, async (tx) => {
    const [c] = await tx.select({
      lapsed: sql<number>`count(*) filter (where ${customers.status} in ('at_risk','inactive','highly_inactive'))::int`,
      demo: sql<number>`count(*) filter (where ${customers.isDemo})::int`,
    }).from(customers).where(eq(customers.orgId, ctx.org.id));
    const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(campaigns)
      .where(and(eq(campaigns.orgId, ctx.org.id), inArray(campaigns.status, ["pending_approval"])));
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(appointments)
      .where(and(eq(appointments.orgId, ctx.org.id), eq(appointments.status, "requested")));
    return { lapsed: Number(c.lapsed), demo: Number(c.demo), pending: Number(p.n), requests: Number(r.n), plan: await getPlan(tx, ctx.org.planId), notifications: await getActionItems(tx, ctx.org.id, ctx.settings) };
  });
  // Aviso de assinatura (só quando a cobrança está ativada neste servidor).
  let billing: { text: string; danger: boolean } | null = null;
  if (billingEnforced() && !ctx.sim) {
    const st = await withOrg(ctx.org.id, async (tx) => accessState(await getSubscription(tx, ctx.org.id, ctx.org.planId)));
    const until = st.until ? st.until.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    if (!st.active) billing = { text: `${st.label}. IA, envios, importações e automações estão pausados — seus dados continuam disponíveis.`, danger: true };
    else if (st.status === "trialing" && st.until) {
      const days = Math.ceil((st.until.getTime() - Date.now()) / 86_400_000);
      if (days <= 5) billing = { text: `Seu período de teste termina em ${days} dia${days === 1 ? "" : "s"} (${until}).`, danger: false };
    } else if (st.tone === "warn") billing = { text: `${st.label}${until ? ` — até ${until}` : ""}.`, danger: false };
  }
  const [me] = await (await getDb()).select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, ctx.user.id));
  return (
    <div className="theme-dark relative min-h-dvh">
      <div className="app-glow" aria-hidden />
      <Sidebar orgName={ctx.org.name} userName={ctx.user.name} planName={plan.name} badges={{ lapsed, pending, requests }} aiMode={aiEnabled() && !ctx.sim ? "ai" : "basic"} notifications={notifications} sim={ctx.sim} />
      <div className="relative z-[1] min-w-0 lg:pl-[248px]">
        {billing && (
          <div className={billing.danger ? "border-b border-st-high/30 bg-st-high/10 px-4 py-2 text-[13px] text-st-high-text sm:px-8" : "border-b border-st-risk/30 bg-st-risk/10 px-4 py-2 text-[13px] text-st-risk-text sm:px-8"} role="status">
            {billing.text} <Link href="/configuracoes#assinatura" className="font-medium underline">Ver assinatura</Link>
          </div>
        )}
        {ctx.sim && <SimBanner />}
        {!me?.v && !ctx.sim && <VerifyEmailBanner email={ctx.user.email} />}
        {demo > 0 && !ctx.sim && <DemoBanner count={demo} canRemove={ctx.role === "owner" || ctx.role === "admin"} />}
        <Topbar userName={ctx.user.name} notifications={notifications} />
        <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-4">{children}</main>
        {ctx.sim ? <Suspense fallback={null}><SimTour /></Suspense> : <WelcomeTour />}
        <HelpAssistant />
      </div>
    </div>
  );
}
