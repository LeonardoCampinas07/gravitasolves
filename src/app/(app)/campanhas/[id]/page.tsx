import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Sparkles } from "lucide-react";
import { withOrg } from "@/db/client";
import { campaignMessages, campaigns, customers, integrations } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCampaignStats } from "@/lib/analytics";
import { CHANNEL_LABEL, CHANNEL_PROVIDER } from "@/lib/channels";
import { SKIP_LABEL, lintMessage, type SkipReason } from "@/lib/campaigns/compliance";
import { STATUS_LABEL } from "@/lib/classification";
import { dateTimeBR, money, num, pct } from "@/lib/format";
import { Badge, Card, CardHeader, Kpi, Notice } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/lib/campaigns/labels";
import { CampaignControls, CopyEditor, MessageList } from "./controls";
import { InfoTip, PageGuide } from "@/components/guide";

export const metadata = { title: "Campanha" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx("customers:read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withOrg(ctx.org.id, async (tx) => {
    const [c] = await tx.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, ctx.org.id)));
    if (!c) return null;
    const [stats] = await getCampaignStats(tx, ctx.org.id, id);
    const msgs = await tx.select({ m: campaignMessages, name: customers.name, phone: customers.phone, email: customers.email, status: customers.status, isDemo: customers.isDemo })
      .from(campaignMessages).innerJoin(customers, eq(customers.id, campaignMessages.customerId))
      .where(eq(campaignMessages.campaignId, id)).orderBy(asc(campaignMessages.status), asc(customers.name)).limit(500);
    const skipped = await tx.select({ reason: campaignMessages.skipReason, n: sql<number>`count(*)::int` }).from(campaignMessages)
      .where(and(eq(campaignMessages.campaignId, id), eq(campaignMessages.status, "skipped"))).groupBy(campaignMessages.skipReason);
    const [integ] = await tx.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.orgId, ctx.org.id), eq(integrations.provider, CHANNEL_PROVIDER[c.channel])));
    return { c, stats, msgs, skipped, hasIntegration: !!integ };
  });
  if (!data) notFound();
  const { c, stats, msgs, skipped, hasIntegration } = data;
  const st = CAMPAIGN_STATUS[c.status];
  const editable = c.status === "draft" || c.status === "pending_approval";
  const warnings = [...new Set(c.variants.flatMap((v) => lintMessage(v, c.channel, ctx.org.segment)))];
  const queued = msgs.filter((x) => x.m.status === "queued");

  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-950"><ArrowLeft className="size-3.5" />Campanhas</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between animate-rise">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{c.name}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
            {c.generatedBy === "ai" ? <Badge tone="dark"><Sparkles className="size-2.5" />Mensagens por IA</Badge> : c.generatedBy === "template" ? <Badge>Modelos do segmento</Badge> : <Badge>Texto da equipe</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {CHANNEL_LABEL[c.channel]} · criada {c.createdByType === "agent" ? "pelo agente" : c.createdByType === "automation" ? "por automação" : "pela equipe"} em {dateTimeBR(c.createdAt)}
            {c.approvedAt && ` · aprovada em ${dateTimeBR(c.approvedAt)}`}
          </p>
        </div>
        <CampaignControls campaignId={c.id} status={c.status} channel={c.channel} hasIntegration={hasIntegration} queued={queued.length}
          canWrite={can(ctx.role, "campaigns:write")} canApprove={can(ctx.role, "campaigns:approve")} canSend={can(ctx.role, "campaigns:send")} requiresApproval={c.requiresApproval} />
      </div>

      <PageGuide id="campanha" />
      {/* Antes do envio, só os números que importam; entregues/respostas aparecem quando houver envio. */}
      <div className={`grid grid-cols-2 gap-3 ${stats.sent ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
        <Kpi label="Elegíveis" value={num(stats.audience - stats.skipped)} hint={`de ${num(stats.audience)} no público`} />
        <Kpi label="Enviadas" value={num(stats.sent)} hint={stats.failed ? `${stats.failed} falharam` : undefined} />
        {stats.sent > 0 && <Kpi label="Entregues" value={num(stats.delivered)} hint={pct(stats.delivered / stats.sent)} />}
        {stats.sent > 0 && <Kpi label="Respostas" value={num(stats.replied)} />}
        <Kpi label="Retornaram" value={num(stats.returned)} accent="var(--color-st-recovered)" hint={`${money(stats.revenueCents)} registrados`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Mensagens" description={editable ? "Edite as variações; elas são distribuídas entre os clientes para evitar textos repetidos." : "Variações usadas nesta campanha."} />
          <div className="p-5">
            {c.rationale && <Notice><b>Estratégia:</b> {c.rationale}</Notice>}
            {warnings.length > 0 && <div className="mt-3"><Notice tone="warn" title="Revise antes de aprovar">{warnings.map((w) => <div key={w}>• {w}</div>)}</Notice></div>}
            <div className="mt-4">
              <CopyEditor campaignId={c.id} name={c.name} variants={c.variants} emailSubject={c.emailSubject} channel={c.channel} editable={editable && can(ctx.role, "campaigns:write")} />
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Público e regras de contato" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {(c.audience.statuses ?? []).map((s) => <Badge key={s}>{STATUS_LABEL[s]}</Badge>)}
                {c.audience.minDaysInactive !== undefined && <Badge>≥ {c.audience.minDaysInactive} dias</Badge>}
                {c.audience.maxDaysInactive !== undefined && <Badge>≤ {c.audience.maxDaysInactive} dias</Badge>}
                {c.audience.minPriority !== undefined && <Badge>potencial ≥ {c.audience.minPriority}</Badge>}
                {c.offer && <Badge tone="brand">Oferta: {c.offer}</Badge>}
              </div>
              {skipped.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1 text-[13px] font-medium">Fora do envio ({num(stats.skipped)}) <InfoTip text="Clientes que não podem receber esta mensagem agora: sem autorização no canal, descadastrados, bloqueados ou contatados recentemente. Isso protege você e o cliente (LGPD)." /></div>
                  <ul className="space-y-1 text-[13px] text-ink-600">
                    {skipped.map((s) => <li key={s.reason} className="flex justify-between gap-3"><span>{SKIP_LABEL[s.reason as SkipReason] ?? (s.reason === "cancelled" ? "Campanha cancelada" : s.reason)}</span><span className="num">{num(Number(s.n))}</span></li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-ink-500">Regras aplicadas: consentimento por canal, descadastro, lista de bloqueio, intervalo mínimo de {ctx.settings.frequencyCapDays} dias e até {ctx.settings.maxMessagesPer30Days} mensagens em 30 dias por cliente. Revalidadas no momento do envio.</p>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Mensagens por cliente" description={msgs.length >= 500 ? "Mostrando as primeiras 500." : `${num(msgs.length)} clientes`} />
        <MessageList campaignId={c.id} channel={c.channel} manualEnabled={(c.status === "approved" || c.status === "sending") && can(ctx.role, "campaigns:send")}
          rows={msgs.map((x) => ({ id: x.m.id, customerId: x.m.customerId, name: x.name, phone: x.phone, email: x.email, body: x.m.body, status: x.m.status, skipReason: x.m.skipReason, error: x.m.error, sentVia: x.m.sentVia, isDemo: x.isDemo }))} />
      </Card>
    </>
  );
}
