import { desc, eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { apiKeys, integrations, type Provider } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PROVIDER_FIELDS } from "@/lib/channels";
import { getPlan } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai/client";
import { dateTimeBR } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { ApiKeys, ProviderForm } from "./forms";

export const metadata = { title: "Integrações" };

export default async function IntegrationsPage() {
  const ctx = await requireCtx("customers:read");
  const db = await getDb();
  const rows = await db.select({ provider: integrations.provider, config: integrations.config, updatedAt: integrations.updatedAt, status: integrations.status }).from(integrations).where(eq(integrations.orgId, ctx.org.id));
  const keys = await db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.orgId, ctx.org.id)).orderBy(desc(apiKeys.createdAt));
  const plan = await withOrg(ctx.org.id, (tx) => getPlan(tx, ctx.org.planId));
  const canWrite = can(ctx.role, "integrations:write");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));

  return (
    <>
      <PageHeader guide="integracoes" title="Integrações" description="Opcional: conecte o WhatsApp oficial, e-mail ou SMS para o GravitaSolves enviar as mensagens sozinho. Sem isso, você envia pelo seu próprio WhatsApp com um clique." />

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PROVIDER_FIELDS) as Provider[]).map((p) => {
          const def = PROVIDER_FIELDS[p];
          const row = byProvider[p];
          const allowed = plan.limits.channels.includes(def.channel);
          return (
            <Card key={p} className="flex flex-col">
              <CardHeader title={def.label} description={row ? `Conectado · atualizado ${dateTimeBR(row.updatedAt)}` : "Não conectado"}
                action={row ? <Badge tone="brand">Ativo</Badge> : !allowed ? <Badge tone="warn">Outro plano</Badge> : <Badge>Desligado</Badge>} />
              <div className="flex-1 p-5">
                {canWrite && allowed ? <ProviderForm provider={p} fields={def.fields} secretLabel={def.secretLabel} config={row?.config ?? {}} connected={!!row} /> :
                  <p className="text-sm text-ink-500">{allowed ? "Somente administradores podem alterar integrações." : `Canal disponível nos planos superiores.`}</p>}
                <a href={def.docs} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs text-ink-500 underline">Ajuda oficial do serviço</a>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Como conectar o WhatsApp oficial" description="Leva cerca de 1 dia por causa da aprovação da Meta" />
          <ol className="space-y-3 p-5 text-[13px] leading-relaxed text-ink-700">
            <li><b>1. Crie a conta na Meta.</b> Entre em business.facebook.com e cadastre o WhatsApp Business com o número do seu negócio.</li>
            <li><b>2. Crie o modelo de mensagem.</b> No WhatsApp Manager, crie um modelo da categoria <b>Marketing</b>, idioma <b>Português (BR)</b>, com este texto:
              <pre className="mt-2 rounded-lg bg-ink-950 p-3 text-[12px] text-citrus">Olá, {"{{1}}"}! {"{{2}}"}</pre>
              <span className="mt-1 block text-xs text-ink-500">O GravitaSolves troca {"{{1}}"} pelo nome do cliente e {"{{2}}"} pela mensagem da campanha. A Meta aprova em minutos ou até 1 dia.</span>
            </li>
            <li><b>3. Cole os dados aqui.</b> Copie da Meta o ID do número, o token e o nome do modelo, e cole no cartão “WhatsApp oficial” acima.</li>
          </ol>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-500">Achou complicado? Não é obrigatório: nas campanhas, o botão <b>“Abrir no WhatsApp”</b> abre a conversa no seu WhatsApp com a mensagem pronta.</p>
        </Card>
        <Card>
          <CardHeader title="Ligar com seu sistema de agenda" description={plan.limits.apiAccess ? "Para quem já usa outro sistema" : "Disponível a partir do plano Profissional"} />
          <div className="space-y-3 p-5 text-[13px] text-ink-700">
            <p>Se você usa outro sistema de agenda ou CRM, ele pode avisar o GravitaSolves sozinho a cada atendimento.{plan.limits.apiAccess ? " Gere uma chave abaixo e passe para quem cuida do seu sistema." : ""}</p>
            {plan.limits.apiAccess && canWrite && <ApiKeys keys={keys} />}
            <details className="text-xs text-ink-500">
              <summary className="cursor-pointer hover:text-ink-950">Instruções para o técnico</summary>
              <pre className="thin-scroll mt-2 overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11.5px] leading-relaxed text-ink-200">{`curl -X POST ${appUrl}/api/v1/visits \\
  -H "Authorization: Bearer gv_..." \\
  -H "Content-Type: application/json" \\
  -d '{"customer":{"phone":"+5511987654321"},
       "date":"2026-11-10","amount":80.00,
       "description":"Corte + barba"}'`}</pre>
              <p className="mt-2">Também: <code>POST /api/v1/customers</code> (até 500 clientes por chamada).</p>
            </details>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Inteligência artificial" />
        <div className="p-5 text-[13px] text-ink-700">
          {aiEnabled() ? <p>Ativada. O agente vê só o primeiro nome e números dos clientes — telefone e e-mail nunca saem do GravitaSolves.</p>
            : <p>O agente está no <b>modo básico</b>: responde perguntas prontas sobre seus clientes e as campanhas usam textos prontos para o seu tipo de negócio. Não precisa fazer nada aqui.</p>}
        </div>
      </Card>
    </>
  );
}
