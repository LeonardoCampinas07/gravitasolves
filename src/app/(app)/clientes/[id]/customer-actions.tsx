"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Download, Megaphone, Trash2, UserX, X } from "lucide-react";
import { campaignFromSelectionAction, deleteCustomerAction, optOutAction, recordVisitAction, saveCustomerProfileAction, setConsentAction } from "@/app/actions";
import { Button, Card, Checkbox, Field, Input, Notice } from "@/components/ui";
import type { Channel } from "@/db/schema";

export function CustomerActions({ customerId, canDelete, canExport, optedOut }: { customerId: string; canDelete: boolean; canExport: boolean; optedOut: boolean }) {
  const [modal, setModal] = useState<"visit" | "delete" | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const [pending, start] = useTransition();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setModal("visit")}><CalendarPlus className="size-4" />Registrar visita</Button>
      {!optedOut && <Button variant="secondary" disabled={pending} onClick={() => confirm("Registrar que o cliente pediu para não receber mensagens? Todos os consentimentos serão revogados.") && start(async () => { await optOutAction(customerId); })}><UserX className="size-4" />Descadastrar</Button>}
      {canExport && <a className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper" href={`/api/export/customer/${customerId}`}><Download className="size-4" />Exportar dados</a>}
      {canDelete && <Button variant="danger" onClick={() => setModal("delete")}><Trash2 className="size-4" />Excluir</Button>}
      {msg && <div className="w-full"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 animate-fade" onClick={() => setModal(null)}>
          <Card className="w-full max-w-sm p-5 shadow-2xl animate-rise" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{modal === "visit" ? "Registrar visita / compra" : "Excluir dados do cliente"}</h2>
              <button onClick={() => setModal(null)} aria-label="Fechar"><X className="size-4 text-ink-400" /></button>
            </div>
            {modal === "visit" ? (
              <form className="space-y-3" action={(fd) => start(async () => {
                const r = await recordVisitAction(customerId, fd);
                setModal(null);
                setMsg(r.ok ? { tone: "success", text: r.data?.recovered ? "Visita registrada — retorno atribuído à campanha!" : "Visita registrada." } : { tone: "danger", text: r.error ?? "Erro" });
              })}>
                <Field label="Data"><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
                <Field label="Valor (R$)" hint="Usado para medir a receita recuperada."><Input name="amount" inputMode="decimal" placeholder="0,00" /></Field>
                <Field label="Descrição"><Input name="description" placeholder="Ex.: corte + barba" /></Field>
                <Button className="w-full" disabled={pending}>{pending ? "Salvando…" : "Registrar"}</Button>
              </form>
            ) : (
              <form className="space-y-4" action={(fd) => start(async () => { await deleteCustomerAction(customerId, fd.get("keep") === "on"); })}>
                <p className="text-sm text-ink-600">Remove permanentemente o cliente, visitas, mensagens e histórico de consentimento (direito de eliminação — LGPD art. 18, VI). Não pode ser desfeito.</p>
                <Checkbox name="keep" defaultChecked label="Manter telefone/e-mail na lista de bloqueio" hint="Recomendado: impede que o contato seja reimportado e acionado por engano." />
                <Button variant="danger" className="w-full" disabled={pending}>{pending ? "Excluindo…" : "Excluir definitivamente"}</Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export function ConsentToggles({ customerId, state, has, disabled }: { customerId: string; state: Record<Channel, boolean>; has: Record<Channel, boolean>; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const labels: Record<Channel, string> = { whatsapp: "WhatsApp", email: "E-mail", sms: "SMS" };
  return (
    <div className="space-y-2.5">
      {(Object.keys(labels) as Channel[]).map((ch) => (
        <label key={ch} className="flex items-center justify-between text-sm">
          <span className={has[ch] ? "" : "text-ink-400"}>{labels[ch]}{!has[ch] && <span className="ml-1 text-xs">(sem {ch === "email" ? "e-mail" : "telefone"})</span>}</span>
          <input type="checkbox" className="size-4 accent-brand-600" checked={state[ch]} disabled={disabled || pending || !has[ch]}
            onChange={(e) => {
              const v = e.target.checked;
              if (v && !confirm(`Confirme que o cliente autorizou receber mensagens por ${labels[ch]}. O registro ficará no histórico de consentimento.`)) return;
              start(async () => { const r = await setConsentAction(customerId, ch, v); if (!r.ok) setError(r.error); });
            }} />
        </label>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

export function ProfileEditor({ customerId, notes, tags, editable }: { customerId: string; notes: string; tags: string[]; editable: boolean }) {
  const [list, setList] = useState(tags);
  const [text, setText] = useState(notes);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const add = () => { const t = draft.trim().toLowerCase().slice(0, 30); if (t && !list.includes(t) && list.length < 12) setList([...list, t]); setDraft(""); };
  if (!editable) return (
    <div className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap gap-1">{list.length ? list.map((t) => <span key={t} className="rounded-full bg-paper px-2 py-px text-[12px] ring-1 ring-line">#{t}</span>) : <span className="text-ink-400">Sem etiquetas</span>}</div>
      <p className="whitespace-pre-line text-ink-600">{notes || "Sem anotações."}</p>
    </div>
  );
  return (
    <div className="space-y-3 px-5 py-4">
      <div>
        <div className="mb-1.5 text-[12px] text-ink-500">Etiquetas</div>
        <div className="flex flex-wrap gap-1">
          {list.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-px text-[12px] ring-1 ring-line">#{t}
              <button type="button" onClick={() => setList(list.filter((x) => x !== t))} aria-label={`Remover ${t}`} className="text-ink-400 hover:text-ink-950"><X className="size-3" /></button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Input value={draft} maxLength={30} placeholder="ex.: vip, aniversário em maio" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>Adicionar</Button>
        </div>
      </div>
      <Field label="Anotações internas" hint="Só sua equipe vê. Ex.: prefere horário de sábado, alergia a produto X.">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button disabled={pending} onClick={() => start(async () => {
        const r = await saveCustomerProfileAction(customerId, text, list);
        setMsg(r.ok ? { tone: "success", text: "Salvo." } : { tone: "danger", text: r.error ?? "Erro" });
      })}>{pending ? "Salvando…" : "Salvar"}</Button>
    </div>
  );
}

export function StartRecoveryButton({ customerId, channel }: { customerId: string; channel: Channel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div>
      <Button variant="accent" disabled={pending} onClick={() => start(async () => {
        const r = await campaignFromSelectionAction([customerId], channel);
        if (r.ok && r.data) router.push(`/campanhas/${r.data}`); else setError(r.error ?? "Erro");
      })}><Megaphone className="size-4" />{pending ? "Criando…" : "Criar mensagem de retorno"}</Button>
      <p className="mt-1.5 text-[11.5px] text-ink-400">Cria um rascunho com mensagem sugerida. Você revisa e aprova antes de qualquer envio.</p>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
