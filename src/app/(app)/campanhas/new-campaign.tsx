"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X, Sparkles } from "lucide-react";
import { createCampaignAction } from "@/app/actions";
import { Button, Card, Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import type { Channel } from "@/db/schema";

export function NewCampaign({ defaultOpen, defaultStatus, defaultTone, offerIdeas, restriction, channels }: {
  defaultOpen: boolean; defaultStatus?: string; defaultTone: string; offerIdeas: string[]; restriction?: string; channels: Channel[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string>();
  const [offer, setOffer] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const preset = defaultStatus ? [defaultStatus] : ["at_risk", "inactive", "highly_inactive"];

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" />Nova campanha</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 animate-fade" onClick={() => setOpen(false)}>
          <div className="thin-scroll h-full w-full max-w-lg overflow-y-auto bg-surface shadow-2xl animate-rise" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-4">
              <h2 className="text-base font-semibold">Nova campanha de reativação</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4 text-ink-400" /></button>
            </div>
            <form className="space-y-5 p-6" action={(fd) => start(async () => {
              const r = await createCampaignAction(fd);
              if (!r.ok) return setError(r.error);
              router.push(`/campanhas/${r.data}`);
            })}>
              <Field label="Nome"><Input name="name" required defaultValue={`Reativação — ${new Date().toLocaleDateString("pt-BR")}`} /></Field>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink-700">Público</legend>
                <div className="flex flex-wrap gap-4">
                  <Checkbox name="statuses" value="at_risk" defaultChecked={preset.includes("at_risk")} label="Em risco" />
                  <Checkbox name="statuses" value="inactive" defaultChecked={preset.includes("inactive")} label="Inativos" />
                  <Checkbox name="statuses" value="highly_inactive" defaultChecked={preset.includes("highly_inactive")} label="Altamente inativos" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Mínimo de dias sem visita"><Input name="minDays" type="number" min={0} placeholder="opcional" /></Field>
                  <Field label="Máximo de dias sem visita"><Input name="maxDays" type="number" min={0} placeholder="opcional" /></Field>
                  <Field label="Potencial mínimo (0–100)"><Input name="minPriority" type="number" min={0} max={100} placeholder="opcional" /></Field>
                  <Field label="Limite de clientes"><Input name="limit" type="number" min={1} max={5000} placeholder="até 5.000" /></Field>
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canal">
                  <Select name="channel" defaultValue="whatsapp">
                    {(["whatsapp", "email", "sms"] as Channel[]).map((c) => <option key={c} value={c} disabled={!channels.includes(c)}>{{ whatsapp: "WhatsApp", email: "E-mail", sms: "SMS" }[c]}{!channels.includes(c) ? " (outro plano)" : ""}</option>)}
                  </Select>
                </Field>
                <Field label="Tom de voz"><Input name="tone" defaultValue={defaultTone} /></Field>
              </div>
              <Field label="Oferta (opcional)" hint={restriction ? `Atenção: ${restriction}` : "Só use ofertas que você realmente pode cumprir."}>
                <Input name="offer" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Ex.: barba de cortesia no próximo corte" />
                {offerIdeas.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {offerIdeas.map((o) => <button type="button" key={o} onClick={() => setOffer(o)} className="rounded-md bg-paper px-2 py-1 text-xs text-ink-600 ring-1 ring-line hover:text-ink-950">{o}</button>)}
                  </div>
                )}
              </Field>
              <Field label="Objetivo (opcional)"><Textarea name="objective" rows={2} placeholder="Ex.: trazer de volta quem fazia barba toda semana" /></Field>
              <Notice><Sparkles className="mr-1 inline size-3.5" />As mensagens são geradas para o grupo e personalizadas por cliente. A campanha nasce como <b>rascunho</b>: nada é enviado sem revisão.</Notice>
              {error && <Notice tone="danger">{error}</Notice>}
              <Button className="w-full" disabled={pending}>{pending ? "Gerando mensagens…" : "Criar rascunho"}</Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
