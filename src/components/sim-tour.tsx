"use client";
/**
 * Faixa e tour guiado da SIMULAÇÃO (empresa fictícia, somente leitura).
 * O passo atual fica no sessionStorage da aba, então o tour segue entre as páginas.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, LogOut, RotateCcw, X } from "lucide-react";

const STEPS: { href: string; title: string; text: string }[] = [
  { href: "/visao-geral", title: "Bem-vindo à Barbearia Exemplo", text: "Esta é uma barbearia fictícia com o plano Profissional ativo. Todos os nomes, números e mensagens são de exemplo. Pode clicar à vontade: nada é criado, alterado ou enviado." },
  { href: "/visao-geral", title: "Visão geral", text: "O resumo do negócio: quantos clientes pararam de vir, quanto isso representa em receita parada e quanto já voltou com as campanhas." },
  { href: "/agenda", title: "Agenda", text: "Pedidos que chegam pelo link de agendamento e os horários confirmados. Quando um atendimento é marcado como feito, o cliente volta a contar como ativo." },
  { href: "/clientes", title: "Clientes", text: "A base inteira, com o status calculado sozinho: ativo, em risco, inativo, altamente inativo ou recuperado. Abra um cliente para ver o histórico de visitas e contatos." },
  { href: "/inativos", title: "Inativos", text: "Quem passou do intervalo normal de visitas, ordenado por prioridade: ticket, frequência e tempo sem aparecer." },
  { href: "/fontes", title: "Fontes de dados", text: "De onde vem a base: Google Agenda, link de agendamento, registro rápido no balcão, contatos do WhatsApp ou planilha." },
  { href: "/agente", title: "Agente de IA", text: "Pergunte em português sobre a sua base. Experimente uma das sugestões: aqui ele responde com os dados fictícios da barbearia." },
  { href: "/campanhas", title: "Campanhas", text: "Campanhas enviadas com entregues, lidas, respostas e retornos. Repare na campanha que o agente preparou: ela espera aprovação de uma pessoa antes de qualquer envio." },
  { href: "/automacoes", title: "Automações", text: "Regras que preparam campanhas sozinhas quando alguém entra em risco ou some há muito tempo. O envio continua passando por aprovação." },
  { href: "/resultados", title: "Resultados", text: "Quanto voltou de receita, quantos clientes foram recuperados e quais campanhas funcionaram melhor, semana a semana." },
  { href: "/integracoes", title: "Integrações", text: "Onde se conecta o WhatsApp oficial, o e-mail e o SMS para enviar de verdade. Na simulação nenhuma conexão é feita." },
  { href: "/configuracoes", title: "Plano Profissional ativo", text: "Em Configurações ficam os dados do negócio, a equipe e a assinatura — aqui, o plano Profissional já pago. Gostou? Crie sua conta e use com os seus próprios clientes." },
];

const KEY = "gravita.simtour";
const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* sem armazenamento: o tour só não lembra o passo */ } };

export function SimBanner() {
  return (
    <div className="relative z-[2] flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#4ee39f]/25 bg-[#4ee39f]/10 px-4 py-2 text-[13px] text-ink-800 sm:px-8" role="status">
      <span className="flex items-center gap-2 font-medium text-ink-950"><Eye className="size-4 text-[#4ee39f]" />Simulação</span>
      <span className="text-ink-600">Barbearia Exemplo · dados fictícios · nada pode ser criado, alterado ou enviado</span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <button onClick={() => window.dispatchEvent(new Event("gravita:simtour"))} className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-ink-700 hover:bg-white/[0.06] hover:text-ink-950"><RotateCcw className="size-3.5" />Refazer tour</button>
        <a href="/simulacao/sair" className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-ink-700 hover:bg-white/[0.06] hover:text-ink-950"><LogOut className="size-3.5" />Sair da simulação</a>
        <Link href="/cadastro" className="inline-flex h-7 items-center rounded-lg bg-[#4ee39f] px-3 font-semibold text-[#06130d] hover:brightness-110">Criar minha conta</Link>
      </span>
    </div>
  );
}

export function SimTour() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [step, setStep] = useState<number | null>(null);

  const go = useCallback((n: number) => {
    if (n < 0 || n >= STEPS.length) { write("done"); setStep(null); return; }
    write(String(n));
    setStep(n);
    if (STEPS[n].href !== pathname) router.push(STEPS[n].href);
  }, [pathname, router]);

  useEffect(() => {
    // Entrada pela landing (?tour=1) começa do início; depois o passo segue salvo na aba.
    if (params.get("tour") === "1") { write("0"); setStep(0); router.replace(pathname); return; }
    const v = read();
    if (v === null) { write("0"); setStep(0); }
    else if (v !== "done") setStep(Math.min(STEPS.length - 1, Math.max(0, Number(v) || 0)));
  }, [params, pathname, router]);

  useEffect(() => {
    const restart = () => go(0);
    window.addEventListener("gravita:simtour", restart);
    window.addEventListener("gravita:tour", restart);
    return () => { window.removeEventListener("gravita:simtour", restart); window.removeEventListener("gravita:tour", restart); };
  }, [go]);

  // Destaca o item do menu correspondente ao passo.
  useEffect(() => {
    if (step === null) return;
    const links = Array.from(document.querySelectorAll<HTMLElement>(`aside a[href="${STEPS[step].href}"]`));
    links.forEach((a) => a.classList.add("ring-2", "ring-[#4ee39f]", "ring-offset-2", "ring-offset-[#06130d]"));
    return () => links.forEach((a) => a.classList.remove("ring-2", "ring-[#4ee39f]", "ring-offset-2", "ring-offset-[#06130d]"));
  }, [step, pathname]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]" role="dialog" aria-label={`Tour da simulação: ${s.title}`}>
      <div className="glass rounded-2xl border border-[#4ee39f]/30 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#4ee39f]">Tour · {step + 1} de {STEPS.length}</div>
            <h2 className="mt-1 text-[16px] font-semibold text-ink-950">{s.title}</h2>
          </div>
          <button onClick={() => go(-1)} aria-label="Fechar tour" title="Fechar tour" className="grid size-7 place-items-center rounded-lg text-ink-500 hover:bg-white/[0.06] hover:text-ink-950"><X className="size-4" /></button>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{s.text}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#4ee39f] transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {step > 0
            ? <button onClick={() => go(step - 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-ink-700 hover:bg-white/[0.06]"><ArrowLeft className="size-4" />Voltar</button>
            : <button onClick={() => go(-1)} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-ink-500 hover:bg-white/[0.06]">Explorar sozinho</button>}
          {last
            ? <Link href="/cadastro" onClick={() => write("done")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4ee39f] px-4 text-[13px] font-semibold text-[#06130d] hover:brightness-110">Criar minha conta<ArrowRight className="size-4" /></Link>
            : <button onClick={() => go(step + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4ee39f] px-4 text-[13px] font-semibold text-[#06130d] hover:brightness-110">Próximo<ArrowRight className="size-4" /></button>}
        </div>
      </div>
    </div>
  );
}
