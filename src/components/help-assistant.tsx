"use client";
/**
 * Assistente Gravita: ajuda contextual flutuante. Sabe em que tela o usuário está (mostra o guia dela),
 * busca na base de conhecimento e leva direto para a tela certa. 100% determinístico — sem IA, sem custo.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, HelpCircle, Search, X, Sparkles, BookOpen } from "lucide-react";
import { GUIDES } from "@/lib/guides";
import { guideIdFor, searchArticles } from "@/lib/knowledge";

const QUICK: { q: string; href: string; label: string }[] = [
  { q: "Quem eu chamo primeiro?", href: "/inativos?status=prioritarios#prioridade", label: "Ver prioritários" },
  { q: "Como importo meus clientes?", href: "/clientes/importar", label: "Importar planilha" },
  { q: "Como crio uma campanha?", href: "/campanhas?nova=1", label: "Nova campanha" },
  { q: "Quanto já recuperei?", href: "/resultados", label: "Abrir resultados" },
];

export function HelpAssistant() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const gid = guideIdFor(pathname);
  const guide = gid ? GUIDES[gid] : null;
  const results = useMemo(() => (q.trim().length >= 2 ? searchArticles(q) : []), [q]);

  useEffect(() => { setOpen(false); setQ(""); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Abrir o Assistente Gravita"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink-950 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/15 transition hover:-translate-y-0.5 sm:bottom-6 sm:right-6">
          <HelpCircle className="size-4 text-citrus" />Precisa de ajuda?
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Assistente Gravita"
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-2xl bg-[#0d1411] text-white shadow-2xl ring-1 ring-white/10 animate-rise sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]">
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-lg bg-citrus/15 text-citrus"><Sparkles className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">Assistente Gravita</div>
              <div className="text-[11.5px] text-white/55">Ajuda sobre o uso do sistema · sem custo</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
          </div>
          <div className="px-4 pt-3">
            <label className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10 focus-within:ring-citrus/50">
              <Search className="size-4 text-white/50" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="O que você quer fazer? Ex.: importar planilha"
                className="w-full bg-transparent text-[13.5px] text-white placeholder:text-white/40 focus:outline-none" />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 text-[13px]">
            {q.trim().length >= 2 ? (
              results.length ? (
                <ul className="grid gap-2">
                  {results.map((a) => (
                    <li key={a.id} className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
                      <div className="font-medium">{a.title}</div>
                      <p className="mt-1 line-clamp-4 leading-relaxed text-white/70">{a.body}</p>
                      <Link href={a.href} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-citrus hover:underline">{a.cta}<ArrowRight className="size-3.5" /></Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl bg-white/[0.04] p-3 text-white/70">
                  Não encontrei nada sobre isso. Tente outras palavras (ex.: “campanha”, “importar”, “LGPD”) ou abra a <Link href="/ajuda" className="text-citrus underline">central de ajuda</Link>.
                  <div className="mt-2 text-[12px] text-white/50">Para perguntas sobre os seus números, use o <Link href="/agente" className="underline">Agente de IA</Link>.</div>
                </div>
              )
            ) : (
              <>
                {guide && (
                  <div className="mb-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-citrus">Nesta tela</div>
                    <div className="mt-1 font-medium">{guide.title}</div>
                    <ol className="mt-1.5 grid gap-1 leading-relaxed text-white/75">
                      {guide.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="num text-[11px] font-semibold text-citrus/80">{i + 1}.</span><span>{s}</span></li>)}
                    </ol>
                    {guide.tip && <p className="mt-2 text-[12px] text-white/55">Dica: {guide.tip}</p>}
                  </div>
                )}
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Perguntas comuns</div>
                <ul className="mt-1.5 grid gap-1">
                  {QUICK.map((x) => (
                    <li key={x.q}>
                      <Link href={x.href} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-white/[0.06]">
                        <span>{x.q}</span><span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-citrus">{x.label}<ArrowRight className="size-3.5" /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/ajuda" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-white/70 hover:text-white"><BookOpen className="size-3.5" />Central de ajuda completa</Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Busca na base de conhecimento (central de ajuda). */
export function KnowledgeSearch() {
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim().length >= 2 ? searchArticles(q, 8) : []), [q]);
  return (
    <div>
      <label className="field flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 focus-within:border-brand-500">
        <Search className="size-4 text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque uma tarefa ou dúvida: importar, campanha, LGPD, exportar…"
          aria-label="Buscar na central de ajuda" className="w-full bg-transparent text-[14px] text-ink-950 placeholder:text-ink-400 focus:outline-none" />
      </label>
      {q.trim().length >= 2 && (
        results.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {results.map((a) => (
              <li key={a.id} className="rounded-xl border border-line p-3.5">
                <div className="text-[14px] font-medium text-ink-950">{a.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-700">{a.body}</p>
                <Link href={a.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">{a.cta}<ArrowRight className="size-3.5" /></Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[13px] text-ink-500">Nada encontrado. Tente outras palavras ou veja as perguntas frequentes abaixo.</p>
      )}
    </div>
  );
}
