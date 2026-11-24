import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  ArrowRight, Check, ShieldCheck, Sparkles, Target, Megaphone, LineChart, CalendarCheck, Zap, CalendarDays, MessageCircle,
  MessagesSquare, Contact, FileSpreadsheet, Code2, Cable, Plus,
  MonitorPlay,
} from "lucide-react";
import { billingEnforced, trialDays } from "@/lib/billing/service";
import { LostRevenue } from "@/components/landing/lost-revenue";
import { getDb } from "@/db/client";
import { plans } from "@/db/schema";
import { getContext } from "@/lib/auth/session";
import { SEGMENTS } from "@/lib/segments";
import { money, num } from "@/lib/format";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ButtonLink, cx } from "@/components/ui";
import { ProductShowcase } from "@/components/landing/product-showcase";

const SOURCES = [
  { icon: CalendarCheck, title: "Link de agendamento", desc: "Seus clientes marcam pelo link e já entram na base." },
  { icon: Zap, title: "Registro no balcão", desc: "Nome, telefone e valor em segundos, pelo celular." },
  { icon: CalendarDays, title: "Google Agenda", desc: "12 meses de histórico e sincronização diária." },
  { icon: MessageCircle, title: "WhatsApp oficial", desc: "Quem conversa com você vira cliente sozinho." },
  { icon: MessagesSquare, title: "Histórico do WhatsApp", desc: "Descubra quem conversava e parou de falar." },
  { icon: Contact, title: "Contatos do celular", desc: "Sua lista inteira em um arquivo." },
  { icon: FileSpreadsheet, title: "Planilha ou relatório", desc: "Colunas reconhecidas automaticamente." },
  { icon: Code2, title: "API, Zapier e Make", desc: "Para quem já tem sistema próprio." },
];

function faq(trial: number, billing: boolean): [string, string][] {
  const list: [string, string][] = [
    ["Preciso instalar alguma coisa?", "Não. O GravitaSolves funciona no navegador, no computador ou no celular. É só criar a conta e conectar uma das fontes."],
    ["Preciso ter a API oficial do WhatsApp?", "Não para começar. Sua base pode vir da agenda, do link de agendamento, do registro no balcão ou de uma planilha. O WhatsApp oficial pode ser conectado depois."],
  ];
  if (trial > 0) list.push(["Como funciona o teste grátis?", `Você usa por ${trial} dias sem informar cartão. Depois escolhe um plano e paga por Pix, boleto ou cartão. Se não assinar, seus dados continuam disponíveis para consulta e exportação.`]);
  if (billing) list.push(["Posso cancelar quando quiser?", "Sim. A renovação para na hora e você continua usando até o fim do período que já pagou."]);
  list.push(
    ["Outras empresas conseguem ver meus clientes?", "Não. Cada estabelecimento só enxerga os próprios dados, e só as pessoas que você adicionar à equipe têm acesso."],
    ["E a LGPD?", "Ela está no núcleo do produto: consentimento por canal, descadastro com um clique ou respondendo “SAIR”, lista de bloqueio, exportação e exclusão de dados e registro de tudo o que foi feito."],
  );
  return list;
}

export default async function Home() {
  // Quem está só na simulação continua vendo a landing como visitante.
  const found = await getContext();
  const ctx = found?.sim ? null : found;
  const db = await getDb();
  const planList = await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  // Só fala em teste grátis e formas de pagamento quando a cobrança está ligada neste servidor.
  const billing = billingEnforced();
  const trial = billing ? trialDays() : 0;
  const cta = trial > 0 ? `Testar grátis por ${trial} dias` : "Criar conta";
  const nav = "hidden rounded-lg px-3 py-2 text-sm text-ink-600 transition hover:bg-white/[0.05] hover:text-ink-950";
  const eyebrow = "text-xs font-medium uppercase tracking-[0.1em] text-brand-600";

  return (
    <div className="theme-dark relative overflow-x-clip">
      <div className="app-glow" aria-hidden />
      <div className="relative z-[1]">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#060a08]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" aria-label="GravitaSolves, início"><Logo tone="light" size={26} /></Link>
          <nav className="flex items-center gap-1 sm:gap-1.5">
            <a href="#como-funciona" className={cx(nav, "lg:block")}>Como funciona</a>
            <a href="#conexoes" className={cx(nav, "md:block")}>Conexões</a>
            <a href="#planos" className={cx(nav, "md:block")}>Planos</a>
            <a href="#duvidas" className={cx(nav, "md:block")}>Dúvidas</a>
            <a href="/simulacao" target="_blank" rel="noopener" className={cx(nav, "sm:block")}>Ver simulação</a>
            {ctx ? <ButtonLink href="/visao-geral" className="ml-1">Abrir painel</ButtonLink> : <>
              <ButtonLink href="/login" variant="ghost">Entrar</ButtonLink>
              <ButtonLink href="/cadastro">Começar agora</ButtonLink>
            </>}
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:pt-20">
        <div className="animate-rise mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-ink-700"><Sparkles className="size-3.5 text-brand-600" />Agente de IA para recuperar clientes</span>
          <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] text-ink-950 sm:text-[62px]">
            Volte a faturar com <span className="bg-gradient-to-r from-[#4ee39f] to-[#d4f06a] bg-clip-text text-transparent">quem já conhece</span> o seu negócio.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-600">
            Conecte a agenda, o WhatsApp ou o link de agendamento. O GravitaSolves monta sua base sozinho, mostra quem parou de vir e prepara a mensagem certa para trazer cada cliente de volta.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={ctx ? "/visao-geral" : "/cadastro"} className="h-11 px-5">{ctx ? "Abrir painel" : cta}<ArrowRight className="size-4" /></ButtonLink>
            <a href="/simulacao" target="_blank" rel="noopener" className="glass inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-medium text-ink-950 transition hover:border-[#4ee39f]/40"><MonitorPlay className="size-4 text-[#4ee39f]" />Testar a simulação</a>
            <ButtonLink href="#como-funciona" variant="ghost" className="h-11 px-4">Ver como funciona</ButtonLink>
          </div>
          <p className="mt-3 text-xs text-ink-500">A simulação abre em outra aba: uma barbearia fictícia com o plano Profissional, um tour guiado e tudo bloqueado para edição.</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-ink-600">
            {[trial > 0 ? "Sem cartão para testar" : "Sem planilha", "Sem instalar nada", "Nada é enviado sem sua aprovação"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-brand-600" />{t}</li>)}
          </ul>
        </div>
        <div className="relative mt-12 sm:mt-16">
          <div className="pointer-events-none absolute inset-x-[10%] -top-10 h-40 rounded-full bg-[#4ee39f]/20 blur-[80px]" aria-hidden />
          <div className="relative">
            <ProductShowcase />
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <div className={eyebrow}>Como funciona</div>
          <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">Do “cadê aquele cliente?” ao cliente de volta.</h2>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Cable, "Conecte onde você atende", "Agenda, WhatsApp, link de agendamento, contatos ou planilha. Vários ao mesmo tempo."],
            [Target, "Veja quem está sumindo", "Ativo, em risco, inativo e recuperado — com prazos do seu segmento e o ritmo de cada cliente."],
            [Megaphone, "Campanhas que soam humanas", "Mensagens variadas e personalizadas, com consentimento e aprovação. WhatsApp, e-mail ou SMS."],
            [LineChart, "Meça o retorno real", "Quem voltou, quanto gastou e qual campanha funcionou melhor."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof Target;
            return (
              <div key={t as string} className="glass rounded-[18px] p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-600/10 text-brand-600 ring-1 ring-brand-600/25"><I className="size-5" strokeWidth={1.75} /></span>
                  <span className="num text-[13px] text-ink-400">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-[15px] font-semibold text-ink-950">{t as string}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{d as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <LostRevenue />
      </section>

      <section id="conexoes" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <div className={eyebrow}>Sem planilha</div>
          <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">Funciona do jeito que você já atende.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-600">Escolha uma ou várias formas de conectar. O GravitaSolves junta tudo pelo telefone do cliente e atualiza a base sozinho.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map(({ icon: I, title, desc }) => (
            <div key={title} className="glass group rounded-[18px] p-5 transition hover:-translate-y-0.5 hover:border-brand-600/30">
              <span className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-ink-800 ring-1 ring-white/10 transition group-hover:bg-brand-600/10 group-hover:text-brand-600 group-hover:ring-brand-600/30"><I className="size-5" strokeWidth={1.75} /></span>
              <h3 className="mt-4 text-[14.5px] font-semibold text-ink-950">{title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="glass relative grid items-center gap-10 overflow-hidden rounded-3xl p-8 sm:p-12 lg:grid-cols-2">
          <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-[#4ee39f]/15 blur-[90px]" aria-hidden />
          <div className="relative">
            <div className={eyebrow}>Agente de IA</div>
            <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.035em]">Um analista de retenção, não um disparador.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">Pergunte em português. O agente consulta seus dados reais, encontra padrões de abandono e cria campanhas em rascunho para você aprovar.</p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {["Quais clientes têm maior potencial de retorno?", "Crie uma campanha para os inativos deste mês.", "Quanto recuperamos em receita neste mês?"].map((q) => (
                <li key={q} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-ink-800"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.06]"><LogoMark size={14} tone="light" /></span>“{q}”</li>
              ))}
            </ul>
          </div>
          <div className="relative space-y-4">
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((s) => <span key={s.id} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[13px] text-ink-700">{s.label}</span>)}
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-brand-600/20 bg-brand-600/[0.06] p-4 text-[13px] leading-relaxed text-ink-700">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" />
              LGPD no núcleo: consentimento por canal, descadastro com um clique ou “SAIR”, lista de bloqueio, exportação e exclusão de dados, retenção automática e trilha de auditoria.
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className={cx(eyebrow, "text-center")}>Planos</div>
        <h2 className="mt-2 text-center text-[30px] font-semibold tracking-[-0.035em] sm:text-[34px]">Comece pequeno e cresça junto com a sua base.</h2>
        {billing && (
          <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[13px] text-ink-600">
            {[...(trial > 0 ? [`${trial} dias grátis, sem cartão`] : []), "Pix, boleto ou cartão", "Cancele quando quiser"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-brand-600" />{t}</li>)}
          </ul>
        )}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {planList.map((p, i) => (
            <div key={p.id} className={cx("glass relative flex flex-col rounded-[20px] p-6", i === 1 && "!border-brand-600/50 shadow-[0_0_0_1px_rgba(78,227,159,.25),0_30px_80px_-30px_rgba(78,227,159,.35)]")}>
              <div className="flex items-center justify-between"><h3 className="font-semibold text-ink-950">{p.name}</h3>{i === 1 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-[#06130d]">Mais escolhido</span>}</div>
              <div className="num mt-3 text-3xl font-semibold text-ink-950">{money(p.priceCents)}<span className="text-sm font-normal text-ink-500">/mês</span></div>
              <div className="mt-1 text-xs text-ink-500">até {num(p.limits.maxCustomers)} clientes</div>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2 text-ink-700"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" />{f}</li>)}
              </ul>
              <ButtonLink href="/cadastro" variant={i === 1 ? "primary" : "secondary"} className="mt-6 w-full">Começar com o {p.name}</ButtonLink>
            </div>
          ))}
        </div>
      </section>

      <section id="duvidas" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className={cx(eyebrow, "text-center")}>Dúvidas</div>
        <h2 className="mt-2 text-center text-[30px] font-semibold tracking-[-0.035em] sm:text-[34px]">Dúvidas comuns</h2>
        <div className="glass mt-10 divide-y divide-white/[0.07] rounded-[20px]">
          {faq(trial, billing).map(([q, a]) => (
            <details key={q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink-950">
                {q}
                <Plus className="size-4 shrink-0 text-ink-500 transition group-open:rotate-45 group-open:text-brand-600" />
              </summary>
              <p className="-mt-1 pb-5 text-sm leading-relaxed text-ink-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6">
        <div className="glass relative flex flex-col items-center overflow-hidden rounded-3xl px-6 py-14 text-center">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#4ee39f]/20 blur-[90px]" aria-hidden />
          <div className="relative flex flex-col items-center">
            <LogoMark size={40} tone="light" />
            <h2 className="mt-5 max-w-xl text-[28px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[34px]">Seus clientes ainda lembram de você. Lembre eles de voltar.</h2>
            <p className="mt-3 max-w-lg text-[15px] text-ink-600">Crie a conta, conecte uma fonte e veja em minutos quem parou de vir.</p>
            {ctx ? <ButtonLink href="/visao-geral" className="mt-7 h-11 px-5">Abrir painel<ArrowRight className="size-4" /></ButtonLink>
              : <ButtonLink href="/cadastro" className="mt-7 h-11 px-5">{cta}<ArrowRight className="size-4" /></ButtonLink>}
            {trial > 0 && !ctx && <p className="mt-3 text-xs text-ink-500">Não pedimos cartão para testar.</p>}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-ink-500 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="max-w-xs">
            <Logo tone="light" size={22} />
            <p className="mt-3 leading-relaxed">Recupere clientes que pararam de vir, com consentimento e aprovação humana.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2" aria-label="Rodapé">
            <a href="#como-funciona" className="hover:text-ink-950">Como funciona</a>
            <Link href={ctx ? "/visao-geral" : "/login"} className="hover:text-ink-950">{ctx ? "Abrir painel" : "Entrar"}</Link>
            <a href="#planos" className="hover:text-ink-950">Planos</a>
            <Link href="/privacidade" className="hover:text-ink-950">Privacidade</Link>
            <a href="#duvidas" className="hover:text-ink-950">Dúvidas</a>
            <Link href="/termos" className="hover:text-ink-950">Termos de uso</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-400 sm:px-6">© {new Date().getFullYear()} GravitaSolves</div>
      </footer>
      </div>
    </div>
  );
}
