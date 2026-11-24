"use client";
import { useState, useTransition } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { createAutomationAction, toggleAutomationAction } from "@/app/actions";
import { Button, Checkbox, Field, Input, Notice, Select } from "@/components/ui";

export function AutomationForm({ defaultTone, canAutoSend }: { defaultTone: string; canAutoSend: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  return (
    <form className="space-y-3" action={(fd) => start(async () => {
      const r = await createAutomationAction(fd);
      setMsg(r.ok ? { tone: "success", text: "Automação criada." } : { tone: "danger", text: r.error ?? "Erro" });
    })}>
      <Field label="Nome"><Input name="name" defaultValue="Lembrete para clientes em risco" required /></Field>
      <Field label="Quando o cliente virar">
        <Select name="triggerStatus" defaultValue="at_risk">
          <option value="at_risk">Em risco</option><option value="inactive">Inativo</option><option value="highly_inactive">Altamente inativo</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Canal"><Select name="channel" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="sms">SMS</option></Select></Field>
        <Field label="Tom"><Input name="tone" defaultValue={defaultTone} /></Field>
      </div>
      <Field label="Oferta (opcional)"><Input name="offer" /></Field>
      <Checkbox name="requiresApproval" defaultChecked label="Exigir aprovação antes de enviar" hint={canAutoSend ? "Desmarcado: a campanha é enviada automaticamente se o canal estiver conectado. Regras de consentimento e frequência valem sempre." : "Seu papel exige aprovação de um administrador."} disabled={!canAutoSend} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button className="w-full" disabled={pending}>Criar automação</Button>
    </form>
  );
}

export function AutomationRowActions({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await toggleAutomationAction(id, "toggle"); })} title={enabled ? "Pausar" : "Ativar"}>
        {enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => confirm("Excluir automação?") && start(async () => { await toggleAutomationAction(id, "delete"); })} title="Excluir"><Trash2 className="size-4" /></Button>
    </div>
  );
}
