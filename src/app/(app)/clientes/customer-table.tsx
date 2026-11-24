"use client";
/** Lista de clientes com seleção em lote. Tabela no computador, cartões no celular. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Megaphone, MessageCircle, Tag, X } from "lucide-react";
import { bulkTagAction, campaignFromSelectionAction } from "@/app/actions";
import { Badge, Notice, ScorePill, StatusBadge, cx } from "@/components/ui";
import type { CustomerStatus } from "@/db/schema";

export interface CustomerRow {
  id: string; name: string; phone: string | null; email: string | null; status: CustomerStatus; isDemo: boolean; sourceLabel: string | null;
  subtitle: string; activity: string; activityDays: number | null; viaContact: boolean; visits: number; avgTicket: string; total: string;
  score: number; optedOut: boolean; channels: string[]; tags: string[];
}

export function CustomerTable({ rows, visitsLabel, canWrite, canCampaign, canExport }: {
  rows: CustomerRow[]; visitsLabel: string; canWrite: boolean; canCampaign: boolean; canExport: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const [tag, setTag] = useState("");
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel];
  const bulk = sel.size > 0;

  const tagOp = (op: "add" | "remove") => start(async () => {
    const r = await bulkTagAction(ids, op, tag);
    setMsg(r.ok ? { tone: "success", text: `Etiqueta “${tag.trim()}” ${op === "add" ? "adicionada a" : "removida de"} ${r.data} cliente(s).` } : { tone: "danger", text: r.error ?? "Erro" });
    if (r.ok) { setTag(""); router.refresh(); }
  });
  const campaign = () => start(async () => {
    const r = await campaignFromSelectionAction(ids, "whatsapp");
    if (r.ok && r.data) router.push(`/campanhas/${r.data}`);
    else setMsg({ tone: "danger", text: r.error ?? "Erro" });
  });
  const exportCsv = () => {
    const chosen = rows.filter((r) => sel.has(r.id));
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Nome", "Telefone", "E-mail", "Status", "Última atividade", visitsLabel, "Ticket médio", "Total gasto", "Potencial", "Etiquetas"].map(esc).join(";"),
      ...chosen.map((r) => [r.name, r.phone, r.email, r.status, r.activity, r.visits, r.avgTicket, r.total, r.score, r.tags.join(", ")].map(esc).join(";"))];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `clientes-selecionados-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  const check = (id: string, label: string) => (
    <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} aria-label={`Selecionar ${label}`} className="size-4 cursor-pointer accent-[#4ee39f]" />
  );

  return (
    <div>
      {bulk && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-ink-950 px-4 py-2.5 text-[13px] text-white">
          <b className="num">{sel.size}</b> selecionado{sel.size > 1 ? "s" : ""}
          <button onClick={() => setSel(new Set())} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"><X className="size-3.5" />Limpar</button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canWrite && (
              <span className="flex items-center gap-1">
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="etiqueta" maxLength={30}
                  className="h-8 w-28 rounded-md border border-white/15 bg-white/10 px-2 text-[12.5px] text-white placeholder:text-white/40 focus:outline-none" />
                <button disabled={pending || !tag.trim()} onClick={() => tagOp("add")} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-2.5 hover:bg-white/20 disabled:opacity-40"><Tag className="size-3.5" />Etiquetar</button>
                <button disabled={pending || !tag.trim()} onClick={() => tagOp("remove")} className="h-8 rounded-md px-2 text-white/60 hover:bg-white/10 disabled:opacity-40">Remover</button>
              </span>
            )}
            {canExport && <button onClick={exportCsv} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-2.5 hover:bg-white/20"><Download className="size-3.5" />CSV</button>}
            {canCampaign && (
              <button disabled={pending} onClick={() => confirm(`Criar uma campanha de WhatsApp em rascunho com ${sel.size} cliente(s)? Nada é enviado antes da sua aprovação, e quem não autorizou contato fica de fora.`) && campaign()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[#4ee39f] px-2.5 font-medium text-[#06130d] hover:bg-[#7af0b9] disabled:opacity-50"><Megaphone className="size-3.5" />Criar campanha</button>
            )}
          </div>
        </div>
      )}
      {msg && <div className="border-b border-line p-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {/* Computador: tabela */}
      <div className="thin-scroll hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-500">
              <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Selecionar todos desta página" className="size-4 cursor-pointer accent-[#4ee39f]" /></th>
              <th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Última atividade</th>
              <th className="px-3 py-2.5 text-right">{visitsLabel}</th><th className="px-3 py-2.5 text-right">Ticket médio</th><th className="px-3 py-2.5 text-right">Potencial</th><th className="px-3 py-2.5">Contato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className={cx("transition-colors hover:bg-paper/60", sel.has(c.id) && "bg-brand-500/[0.06]")}>
                <td className="px-4 py-3">{check(c.id, c.name)}</td>
                <td className="px-3 py-3">
                  <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  {c.isDemo && <Badge tone="violet" className="ml-2">Demonstração</Badge>}
                  {!c.isDemo && c.sourceLabel && <span className="ml-2 text-[11px] text-ink-400">{c.sourceLabel}</span>}
                  <div className="flex flex-wrap items-center gap-1 text-xs text-ink-500">{c.subtitle}{c.tags.map((t) => <TagChip key={t} t={t} />)}</div>
                </td>
                <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-3 py-3"><Activity c={c} /></td>
                <td className="num px-3 py-3 text-right">{c.visits}</td>
                <td className="num px-3 py-3 text-right">{c.avgTicket}</td>
                <td className="px-3 py-3 text-right">{c.score ? <ScorePill score={c.score} /> : <span className="text-ink-300">—</span>}</td>
                <td className="px-3 py-3"><Channels c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: cartões */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((c) => (
          <li key={c.id} className={cx("flex gap-3 px-4 py-3.5", sel.has(c.id) && "bg-brand-500/[0.06]")}>
            <div className="pt-0.5">{check(c.id, c.name)}</div>
            <Link href={`/clientes/${c.id}`} className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {c.score ? <ScorePill score={c.score} /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                <StatusBadge status={c.status} />
                <span>{c.activityDays !== null ? `${c.activityDays} dias sem vir` : "sem visita"}</span>
                <span>· {c.visits} {visitsLabel.toLowerCase()}</span>
                <span>· {c.avgTicket}</span>
              </div>
              {(c.tags.length > 0 || c.optedOut || c.channels.length === 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">{c.tags.map((t) => <TagChip key={t} t={t} plain />)}{c.optedOut ? <Badge tone="danger">Descadastrado</Badge> : c.channels.length === 0 && <span className="text-[11px] text-ink-400">Sem autorização de contato</span>}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagChip({ t, plain }: { t: string; plain?: boolean }) {
  const cls = "rounded-full bg-paper px-2 py-px text-[11px] text-ink-600 ring-1 ring-line";
  if (plain) return <span className={cls}>#{t}</span>; // dentro do cartão (que já é um link)
  return <Link href={`/clientes?tag=${encodeURIComponent(t)}`} className="rounded-full bg-paper px-2 py-px text-[11px] text-ink-600 ring-1 ring-line hover:text-ink-950">#{t}</Link>;
}

function Activity({ c }: { c: CustomerRow }) {
  return <>
    <span className="num text-[13px]">{c.activity}</span>
    {c.activityDays !== null && <div className="flex items-center gap-1 text-xs text-ink-400">{c.viaContact && <MessageCircle className="size-3" />}{c.activityDays} dias{c.viaContact ? " · conversa" : ""}</div>}
  </>;
}

function Channels({ c }: { c: CustomerRow }) {
  if (c.optedOut) return <Badge tone="danger">Descadastrado</Badge>;
  if (!c.channels.length) return <span className="text-xs text-ink-400">Sem autorização</span>;
  return <div className="flex gap-1">{c.channels.map((ch) => <Badge key={ch} tone="brand">{ch}</Badge>)}</div>;
}
