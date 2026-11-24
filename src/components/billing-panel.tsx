"use client";
import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { cancelSubscriptionAction, refreshPaymentsAction, subscribeAction } from "@/app/actions";
import { Badge, Button, Field, Input, Notice, Select } from "@/components/ui";

export interface BillingView {
  configured: boolean;
  sandbox: boolean;
  enforced: boolean;
  canEdit: boolean;
  label: string;
  tone: "success" | "warn" | "danger" | "neutral";
  until: string | null;
  hasSubscription: boolean;
  canceling: boolean;
  currentPlanId: string;
  pendingPlanName: string | null;
  plans: { id: string; name: string; price: string }[];
  defaults: { name: string; email: string };
  payments: { id: string; due: string; value: string; status: string; tone: "success" | "warn" | "danger" | "neutral"; invoiceUrl: string | null }[];
}

const BADGE: Record<BillingView["tone"], "brand" | "warn" | "danger" | "neutral"> = { success: "brand", warn: "warn", danger: "danger", neutral: "neutral" };

export function BillingPanel({ v }: { v: BillingView }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warn"; text: string; url?: string | null }>();
  const [planId, setPlanId] = useState(v.pendingPlanName ? v.plans.find((p) => p.name === v.pendingPlanName)?.id ?? v.currentPlanId : v.currentPlanId);

  if (!v.configured)
    return <Notice title="Cobrança ainda não ativada">Para cobrar assinaturas, crie uma conta no Asaas e defina <code>ASAAS_API_KEY</code> e <code>ASAAS_WEBHOOK_TOKEN</code> no servidor (passo a passo em docs/07-PAGAMENTOS.md). Enquanto isso, todos os recursos continuam liberados.</Notice>;

  const subscribe = (fd: FormData) => start(async () => {
    setMsg(undefined);
    const r = await subscribeAction(fd);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error ?? "Erro" });
    if (r.data?.changedOnly) setMsg({ tone: "success", text: "Plano alterado. O novo valor vale a partir da próxima cobrança; o plano muda quando ela for paga." });
    else setMsg({ tone: "success", text: "Assinatura criada. Pague a primeira fatura (Pix, boleto ou cartão) — o plano é ativado automaticamente assim que o Asaas confirmar o pagamento.", url: r.data?.invoiceUrl });
  });

  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={BADGE[v.tone]}>{v.label}</Badge>
        {v.until && <span className="text-ink-500">{v.tone === "success" ? "renova em" : "até"} {v.until}</span>}
        {v.pendingPlanName && <span className="text-ink-500">· muda para {v.pendingPlanName} no próximo pagamento</span>}
        {v.sandbox && <Badge tone="warn">Sandbox — sem cobrança real</Badge>}
      </div>

      {v.canEdit ? (
        <form action={subscribe} className="grid gap-3 sm:grid-cols-2">
          <Field label="Plano">
            <Select name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {v.plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price}/mês</option>)}
            </Select>
          </Field>
          <Field label="CPF ou CNPJ (para a nota/fatura)"><Input name="document" inputMode="numeric" placeholder="00.000.000/0000-00" required /></Field>
          <Field label="Nome ou razão social"><Input name="name" defaultValue={v.defaults.name} required /></Field>
          <Field label="E-mail de cobrança"><Input name="email" type="email" defaultValue={v.defaults.email} required /></Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button disabled={pending}>{v.hasSubscription && !v.canceling ? "Trocar plano" : "Assinar"}</Button>
            {v.hasSubscription && !v.canceling && (
              <Button type="button" variant="secondary" disabled={pending}
                onClick={() => confirm("Cancelar a renovação? Você mantém o acesso até o fim do período já pago.") && start(async () => {
                  const r = await cancelSubscriptionAction();
                  setMsg(r.ok ? { tone: "success", text: "Renovação cancelada. O acesso continua até o fim do período pago." } : { tone: "danger", text: r.error ?? "Erro" });
                })}>Cancelar assinatura</Button>
            )}
            {v.hasSubscription && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await refreshPaymentsAction(); if (!r.ok) setMsg({ tone: "danger", text: r.error ?? "Erro" }); })}>
                <RefreshCw className="size-3.5" />Atualizar faturas
              </Button>
            )}
          </div>
        </form>
      ) : <p className="text-ink-500">Só administradores podem alterar a assinatura.</p>}

      {msg && <Notice tone={msg.tone}>{msg.text}{msg.url && <> <a className="font-medium underline" href={msg.url} target="_blank" rel="noopener noreferrer">Abrir fatura</a></>}</Notice>}

      {v.payments.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-500">Faturas</div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {v.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="num">{p.due}</span>
                <span className="num">{p.value}</span>
                <Badge tone={BADGE[p.tone]}>{p.status}</Badge>
                {p.invoiceUrl ? <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">Fatura<ExternalLink className="size-3" /></a> : <span />}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink-500">{v.enforced ? "Sem assinatura em dia, IA, envios, importações e automações ficam pausados — seus dados continuam disponíveis para consulta e exportação." : "Bloqueio por falta de pagamento desativado neste servidor."} Troca de plano não gera cobrança proporcional: o novo valor vale a partir da próxima fatura.</p>
    </div>
  );
}
