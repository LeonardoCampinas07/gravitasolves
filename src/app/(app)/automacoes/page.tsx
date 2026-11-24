import { desc, eq } from "drizzle-orm";
import { Workflow } from "lucide-react";
import { withOrg } from "@/db/client";
import { automations } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getPlan } from "@/lib/plans";
import { getSegment } from "@/lib/segments";
import { STATUS_LABEL } from "@/lib/classification";
import { CHANNEL_LABEL } from "@/lib/channels";
import { dateTimeBR } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { AutomationForm, AutomationRowActions } from "./forms";

export const metadata = { title: "Automações" };

export default async function AutomationsPage() {
  const ctx = await requireCtx("customers:read");
  const { list, plan } = await withOrg(ctx.org.id, async (tx) => ({
    list: await tx.select().from(automations).where(eq(automations.orgId, ctx.org.id)).orderBy(desc(automations.createdAt)),
    plan: await getPlan(tx, ctx.org.planId),
  }));
  const seg = getSegment(ctx.org.segment);
  const canWrite = can(ctx.role, "automations:write");

  return (
    <>
      <PageHeader guide="automacoes" title="Automações" description="Regras que preparam campanhas sozinhas quando um cliente muda de status. Rodam uma vez por dia, junto com a reclassificação da base." />
      {plan.limits.automations === 0 && <div className="mb-4"><Notice tone="warn" title="Disponível a partir do plano Profissional">No plano {plan.name} você cria campanhas manualmente ou pelo agente. Automações preparam campanhas sem intervenção diária.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Regras ativas" description={`${list.length} de ${plan.limits.automations} permitidas no plano ${plan.name}`} />
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className={`grid size-9 place-items-center rounded-lg ${a.enabled ? "bg-ink-950 text-citrus" : "bg-paper text-ink-400 ring-1 ring-line"}`}><Workflow className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="mt-0.5 text-[13px] text-ink-500">
                      Quando o cliente virar <b className="text-ink-800">{STATUS_LABEL[a.triggerStatus]}</b> → preparar mensagem por <b className="text-ink-800">{CHANNEL_LABEL[a.channel]}</b>, tom {a.tone}{a.offer ? `, oferta: ${a.offer}` : ""}.
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone={a.requiresApproval ? "warn" : "brand"}>{a.requiresApproval ? "Requer aprovação" : "Envio automático (se canal conectado)"}</Badge>
                      {!a.enabled && <Badge>Pausada</Badge>}
                      <span className="text-[11px] text-ink-400">Última execução: {dateTimeBR(a.lastRunAt)}</span>
                    </div>
                  </div>
                  {canWrite && <AutomationRowActions id={a.id} enabled={a.enabled} />}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Workflow className="size-5" />} title="Nenhuma automação" description="Exemplo: quando um cliente entrar em risco, preparar uma mensagem de lembrete para aprovação." />}
        </Card>
        {canWrite && plan.limits.automations > 0 && (
          <Card className="self-start">
            <CardHeader title="Nova automação" />
            <div className="p-5"><AutomationForm defaultTone={seg.defaultTone} canAutoSend={can(ctx.role, "campaigns:approve")} /></div>
          </Card>
        )}
      </div>
    </>
  );
}
