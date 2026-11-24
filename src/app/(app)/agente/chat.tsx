"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Megaphone, Plus, Sparkles } from "lucide-react";
import { agentAction } from "@/app/actions";
import { simAgentAction } from "@/app/sim-actions";
import { Markdown } from "@/components/markdown";
import { LogoMark } from "@/components/brand/logo";
import { Badge, cx } from "@/components/ui";
import { PageGuide } from "@/components/guide";
import { BASIC_EXAMPLE_GROUPS } from "@/lib/ai/examples";

export interface ChatMsg { id: string; role: "user" | "assistant"; text: string; mode?: "ai" | "basic"; actions: { type: string; campaignId: string; name: string }[] }

export function AgentChat({ initial, conversationId, aiMode, model, orgName, segmentLabel, sim }: {
  initial: ChatMsg[]; conversationId: string | null; aiMode: "ai" | "basic"; model: string; orgName: string; segmentLabel: string; sim?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initial);
  const [conv, setConv] = useState<string>(conversationId ?? crypto.randomUUID());
  const [input, setInput] = useState("");
  const [group, setGroup] = useState(0);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: q, actions: [] }]);
    start(async () => {
      if (sim) {
        const s = await simAgentAction(q);
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: s.ok && s.data ? s.data.text : `_${s.error ?? "Erro"}_`, mode: "basic", actions: [] }]);
        return;
      }
      const r = await agentAction(conv, q);
      if (!r.ok || !r.data) {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `_${r.error ?? "Erro"}_`, actions: [] }]);
        return;
      }
      setConv(r.data.conversationId);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: r.data!.text, mode: r.data!.mode, actions: r.data!.actions }]);
    });
  };

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Agente de IA</h1>
          <p className="mt-1 text-sm text-ink-500">Seu analista de retenção para {orgName}. {sim ? "Aqui ele responde com os dados fictícios da simulação e não grava nada." : "Ele consulta os dados reais, cria campanhas em rascunho e nunca envia nada sem aprovação."}</p>
        </div>
        <div className="flex items-center gap-2">
          {sim ? <Badge tone="warn" className="max-w-xs">Simulação — respostas com os dados fictícios</Badge> : aiMode === "ai" ? <Badge tone="dark"><Sparkles className="size-3" />{model}</Badge> : <Badge tone="warn" className="max-w-xs">Modo básico — respostas prontas com seus dados</Badge>}
          <button onClick={() => { setMessages([]); setConv(crypto.randomUUID()); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] hover:bg-paper"><Plus className="size-3.5" />Nova conversa</button>
        </div>
      </div>

      {!messages.length && <PageGuide id="agente" />}
      <div className="thin-scroll flex-1 overflow-y-auto rounded-xl border border-line bg-surface">
        {!messages.length ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-14 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-ink-950"><LogoMark size={30} tone="light" /></div>
            <h2 className="mt-4 text-lg font-semibold">O que você quer descobrir sobre sua base?</h2>
            <p className="mt-1 text-sm text-ink-500">{segmentLabel} · as respostas usam os dados atuais dos seus clientes.</p>
            <div className="mt-6 flex w-full flex-wrap justify-center gap-1.5" role="tablist" aria-label="Temas de perguntas">
              {BASIC_EXAMPLE_GROUPS.map((g, i) => (
                <button key={g.title} role="tab" aria-selected={group === i} onClick={() => setGroup(i)}
                  className={cx("h-8 rounded-full border px-3 text-[12.5px] transition", group === i ? "border-brand-600 bg-brand-600/10 text-ink-950" : "border-line text-ink-600 hover:bg-paper")}>{g.title}</button>
              ))}
            </div>
            <div className="mt-3 grid w-full gap-2 sm:grid-cols-2" role="tabpanel">
              {BASIC_EXAMPLE_GROUPS[group].items.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-line px-4 py-3 text-left text-[13px] text-ink-700 transition hover:border-ink-300 hover:bg-paper">{s}</button>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-400">{BASIC_EXAMPLE_GROUPS.reduce((n, g) => n + g.items.length, 0)} perguntas prontas · ou escreva com as suas palavras</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
            {messages.map((m) => (
              <div key={m.id} className={cx("flex gap-3 animate-rise", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-950"><LogoMark size={18} tone="light" /></div>}
                <div className={cx("max-w-[85%] text-[14px] leading-relaxed", m.role === "user" ? "rounded-2xl rounded-br-md bg-ink-950 px-4 py-2.5 text-white" : "text-ink-900")}>
                  {m.role === "assistant" ? <Markdown text={m.text} /> : m.text}
                  {m.actions?.map((a) => (
                    <Link key={a.campaignId} href={`/campanhas/${a.campaignId}`} className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 text-[13px] hover:border-ink-300">
                      <Megaphone className="size-4 text-brand-600" />
                      <span className="flex-1"><b>{a.name}</b><span className="block text-xs text-ink-500">Rascunho criado · revisar e aprovar</span></span>
                      <span className="text-xs font-medium text-brand-700">Abrir →</span>
                    </Link>
                  ))}
                  {m.role === "assistant" && m.mode === "basic" && <div className="mt-1 text-[11px] text-ink-400">modo básico (sem IA generativa)</div>}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-ink-950"><LogoMark size={18} tone="light" /></div>
                <div className="flex items-center gap-1.5 text-sm text-ink-500">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand-500" /><span className="size-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:300ms]" />
                  <span className="ml-1">Analisando sua base…</span>
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {!!messages.length && (
        <div className="thin-scroll mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Mais perguntas prontas">
          {BASIC_EXAMPLE_GROUPS.flatMap((g) => g.items).filter((s) => !messages.some((m) => m.role === "user" && m.text === s)).slice(0, 12).map((s) => (
            <button key={s} disabled={pending} onClick={() => send(s)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-600 transition hover:border-ink-300 hover:bg-paper disabled:opacity-40">{s}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex items-end gap-2 rounded-xl border border-line bg-surface p-2 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/15">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={4000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Pergunte sobre seus clientes ou peça uma campanha…" className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink-400" />
        <button disabled={!input.trim() || pending} className="grid size-9 place-items-center rounded-lg bg-ink-950 text-white transition hover:bg-ink-800 disabled:opacity-30" aria-label="Enviar"><ArrowUp className="size-4" /></button>
      </form>
    </div>
  );
}
