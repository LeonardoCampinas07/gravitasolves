"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Send, XCircle, ExternalLink, Check } from "lucide-react";
import { campaignTransitionAction, dispatchCampaignAction, markManualAction, updateCampaignCopyAction } from "@/app/actions";
import { SKIP_LABEL, type SkipReason } from "@/lib/campaigns/compliance";
import { Badge, Button, Field, Input, Notice, Textarea, cx } from "@/components/ui";
import type { Channel } from "@/db/schema";

export function CampaignControls(p: {
  campaignId: string; status: string; channel: Channel; hasIntegration: boolean; queued: number;
  canWrite: boolean; canApprove: boolean; canSend: boolean; requiresApproval: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warn"; text: string }>();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? (ok ? { tone: "success", text: ok } : undefined) : { tone: "danger", text: r.error ?? "Erro" });
  });
  return (
    <div className="flex max-w-md flex-col items-stretch gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {p.status === "draft" && p.canWrite && (
          <Button disabled={pending} onClick={() => run(() => campaignTransitionAction(p.campaignId, "submit"))}>
            {p.requiresApproval ? "Enviar para aprovação" : "Liberar para envio"}
          </Button>
        )}
        {(p.status === "pending_approval" || (p.status === "draft" && !p.canWrite)) && p.canApprove && (
          <Button variant="accent" disabled={pending} onClick={() => confirm("Aprovar a campanha? Você revisou as mensagens e o público.") && run(() => campaignTransitionAction(p.campaignId, "approve"))}><CheckCircle2 className="size-4" />Aprovar</Button>
        )}
        {p.status === "pending_approval" && !p.canApprove && <Badge tone="warn">Aguardando um administrador aprovar</Badge>}
        {(p.status === "approved" || p.status === "sending") && p.canSend && p.queued > 0 && (
          p.hasIntegration ? (
            <Button disabled={pending} onClick={() => confirm(`Enviar ${p.queued} mensagens agora pelo canal configurado?`) && start(async () => {
              const r = await dispatchCampaignAction(p.campaignId);
              if (!r.ok || !r.data) return setMsg({ tone: "danger", text: r.error ?? "Erro" });
              const d = r.data;
              setMsg({ tone: d.failed ? "warn" : "success", text: `${d.sent} enviadas, ${d.failed} falharam, ${d.skipped} bloqueadas na revalidação${d.remaining ? `, ${d.remaining} restantes (limite do lote/plano)` : ""}.${d.errors.length ? " Erros: " + d.errors.join("; ") : ""}` });
            })}><Send className="size-4" />{pending ? "Enviando…" : `Enviar ${p.queued} mensagens`}</Button>
          ) : (
            <Link href="/integracoes" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper">Conectar canal para envio automático</Link>
          )
        )}
        {!["completed", "cancelled"].includes(p.status) && p.canWrite && (
          <Button variant="ghost" disabled={pending} onClick={() => confirm("Cancelar a campanha? Mensagens na fila não serão enviadas.") && run(() => campaignTransitionAction(p.campaignId, "cancel"))}><XCircle className="size-4" />Cancelar</Button>
        )}
      </div>
      {(p.status === "approved" || p.status === "sending") && !p.hasIntegration && p.queued > 0 && (
        <p className="text-xs text-ink-500 lg:text-right">Sem API conectada: use o <b>envio assistido</b> abaixo — abra a conversa, envie pelo seu WhatsApp e marque como enviada.</p>
      )}
      {p.status === "approved" && p.queued === 0 && (
        <Notice tone="warn">Nenhuma mensagem na fila: todos os clientes deste público estão <b>fora do envio</b> (sem autorização no canal, descadastrados ou contatados há pouco). Veja os motivos em “Público” e ajuste o consentimento dos clientes ou crie outra campanha.</Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

export function CopyEditor({ campaignId, name, variants, emailSubject, channel, editable }: { campaignId: string; name: string; variants: string[]; emailSubject: string | null; channel: Channel; editable: boolean }) {
  const [list, setList] = useState(variants);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  if (!editable) {
    return (
      <div className="space-y-3">
        {emailSubject && <p className="text-sm"><span className="text-ink-500">Assunto:</span> {emailSubject}</p>}
        {variants.map((v, i) => <div key={i} className="rounded-xl bg-paper p-4 text-[13.5px] leading-relaxed text-ink-800 ring-1 ring-line"><div className="mb-1 text-[11px] font-medium text-ink-400">VARIAÇÃO {i + 1}</div>{v}</div>)}
      </div>
    );
  }
  return (
    <form className="space-y-3" action={(fd) => start(async () => {
      const r = await updateCampaignCopyAction(campaignId, fd);
      setMsg(r.ok ? { tone: "success", text: "Mensagens atualizadas. A campanha voltou para rascunho para nova aprovação." } : { tone: "danger", text: r.error ?? "Erro" });
    })}>
      <Field label="Nome da campanha"><Input name="name" defaultValue={name} /></Field>
      {channel === "email" && <Field label="Assunto do e-mail"><Input name="emailSubject" defaultValue={emailSubject ?? ""} /></Field>}
      {list.map((v, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ink-400"><span>VARIAÇÃO {i + 1}</span><span className="num">{v.length} caracteres</span></div>
          <Textarea name="variant" rows={4} value={v} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
        </div>
      ))}
      <p className="text-xs text-ink-500">Variáveis: <code>{"{nome}"}</code> <code>{"{estabelecimento}"}</code> <code>{"{oferta}"}</code> <code>{"{servico}"}</code> <code>{"{profissional}"}</code>. Frases com serviço/profissional são omitidas quando o cliente não tem o dado. O aviso de descadastro é incluído automaticamente.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        {list.length < 5 && <Button type="button" variant="secondary" onClick={() => setList((l) => [...l, ""])}>Adicionar variação</Button>}
        <Button disabled={pending}>{pending ? "Salvando…" : "Salvar mensagens"}</Button>
      </div>
    </form>
  );
}

const MSG_STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "brand" | "violet" | "danger" }> = {
  queued: { label: "Na fila", tone: "neutral" }, skipped: { label: "Fora do envio", tone: "warn" }, sent: { label: "Enviada", tone: "brand" },
  delivered: { label: "Entregue", tone: "brand" }, read: { label: "Lida", tone: "brand" }, failed: { label: "Falhou", tone: "danger" }, replied: { label: "Respondeu", tone: "violet" },
};

export function MessageList({ campaignId, channel, rows, manualEnabled }: {
  campaignId: string; channel: Channel; manualEnabled: boolean;
  rows: { id: string; customerId: string; name: string; phone: string | null; email: string | null; body: string; status: string; skipReason: string | null; error: string | null; sentVia: string | null; isDemo: boolean }[];
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  type F = "all" | "queued" | "skipped" | "sent";
  const match = (r: { status: string }, f: F) => f === "all" || (f === "sent" ? ["sent", "delivered", "read", "replied"].includes(r.status) : r.status === f);
  // Abre no que importa agora: a fila para enviar; senão as enviadas; senão todas.
  const [filter, setFilter] = useState<F>(() => rows.some((r) => r.status === "queued") ? "queued" : rows.some((r) => match(r, "sent")) ? "sent" : "all");
  const [limit, setLimit] = useState(20);
  const all = rows.filter((r) => match(r, filter));
  const shown = all.slice(0, limit);
  const mark = (ids: string[]) => start(async () => {
    const r = await markManualAction(campaignId, ids);
    if (r.ok) setDone((d) => new Set([...d, ...ids]));
  });
  const waLink = (phone: string, body: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">
        {([["all", "Todas"], ["queued", "Na fila"], ["sent", "Enviadas"], ["skipped", "Fora do envio"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); setLimit(20); }} className={cx("rounded-md px-2.5 py-1 text-xs", filter === k ? "bg-ink-950 text-white" : "text-ink-500 hover:bg-paper")}>{l} <span className="num opacity-70">{rows.filter((r) => match(r, k)).length}</span></button>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {shown.map((r) => {
          const st = done.has(r.id) ? MSG_STATUS.sent : MSG_STATUS[r.status];
          const canManual = manualEnabled && r.status === "queued" && !done.has(r.id);
          return (
            <li key={r.id} className="grid gap-2 px-5 py-3 md:grid-cols-[200px_1fr_auto] md:items-start">
              <div>
                <Link href={`/clientes/${r.customerId}`} className="text-sm font-medium hover:underline">{r.name}</Link>
                <div className="text-xs text-ink-500">{channel === "email" ? r.email : r.phone}</div>
              </div>
              <div>
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-700">{r.body}</p>
                {r.skipReason && <p className="mt-1 text-xs text-st-risk-text">{SKIP_LABEL[r.skipReason as SkipReason] ?? "Cancelada"}</p>}
                {r.error && <p className="mt-1 text-xs text-st-high">{r.error}</p>}
              </div>
              <div className="flex items-center gap-2 md:flex-col md:items-end">
                <Badge tone={st.tone}>{st.label}{r.sentVia === "manual" && " (manual)"}</Badge>
                {canManual && channel === "whatsapp" && r.phone && (
                  <a href={waLink(r.phone, r.body)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Abrir no WhatsApp<ExternalLink className="size-3" /></a>
                )}
                {canManual && <button disabled={pending} onClick={() => mark([r.id])} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-950"><Check className="size-3" />Marcar enviada</button>}
              </div>
            </li>
          );
        })}
        {!shown.length && <li className="px-5 py-8 text-center text-sm text-ink-500">Nada aqui.</li>}
      </ul>
      {all.length > shown.length && (
        <button onClick={() => setLimit(limit + 50)} className="w-full border-t border-line px-5 py-3 text-[13px] font-medium text-ink-600 hover:bg-paper hover:text-ink-950">
          Mostrar mais ({all.length - shown.length} restantes)
        </button>
      )}
    </div>
  );
}
