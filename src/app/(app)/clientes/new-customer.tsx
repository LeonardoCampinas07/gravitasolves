"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { createCustomerAction } from "@/app/actions";
import { Button, Card, Checkbox, Field, Input, Notice } from "@/components/ui";

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><UserPlus className="size-4" />Novo cliente</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 animate-fade" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-md p-5 shadow-2xl animate-rise" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Novo cliente</h2>
              <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-950" aria-label="Fechar"><X className="size-4" /></button>
            </div>
            <form className="space-y-3" action={(fd) => start(async () => {
              const r = await createCustomerAction(fd);
              if (!r.ok) return setError(r.error);
              setOpen(false); router.push(`/clientes/${r.data}`);
            })}>
              <Field label="Nome"><Input name="name" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefone"><Input name="phone" placeholder="(11) 98765-4321" /></Field>
                <Field label="E-mail"><Input name="email" type="email" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Serviço preferido"><Input name="favoriteService" /></Field>
                <Field label="Profissional preferido"><Input name="preferredStaff" /></Field>
              </div>
              <Field label="Observações"><Input name="notes" /></Field>
              <div className="rounded-lg bg-paper p-3">
                <div className="mb-2 text-xs font-medium text-ink-600">O cliente autorizou receber mensagens por:</div>
                <div className="flex flex-wrap gap-4">
                  <Checkbox name="consent_whatsapp" label="WhatsApp" />
                  <Checkbox name="consent_email" label="E-mail" />
                  <Checkbox name="consent_sms" label="SMS" />
                </div>
              </div>
              {error && <Notice tone="danger">{error}</Notice>}
              <Button className="w-full" disabled={pending}>{pending ? "Salvando…" : "Salvar cliente"}</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
