"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Lightbulb, X, HelpCircle, ArrowRight, Cable, UserMinus, Megaphone, LineChart } from "lucide-react";
import { GUIDES } from "@/lib/guides";
import { LogoMark } from "@/components/brand/logo";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const cx = (...v: Parameters<typeof clsx>) => twMerge(clsx(v));

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };

/** Ajuda "Como funciona esta tela": fechada por padrão para não poluir a tela; abre com um clique e lembra a escolha. */
export function PageGuide({ id }: { id: keyof typeof GUIDES | string }) {
  const g = GUIDES[id];
  const key = `gravita.guide.${id}`;
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => { setHidden(read(key) !== "open"); setReady(true); }, [key]);
  if (!g || !ready) return null;
  if (hidden) {
    return (
      <div className="-mt-3 mb-4 flex justify-end">
        <button onClick={() => { write(key, "open"); setHidden(false); }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-ink-500 hover:bg-ink-950/5 hover:text-ink-950">
          <HelpCircle className="size-3.5" />Como usar esta tela?
        </button>
      </div>
    );
  }
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-brand-200 bg-brand-50/60 animate-rise">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-ink-950 text-citrus"><Lightbulb className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink-950">{g.title}</div>
          <ol className="mt-1.5 grid gap-1.5 text-[13px] leading-relaxed text-ink-700 md:grid-cols-2 md:gap-x-6">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="num mt-px text-[11px] font-semibold text-brand-700">{i + 1}.</span><span>{s}</span></li>
            ))}
          </ol>
          {(g.tip || g.link) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
              {g.tip && <span><b className="font-medium text-ink-700">Dica:</b> {g.tip}</span>}
              {g.link && <Link href={g.link.href} className="font-medium text-brand-700 underline-offset-4 hover:underline">{g.link.label}</Link>}
            </div>
          )}
        </div>
        <button onClick={() => { write(key, null); setHidden(true); }} className="shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-ink-600 ring-1 ring-brand-200 hover:bg-white" title="Esconder esta ajuda">
          Entendi
        </button>
      </div>
    </div>
  );
}

/** Ícone (?) com explicação ao passar o mouse ou tocar. */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cx("relative inline-flex align-middle", className)}>
      <button type="button" aria-label={text} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={() => setOpen(false)}
        className="grid size-4 place-items-center rounded-full text-ink-400 hover:text-ink-700">
        <HelpCircle className="size-3.5" />
      </button>
      {open && (
        <span role="tooltip" className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-[#0d1411] ring-1 ring-white/10 px-3 py-2 text-left text-[12px] font-normal normal-case leading-relaxed tracking-normal text-white shadow-xl animate-fade">
          {text}
        </span>
      )}
    </span>
  );
}

const TOUR = [
  { icon: null, title: "Bem-vindo ao GravitaSolves", text: "O GravitaSolves descobre quais clientes pararam de voltar, mostra quanto isso representa e ajuda você a trazê-los de volta. São 3 passos — leva um minuto para entender." },
  { icon: Cable, title: "1. Conecte seus clientes", text: "Em Conexões, escolha como você atende: link de agendamento, agenda, WhatsApp, contatos do celular ou planilha. A base se monta sozinha." },
  { icon: UserMinus, title: "2. Veja quem está sumindo", text: "Na Central de recuperação, o GravitaSolves separa quem está em risco e quem já sumiu, e mostra quem tem mais chance de voltar." },
  { icon: Megaphone, title: "3. Traga de volta", text: "Peça ao Agente de IA ou crie uma Campanha: as mensagens saem personalizadas e só são enviadas depois da sua aprovação." },
  { icon: LineChart, title: "Acompanhe o retorno", text: "Registre os atendimentos na Agenda e veja em Resultados quem voltou e quanto faturou. Dúvidas? A Central de ajuda fica no menu." },
];

/** Tour de boas-vindas mostrado na primeira visita (pode ser reaberto pela Central de ajuda). */
export function WelcomeTour() {
  const key = "gravita.welcome.v1";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (read(key) !== "done") setOpen(true);
    const reopen = () => { setStep(0); setOpen(true); };
    window.addEventListener("gravita:tour", reopen);
    return () => window.removeEventListener("gravita:tour", reopen);
  }, []);
  if (!open) return null;
  const close = () => { write(key, "done"); setOpen(false); };
  const s = TOUR[step];
  const Icon = s.icon;
  const last = step === TOUR.length - 1;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/50 p-4 backdrop-blur-[2px] animate-fade" role="dialog" aria-modal="true" aria-label="Tour de boas-vindas">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl animate-rise">
        <div className="relative grid h-36 place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(78,227,159,.28),transparent_60%),#08100c]">
          <svg className="absolute inset-0 h-full w-full opacity-50" viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <circle cx="200" cy="70" r="48" fill="none" stroke="#d4f06a" strokeOpacity=".2" /><circle cx="200" cy="70" r="78" fill="none" stroke="#d4f06a" strokeOpacity=".1" strokeDasharray="2 6" />
          </svg>
          <div className="relative grid size-16 place-items-center rounded-2xl bg-white/10 text-citrus">{Icon ? <Icon className="size-7" strokeWidth={1.75} /> : <LogoMark size={34} tone="light" />}</div>
          <button onClick={close} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="size-4" /></button>
        </div>
        <div className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{s.text}</p>
          <div className="mt-6 flex items-center justify-between">
            <div className="flex gap-1.5">{TOUR.map((_, i) => <span key={i} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-[#4ee39f]" : "w-1.5 bg-white/15")} />)}</div>
            <div className="flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="h-9 rounded-lg px-3 text-sm text-ink-600 hover:bg-paper">Voltar</button>}
              {last ? (
                <Link href="/fontes" onClick={close} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-4 text-sm font-medium text-white hover:bg-ink-800">Conectar clientes<ArrowRight className="size-4" /></Link>
              ) : (
                <button onClick={() => setStep(step + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-950 px-4 text-sm font-medium text-white hover:bg-ink-800">Próximo<ArrowRight className="size-4" /></button>
              )}
            </div>
          </div>
          {!last && <button onClick={close} className="mt-3 text-[12.5px] text-ink-400 hover:text-ink-700">Pular tour</button>}
        </div>
      </div>
    </div>
  );
}

/** Botão para reabrir o tour (usado na Central de ajuda). */
export function ReopenTourButton() {
  return (
    <button onClick={() => window.dispatchEvent(new Event("gravita:tour"))} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-950 px-3.5 text-sm font-medium text-white hover:bg-ink-800">
      Ver o tour de novo
    </button>
  );
}
