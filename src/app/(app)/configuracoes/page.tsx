import { asc, desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { getDb, withOrg } from "@/db/client";
import { auditLogs, blocklist, memberships, plans, users } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { SEGMENTS } from "@/lib/segments";
import { getUsage } from "@/lib/plans";
import { dateTimeBR, money, num } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, ProgressBar, cx } from "@/components/ui";
import { BlocklistForm, BusinessForm, MembersForm, RulesForm } from "@/components/settings-forms";
import { BillingPanel } from "@/components/billing-panel";
import { billingPayments } from "@/db/schema";
import { accessState, billingEnforced, getSubscription } from "@/lib/billing/service";
import { asaasConfigured, asaasEnv } from "@/lib/billing/asaas";

const PAY_STATUS: Record<string, [string, "success" | "warn" | "danger" | "neutral"]> = {
  PENDING: ["Em aberto", "neutral"], CONFIRMED: ["Paga", "success"], RECEIVED: ["Paga", "success"], RECEIVED_IN_CASH: ["Paga", "success"],
  OVERDUE: ["Vencida", "danger"], REFUNDED: ["Estornada", "warn"], REFUND_REQUESTED: ["Estorno solicitado", "warn"],
  CHARGEBACK_REQUESTED: ["Contestação", "danger"], CHARGEBACK_DISPUTE: ["Contestação", "danger"], AWAITING_RISK_ANALYSIS: ["Em análise", "neutral"],
};

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireCtx("customers:read");
  const db = await getDb();
  const canEdit = can(ctx.role, "settings:write");
  const { blocks, logs, usage } = await withOrg(ctx.org.id, async (tx) => ({
    blocks: await tx.select().from(blocklist).where(eq(blocklist.orgId, ctx.org.id)).orderBy(desc(blocklist.createdAt)).limit(200),
    logs: await tx.select().from(auditLogs).where(eq(auditLogs.orgId, ctx.org.id)).orderBy(desc(auditLogs.createdAt)).limit(40),
    usage: await getUsage(tx, ctx.org.id),
  }));
  const allPlans = await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  const members = await db.select({ userId: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, ctx.org.id));
  const plan = allPlans.find((p) => p.id === ctx.org.planId)!;
  const sub = await getSubscription(db, ctx.org.id, ctx.org.planId);
  const state = accessState(sub);
  const pays = await db.select().from(billingPayments).where(eq(billingPayments.orgId, ctx.org.id)).orderBy(desc(billingPayments.dueDate)).limit(12);
  const fmtDay = (d: Date | string | null) => d ? new Date(typeof d === "string" ? `${d}T12:00:00-03:00` : d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const billing = {
    configured: asaasConfigured(), sandbox: asaasEnv() === "sandbox", enforced: billingEnforced(), canEdit,
    label: state.label, tone: state.tone, until: state.until ? fmtDay(state.until) : null,
    hasSubscription: Boolean(sub.providerSubscriptionId), canceling: sub.cancelAtPeriodEnd, currentPlanId: plan.id,
    pendingPlanName: sub.pendingPlanId && sub.pendingPlanId !== plan.id ? allPlans.find((p) => p.id === sub.pendingPlanId)?.name ?? null : null,
    plans: allPlans.map((p) => ({ id: p.id, name: p.name, price: money(p.priceCents) })),
    defaults: { name: sub.billingName ?? ctx.org.name, email: sub.billingEmail ?? ctx.user.email },
    payments: pays.map((p) => ({ id: p.id, due: fmtDay(p.dueDate), value: money(p.valueCents), status: (PAY_STATUS[p.status] ?? [p.status, "neutral"])[0], tone: (PAY_STATUS[p.status] ?? [p.status, "neutral"])[1], invoiceUrl: p.invoiceUrl })),
  };

  return (
    <>
      <PageHeader guide="configuracoes" title="Configurações" description="Estabelecimento, critérios de inatividade, regras de contato, privacidade, equipe e plano." />
      {!canEdit && <div className="mb-4"><Notice>Você está em modo leitura. Peça a um administrador para alterar configurações.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Estabelecimento" />
          <div className="p-5">{canEdit ? <BusinessForm name={ctx.org.name} segment={ctx.org.segment} signature={ctx.settings.signature} segments={SEGMENTS.map((s) => ({ id: s.id, label: s.label }))} /> : <p className="text-sm">{ctx.org.name}</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Plano e consumo" description={`Plano ${plan.name} · ${money(plan.priceCents)}/mês`} />
          <div className="space-y-4 p-5 text-[13px]">
            {[["Solicitações de IA no mês", usage.aiRequests, plan.limits.aiRequestsPerMonth], ["Mensagens enviadas no mês", usage.messagesSent, plan.limits.messagesPerMonth]].map(([l, v, m]) => (
              <div key={l as string}><div className="mb-1 flex justify-between"><span>{l}</span><span className="num">{num(v as number)} / {num(m as number)}</span></div><ProgressBar value={(v as number) / (m as number)} /></div>
            ))}
            <div className="grid gap-2 sm:grid-cols-3">
              {allPlans.map((p) => (
                <div key={p.id} className={cx("rounded-lg border p-3", p.id === plan.id ? "border-ink-950 bg-paper" : "border-line")}>
                  <div className="flex items-center justify-between"><b>{p.name}</b>{p.id === plan.id && <Badge tone="dark">Atual</Badge>}</div>
                  <div className="num mt-1 text-base font-semibold">{money(p.priceCents)}<span className="text-xs font-normal text-ink-500">/mês</span></div>
                  <div className="mt-1 text-[11px] text-ink-500">até {num(p.limits.maxCustomers)} clientes · {p.limits.automations} automações · {p.limits.members} usuários</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="xl:col-span-2" id="assinatura">
          <CardHeader title="Assinatura" description="Pagamento por Pix, boleto ou cartão via Asaas. O plano é ativado só depois que o pagamento é confirmado." />
          <div className="p-5"><BillingPanel v={billing} /></div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Critérios de inatividade e regras de contato" description="Alterações reclassificam toda a base imediatamente." />
          <div className="p-5">{canEdit ? <RulesForm s={ctx.settings} retentionDays={ctx.org.dataRetentionDays} /> : <p className="text-sm">Em risco: {ctx.settings.thresholds.atRiskDays} dias · Inativo: {ctx.settings.thresholds.inactiveDays} · Altamente inativo: {ctx.settings.thresholds.highlyInactiveDays}</p>}</div>
        </Card>

        <Card id="equipe">
          <CardHeader title="Equipe e permissões" />
          <div className="p-5">{can(ctx.role, "members:write") ? <MembersForm members={members} me={ctx.user.id} roleLabels={ROLE_LABEL} /> :
            <ul className="space-y-1 text-[13px]">{members.map((m) => <li key={m.userId}>{m.name} — {ROLE_LABEL[m.role]}</li>)}</ul>}</div>
        </Card>

        <Card>
          <CardHeader title="Privacidade e LGPD" description="Controlador dos dados: o estabelecimento. Operador: GravitaSolves." />
          <div className="space-y-4 p-5 text-[13px]">
            <div>
              <div className="mb-2 font-medium">Lista de bloqueio</div>
              <p className="mb-2 text-xs text-ink-500">Contatos aqui nunca recebem mensagens, mesmo se reimportados.</p>
              {can(ctx.role, "customers:write") ? <BlocklistForm items={blocks.map((b) => ({ value: b.value, reason: b.reason }))} /> : <p>{blocks.length} contatos bloqueados.</p>}
            </div>
            <div className="border-t border-line pt-4">
              <div className="mb-1 font-medium">Portabilidade</div>
              <p className="mb-2 text-xs text-ink-500">Exporta clientes, visitas, consentimentos e bloqueios em JSON. Para um titular específico, use “Exportar dados” na ficha do cliente.</p>
              {can(ctx.role, "data:export") && <a href="/api/export/org" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-paper"><Download className="size-4" />Exportar base completa</a>}
            </div>
            <p className="border-t border-line pt-4 text-xs text-ink-500">Retenção atual: {num(ctx.org.dataRetentionDays)} dias sem atividade. Links de descadastro são incluídos em todos os e-mails; WhatsApp e SMS aceitam a resposta “SAIR”.</p>
          </div>
        </Card>

        <Card className="xl:col-span-2" id="auditoria">
          <CardHeader title="Registro de auditoria" description="Últimas 40 ações (sem dados pessoais)" />
          <ul className="thin-scroll max-h-96 divide-y divide-line overflow-auto text-[13px]">
            {logs.map((l) => (
              <li key={l.id} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2 sm:grid-cols-[150px_110px_1fr]">
                <span className="num text-ink-500">{dateTimeBR(l.createdAt)}</span>
                <span className="hidden sm:block"><Badge tone={l.actorType === "agent" ? "dark" : l.actorType === "system" ? "violet" : "neutral"}>{{ user: "Equipe", agent: "Agente", system: "Sistema", api: "API" }[l.actorType]}</Badge></span>
                <span><code className="text-ink-700">{l.action}</code>{l.summary && <span className="text-ink-500"> — {l.summary}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
