"use client";
/**
 * Demonstração animada do painel na landing (dados ilustrativos), no estilo "app em vídeo":
 * janela escura com vidro fosco e brilho verde ao fundo; um cursor percorre o menu e clica;
 * cada tela entra e sai com desfoque, números contando e gráficos se desenhando.
 * O conteúdo é desenhado numa largura fixa (1120×700) e escalado para caber, como um vídeo.
 * Pausa fora da tela, com o mouse em cima ou no botão de pausa.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bell, BarChart3, Bot, CalendarClock, ChevronDown, Download, HelpCircle, LayoutDashboard, Megaphone,
  MousePointer2, Pause, Play, Plus, Search, Settings, Sparkles, TrendingUp, UserX, Users, Zap,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

const W = 1120;
const H = 700;
const SCENE_MS = 6500;

const NAV = [
  { label: "Visão geral", icon: LayoutDashboard },
  { label: "Clientes", icon: Users },
  { label: "Inativos", icon: UserX, badge: "55" },
  { label: "Insights", icon: Sparkles },
  { label: "Campanhas", icon: Megaphone },
  { label: "Automações", icon: Zap },
  { label: "Resultados", icon: BarChart3 },
];
/** Telas do tour → índice do item no menu. */
const SCENES = [0, 2, 3, 6];

const brl = (n: number, cents = false) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

function useCountUp(target: number, run: boolean, ms = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function ProductShowcase() {
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const navRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scale, setScale] = useState(1);
  const [scene, setScene] = useState(0);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cursor, setCursor] = useState({ x: 640, y: 380, click: false });

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  const running = visible && !hover && !paused;

  // Roteiro de cada tela: o cursor passeia pelo conteúdo, vai até o próximo item do menu, clica e troca.
  useEffect(() => {
    if (!running) return;
    const next = (scene + 1) % SCENES.length;
    const T: ReturnType<typeof setTimeout>[] = [];
    const wander = [[720, 300], [880, 420], [560, 470]][scene % 3];
    T.push(setTimeout(() => setCursor({ x: wander[0], y: wander[1], click: false }), 900));
    T.push(setTimeout(() => {
      const nav = navRefs.current[SCENES[next]], stage = stageRef.current;
      if (nav && stage) {
        const s = stage.getBoundingClientRect(), b = nav.getBoundingClientRect(), k = s.width / W;
        setCursor({ x: (b.left - s.left) / k + 60, y: (b.top - s.top) / k + b.height / k / 2, click: false });
      }
    }, SCENE_MS - 1700));
    T.push(setTimeout(() => setCursor((c) => ({ ...c, click: true })), SCENE_MS - 550));
    T.push(setTimeout(() => { setScene(next); setCursor((c) => ({ ...c, click: false })); }, SCENE_MS - 300));
    return () => T.forEach(clearTimeout);
  }, [scene, running]);

  const activeNav = SCENES[scene];
  const on = (i: number) => scene === i && visible;

  return (
    <div ref={outerRef} className="relative w-full select-none" style={{ height: H * scale }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      role="img" aria-label="Demonstração animada do painel do GravitaSolves com dados de exemplo">
      <style>{`
        @keyframes gs-drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(120px,60px) scale(1.15)}}
        @keyframes gs-drift2{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-140px,-40px) scale(.9)}}
        @keyframes gs-float{0%,100%{transform:perspective(900px) rotateX(14deg) rotateY(-16deg) rotateZ(3deg) translateY(0)}50%{transform:perspective(900px) rotateX(10deg) rotateY(-10deg) rotateZ(2deg) translateY(-8px)}}
        @keyframes gs-shine{0%{transform:translateX(-120%)}60%,100%{transform:translateX(220%)}}
        @media (prefers-reduced-motion: reduce){.gs-motion{animation:none!important}}
      `}</style>
      <div ref={stageRef} aria-hidden className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[22px] border border-white/10 bg-[#060a08] text-white shadow-[0_60px_140px_-50px_rgba(6,40,30,.9)]"
        style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {/* brilho verde ao fundo */}
        <div className="gs-motion pointer-events-none absolute -left-24 top-10 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(34,197,130,.30),transparent_65%)] blur-3xl" style={{ animation: "gs-drift1 16s ease-in-out infinite" }} />
        <div className="gs-motion pointer-events-none absolute -right-20 -top-24 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(18,163,122,.26),transparent_65%)] blur-3xl" style={{ animation: "gs-drift2 19s ease-in-out infinite" }} />
        <div className="gs-motion pointer-events-none absolute bottom-[-180px] left-[38%] size-[460px] rounded-full bg-[radial-gradient(circle,rgba(212,240,106,.12),transparent_65%)] blur-3xl" style={{ animation: "gs-drift1 23s ease-in-out infinite reverse" }} />

        <div className="relative grid h-full grid-cols-[214px_1fr]">
          {/* menu lateral */}
          <aside className="flex flex-col border-r border-white/[0.06] bg-black/20 px-3 py-4 backdrop-blur-xl">
            <div className="mb-5 flex items-center gap-2.5 px-1.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#3ddc97] shadow-[0_0_24px_rgba(61,220,151,.45)]"><LogoMark size={20} tone="dark" /></span>
              <span className="leading-tight"><span className="block text-[14px] font-semibold">GravitaSolves</span><span className="block text-[11px] text-white/45">Studio Bella Barba</span></span>
              <ChevronDown className="ml-auto size-4 text-white/40" />
            </div>
            <nav className="space-y-1">
              {NAV.map((n, i) => {
                const act = i === activeNav;
                return (
                  <div key={n.label} ref={(el) => { navRefs.current[i] = el; }}
                    onClick={() => { const s = SCENES.indexOf(i); if (s >= 0) setScene(s); }}
                    className={`flex h-10 cursor-default items-center gap-3 rounded-xl px-3 text-[13.5px] transition-all duration-500 ${act ? "bg-[#4ee39f] font-semibold text-[#06130d] shadow-[0_8px_24px_-8px_rgba(78,227,159,.7)]" : "text-white/55"}`}>
                    <n.icon className="size-[17px]" strokeWidth={act ? 2.4 : 1.8} />{n.label}
                    {n.badge && <span className={`ml-auto rounded-md px-1.5 text-[10.5px] ${act ? "bg-black/15" : "bg-white/10 text-white/70"}`}>{n.badge}</span>}
                  </div>
                );
              })}
            </nav>
            <div className="mt-5 space-y-1 border-t border-white/[0.06] pt-4 text-[13.5px] text-white/45">
              <div className="flex h-9 items-center gap-3 px-3"><Settings className="size-[17px]" strokeWidth={1.8} />Configurações</div>
              <div className="flex h-9 items-center gap-3 px-3"><HelpCircle className="size-[17px]" strokeWidth={1.8} />Ajuda</div>
            </div>
            <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3.5">
              <div className="text-[11px] text-white/45">Recuperado este mês</div>
              <div className="num mt-1 text-[20px] font-semibold text-[#4ee39f]">R$ 3.240</div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full w-[64%] rounded-full bg-[#4ee39f]" /></div>
              <div className="mt-1.5 text-[10.5px] text-white/40">64% da meta</div>
            </div>
          </aside>

          {/* conteúdo */}
          <main className="relative flex min-w-0 flex-col">
            <header className="flex h-[66px] items-center gap-3 border-b border-white/[0.06] px-7">
              <div className="flex h-10 w-[360px] items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 text-[13px] text-white/40"><Search className="size-4" />Buscar clientes, campanhas…<span className="ml-auto rounded-md border border-white/10 px-1.5 text-[10.5px]">Ctrl K</span></div>
              <div className="ml-auto flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-full bg-[#4ee39f] text-[#06130d] shadow-[0_0_22px_rgba(78,227,159,.5)]"><Plus className="size-5" strokeWidth={2.6} /></span>
                <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04]"><Bot className="size-[18px] text-white/70" /></span>
                <span className="relative grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04]"><Bell className="size-[18px] text-white/70" /><span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#f5a524]" /></span>
                <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-[#d4f06a] to-[#4ee39f] text-[13px] font-bold text-[#06130d]">AN</span>
              </div>
            </header>
            <div className="relative flex-1">
              {[Overview, Inactive, Insights, Results].map((S, i) => (
                <div key={i} className="absolute inset-0 px-7 pb-6 pt-6 will-change-[opacity,filter,transform]"
                  style={{
                    opacity: scene === i ? 1 : 0,
                    filter: scene === i ? "blur(0px)" : "blur(22px)",
                    transform: scene === i ? "scale(1)" : "scale(1.025)",
                    transition: "opacity 900ms ease, filter 900ms ease, transform 1100ms cubic-bezier(.2,.7,.2,1)",
                  }}>
                  <S on={on(i)} />
                </div>
              ))}
            </div>
          </main>
        </div>

        {/* cursor */}
        <div className="pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)`, transition: "transform 1150ms cubic-bezier(.65,0,.35,1)" }}>
          <span className={`absolute -left-4 -top-4 size-8 rounded-full bg-white/30 transition-all duration-300 ${cursor.click ? "scale-125 opacity-100" : "scale-0 opacity-0"}`} />
          <MousePointer2 className={`size-7 fill-white text-black drop-shadow-[0_4px_8px_rgba(0,0,0,.6)] transition-transform duration-150 ${cursor.click ? "scale-90" : ""}`} strokeWidth={1.4} />
        </div>
      </div>

      {/* controles visíveis */}
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white/75 backdrop-blur">exemplo ilustrativo</span>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Continuar demonstração" : "Pausar demonstração"}
          className="grid size-7 place-items-center rounded-full bg-black/55 text-white/80 backdrop-blur hover:text-white">
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── peças ───────────────────────── */

const glass = "rounded-[18px] border border-white/[0.07] bg-white/[0.035] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,.05)]";

function Title({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        {eyebrow && <div className="text-[12px] text-white/45">{eyebrow}</div>}
        <h3 className="text-[28px] font-semibold tracking-[-0.03em]">{title}</h3>
        <div className="mt-0.5 text-[13px] text-white/45">{sub}</div>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
const Ghost = ({ children }: { children: React.ReactNode }) => <span className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[12.5px] text-white/75">{children}</span>;
const Primary = ({ children }: { children: React.ReactNode }) => <span className="flex h-9 items-center gap-2 rounded-xl bg-[#4ee39f] px-3.5 text-[12.5px] font-semibold text-[#06130d] shadow-[0_8px_24px_-8px_rgba(78,227,159,.8)]">{children}</span>;
function Tabs({ items, active }: { items: string[]; active: number }) {
  return <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-[11px]">{items.map((t, i) => <span key={t} className={`rounded-md px-2.5 py-1 ${i === active ? "bg-[#4ee39f] font-semibold text-[#06130d]" : "text-white/50"}`}>{t}</span>)}</div>;
}

function Line({ pts, on, w = 100, h = 100, color = "#4ee39f", id, dots }: { pts: number[]; on: boolean; w?: number; h?: number; color?: string; id: string; dots?: number[] }) {
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - (p / 100) * h]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} style={{ opacity: on ? 1 : 0, transition: "opacity 1s ease .6s" }} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transition: "stroke-dashoffset 1.6s cubic-bezier(.3,.6,.2,1) .2s", filter: `drop-shadow(0 0 6px ${color})` }} />
      {dots?.map((i) => <circle key={i} cx={xy[i][0]} cy={xy[i][1]} r="1.6" fill="#f5a524" vectorEffect="non-scaling-stroke" style={{ opacity: on ? 1 : 0, transition: `opacity .4s ease ${1.2 + i * 0.03}s` }} />)}
    </svg>
  );
}

function Bars({ data, on, height = 120, pair }: { data: number[]; on: boolean; height?: number; pair?: number[] }) {
  return (
    <div className="flex items-end gap-[7px]" style={{ height }}>
      {data.map((b, i) => (
        <div key={i} className="flex h-full flex-1 items-end gap-[3px]">
          <div className="flex-1 rounded-t-[4px] bg-gradient-to-t from-[#1f9e6c] to-[#4ee39f] shadow-[0_0_14px_rgba(78,227,159,.35)]"
            style={{ height: on ? `${b}%` : "3%", transition: `height .9s cubic-bezier(.2,.8,.2,1) ${0.15 + i * 0.05}s` }} />
          {pair && <div className="flex-1 rounded-t-[4px] bg-white/[0.13]" style={{ height: on ? `${pair[i]}%` : "3%", transition: `height .9s cubic-bezier(.2,.8,.2,1) ${0.2 + i * 0.05}s` }} />}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── telas ───────────────────────── */

function Overview({ on }: { on: boolean }) {
  const base = useCountUp(24935.57, on, 1600);
  const [cents, setCents] = useState(0);
  useEffect(() => {
    if (!on) { setCents(0); return; }
    const id = setInterval(() => setCents((c) => c + (Math.random() > 0.4 ? 1 : -1) * 0.37), 1100);
    return () => clearInterval(id);
  }, [on]);
  const stats = [["Clientes", "312"], ["Em risco", "41"], ["Inativos", "55"], ["Voltaram", "18"]];
  return (
    <div className="flex h-full flex-col">
      <Title eyebrow="Segunda-feira, 16 de novembro" title="Bom dia, Ana" sub="Aqui está o que mudou na sua base desde ontem.">
        <Ghost><Download className="size-3.5" />Exportar</Ghost><Primary><Plus className="size-3.5" />Nova campanha</Primary>
      </Title>
      <div className="grid flex-1 grid-cols-[300px_1fr] gap-4">
        <div className={`${glass} relative flex flex-col overflow-hidden p-4`}>
          <div className="flex justify-between text-[12.5px]"><span className="font-medium">Cliente em destaque</span><span className="text-white/40">1 de 34</span></div>
          <div className="text-[11px] text-white/40">quem mais vale chamar de volta hoje</div>
          <div className="relative mb-3 mt-auto h-[200px]">
            <div className="absolute inset-x-6 top-4 h-[170px] rounded-[18px] bg-[#1b4a39] opacity-60" style={{ transform: "perspective(900px) rotateX(14deg) rotateY(-16deg) rotateZ(3deg) translateY(-14px)" }} />
            <div className="gs-motion absolute inset-x-4 top-6 h-[170px] overflow-hidden rounded-[18px] border border-white/20 bg-[linear-gradient(135deg,#3fbf8a_0%,#1f7a58_45%,#0f3d2d_100%)] p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,.8),0_0_40px_rgba(78,227,159,.25)]"
              style={{ animation: "gs-float 7s ease-in-out infinite", transform: "perspective(900px) rotateX(14deg) rotateY(-16deg) rotateZ(3deg)" }}>
              <div className="gs-motion absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "gs-shine 5s ease-in-out infinite" }} />
              <div className="flex items-center justify-between text-[11px] font-medium text-white/85"><span>Cartão do cliente</span><LogoMark size={16} tone="light" /></div>
              <div className="mt-3 h-6 w-9 rounded-md bg-gradient-to-br from-[#f3d27a] to-[#b8862f]" />
              <div className="mt-3 text-[17px] font-semibold tracking-wide">Pedro Souza</div>
              <div className="mt-2 flex gap-3.5 whitespace-nowrap text-[10px] text-white/70"><span>Última visita<br /><b className="text-[12px] text-white">42 dias</b></span><span>Chance de voltar<br /><b className="text-[12px] text-white">82%</b></span><span>Ticket<br /><b className="text-[12px] text-white">R$ 72</b></span></div>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className={`${glass} flex-1 p-4`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] text-white/50">Receita recuperável</div>
                <div className="num mt-1 text-[38px] font-semibold leading-none tracking-[-0.03em]">{brl(base + (on ? cents : 0), true)}</div>
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#4ee39f]/15 px-1.5 py-0.5 text-[11px] text-[#4ee39f]"><TrendingUp className="size-3" />+12,4% vs. mês passado</div>
              </div>
              <div className="flex gap-2">{stats.map(([l, v]) => <div key={l} className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-center"><div className="text-[10px] text-white/45">{l}</div><div className="num text-[15px] font-semibold">{v}</div></div>)}</div>
            </div>
            <div className="mt-3 h-[110px]"><Line id="ov" on={on} pts={[30, 32, 31, 36, 34, 52, 50, 58, 49, 44, 41, 38, 36, 40, 46, 44, 52, 57, 55, 62]} dots={[11, 13, 15, 17]} /></div>
            <div className="mt-2 flex gap-4 text-[10.5px] text-white/45"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#4ee39f]" />Projeção</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#f5a524]" />Campanhas enviadas</span></div>
          </div>
          <div className={`${glass} p-4`}>
            <div className="flex items-center justify-between"><div><div className="text-[12.5px] font-medium">Retornos por semana</div><div className="text-[11px] text-white/40">clientes que voltaram depois de uma mensagem</div></div><Tabs items={["Semana", "Mês", "Ano"]} active={2} /></div>
            <div className="mt-3"><Bars on={on} height={70} data={[22, 35, 28, 44, 38, 52, 47, 61, 55, 70, 64, 82, 76, 90]} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Inactive({ on }: { on: boolean }) {
  const rows = [
    ["Pedro Souza", "Corte + barba", 42, "Inativo", 82],
    ["Otávio Cruz", "Corte", 35, "Inativo", 79],
    ["Igor Alves", "Combo", 22, "Em risco", 76],
    ["Lucas Moreira", "Barba", 61, "Inativo", 64],
    ["Rafael Teixeira", "Corte", 19, "Em risco", 61],
    ["Bruno Lima", "Corte + barba", 48, "Inativo", 58],
  ] as const;
  const reasons: [string, number][] = [["Mudou de horário", 38], ["Preço", 24], ["Foi a outro lugar", 21], ["Sem motivo claro", 17]];
  return (
    <div className="flex h-full flex-col">
      <Title title="Inativos" sub="Ordenados por chance de voltar × valor do cliente."><Ghost>Filtros</Ghost><Primary><Megaphone className="size-3.5" />Criar campanha</Primary></Title>
      <div className="mb-4 flex gap-6 border-b border-white/[0.07] text-[12.5px]">
        {["Todos 96", "Em risco 41", "Inativos 55", "Com WhatsApp 71"].map((t, i) => <span key={t} className={`pb-2.5 ${i === 0 ? "border-b-2 border-[#4ee39f] text-white" : "text-white/45"}`}>{t}</span>)}
      </div>
      <div className="grid flex-1 grid-cols-[1fr_250px] gap-4">
        <div className={`${glass} overflow-hidden`}>
          <div className="grid grid-cols-[1.6fr_1fr_.7fr_.9fr_1.2fr] border-b border-white/[0.06] px-4 py-2.5 text-[11px] text-white/40"><span>Cliente</span><span>Serviço</span><span>Sem vir</span><span>Status</span><span>Chance de voltar</span></div>
          {rows.map(([n, s, d, st, p], i) => (
            <div key={n} className="grid grid-cols-[1.6fr_1fr_.7fr_.9fr_1.2fr] items-center border-b border-white/[0.04] px-4 py-[11px] text-[13px]"
              style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(10px)", transition: `all .6s cubic-bezier(.2,.8,.2,1) ${0.2 + i * 0.08}s` }}>
              <span className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-white/[0.08] text-[11px] font-semibold">{n.split(" ").map((x) => x[0]).join("")}</span>{n}</span>
              <span className="text-white/60">{s}</span>
              <span className="num text-white/60">{d} dias</span>
              <span><span className={`rounded-full px-2 py-0.5 text-[11px] ${st === "Inativo" ? "bg-[#e8692a]/15 text-[#ff9a62]" : "bg-[#f5a524]/15 text-[#f5c056]"}`}>{st}</span></span>
              <span className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#4ee39f]" style={{ width: on ? `${p}%` : "0%", transition: `width 1s ease ${0.4 + i * 0.08}s` }} /></span><span className="num w-7 text-[12px]">{p}%</span></span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className={`${glass} p-4`}>
            <div className="text-[12px] text-white/50">Prontos para campanha</div>
            <div className="num mt-1 text-[34px] font-semibold">34</div>
            <div className="text-[11.5px] text-white/45">com WhatsApp autorizado e chance acima de 55%</div>
          </div>
          <div className={`${glass} flex-1 p-4`}>
            <div className="text-[12px] text-white/50">Motivos mais prováveis</div>
            {reasons.map(([l, v], i) => (
              <div key={l} className="mt-3 text-[11.5px]"><div className="flex justify-between"><span>{l}</span><span className="text-white/50">{v}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#1f9e6c] to-[#4ee39f]" style={{ width: on ? `${v * 2.2}%` : "0%", transition: `width 1s ease ${0.5 + i * 0.1}s` }} /></div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const ANSWER = "41 clientes estão em risco. Os que mais valem o contato vinham a cada 3–4 semanas e sumiram há menos de 60 dias. Hipótese: mudaram de horário — ofereça sábado de manhã.";

function Insights({ on }: { on: boolean }) {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!on) { setTyped(0); return; }
    let i = 0;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { id = setInterval(() => { i += 2; setTyped(Math.min(i, ANSWER.length)); if (i >= ANSWER.length && id) clearInterval(id); }, 22); }, 1400);
    return () => { clearTimeout(start); if (id) clearInterval(id); };
  }, [on]);
  const kpis = [
    { l: "Receita recuperada", v: "R$ 3.240", spark: [20, 30, 25, 40, 35, 55, 60], amber: false },
    { l: "Ticket médio", v: "R$ 72,40", spark: [40, 38, 45, 42, 50, 48, 56], amber: false },
    { l: "Taxa de retorno", v: "22%", spark: [10, 14, 12, 18, 20, 19, 22], amber: true },
    { l: "Melhor dia", v: "Sábado", spark: [30, 20, 25, 22, 35, 60, 40], amber: false },
  ];
  return (
    <div className="relative flex h-full flex-col">
      <Title title="Insights" sub="O agente analisa sua base e aponta onde está o dinheiro parado."><Tabs items={["Geral", "Por serviço", "Por horário"]} active={0} /></Title>
      <div className="grid grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={k.l} className={`${glass} p-3.5 ${k.amber ? "bg-[linear-gradient(135deg,rgba(245,165,36,.16),rgba(255,255,255,.02))]" : ""}`} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(8px)", transition: `all .6s ease ${0.1 + i * 0.08}s` }}>
            <div className="text-[11px] text-white/50">{k.l}</div>
            <div className="mt-1 flex items-end justify-between"><span className="num text-[20px] font-semibold">{k.v}</span><span className="h-7 w-20"><Line id={`k${i}`} on={on} pts={k.spark} color={k.amber ? "#f5a524" : "#4ee39f"} /></span></div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-4">
        <div className={`${glass} p-4`}>
          <div className="flex items-center justify-between"><div><div className="text-[12.5px] font-medium">Visitas por semana</div><div className="text-[11px] text-white/40">este ano × ano passado</div></div><Tabs items={["Diário", "Mensal", "Anual"]} active={2} /></div>
          <div className="mt-4"><Bars on={on} height={170} data={[62, 40, 48, 36, 55, 42, 70, 44, 60, 52, 66, 58]} pair={[30, 26, 34, 22, 28, 30, 36, 24, 30, 28, 34, 26]} /></div>
        </div>
        <div className={`${glass} relative p-4`}>
          <div className="flex items-center justify-between"><div><div className="text-[12.5px] font-medium">Clientes em risco ao longo do tempo</div><div className="text-[11px] text-white/40">quanto antes agir, mais barato recuperar</div></div><Tabs items={["30d", "90d", "1a"]} active={1} /></div>
          <div className="mt-4 h-[170px]"><Line id="risk" on={on} pts={[10, 12, 8, 14, 30, 12, 10, 16, 38, 20, 14, 22, 46, 26, 20, 30, 58, 34, 40, 66]} /></div>
        </div>
      </div>
      {/* mensagem do agente */}
      <div className="absolute bottom-4 right-4 w-[380px] rounded-2xl border border-[#4ee39f]/25 bg-[#0b1a14]/90 p-3.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,.8)] backdrop-blur-xl"
        style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(14px)", transition: "all .6s ease 1s" }}>
        <div className="flex items-center gap-2 text-[11.5px] font-medium text-[#4ee39f]"><Bot className="size-4" />Agente GravitaSolves</div>
        <p className="mt-1.5 min-h-[54px] text-[12.5px] leading-relaxed text-white/85">{ANSWER.slice(0, typed)}{typed < ANSWER.length && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#4ee39f] align-middle" />}</p>
      </div>
    </div>
  );
}

function Results({ on }: { on: boolean }) {
  const pct = Math.round(useCountUp(68, on, 1400));
  const segs = [{ v: 42, c: "#4ee39f" }, { v: 26, c: "#d4f06a" }, { v: 18, c: "#f5a524" }, { v: 14, c: "rgba(255,255,255,.18)" }];
  const offsets = segs.map((_, i) => segs.slice(0, i).reduce((a, s) => a + s.v, 0));
  const camps = [["Volta de outubro", 22, "R$ 1.420"], ["Sentimos sua falta", 17, "R$ 980"], ["Horário de sábado", 14, "R$ 610"], ["Aniversariantes", 9, "R$ 230"]] as const;
  return (
    <div className="flex h-full flex-col">
      <Title title="Resultados" sub="Receita registrada de clientes que voltaram depois de uma campanha."><Ghost><CalendarClock className="size-3.5" />Últimos 90 dias</Ghost></Title>
      <div className="grid flex-1 grid-cols-[320px_1fr] gap-4">
        <div className={`${glass} flex flex-col items-center p-5`}>
          <div className="self-start text-[12.5px] font-medium">Retornos por canal</div>
          <div className="relative mt-4 size-[190px]">
            <svg viewBox="0 0 42 42" className="size-full -rotate-90">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="4" />
              {segs.map((s, i) => {
                const len = on ? Math.max(0, s.v - 1.5) : 0;
                return <circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={s.c} strokeWidth="4" strokeLinecap="round" pathLength={100}
                  strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-offsets[i]}
                  style={{ transition: `stroke-dasharray 1.1s ease ${0.3 + i * 0.18}s`, filter: i === 0 ? "drop-shadow(0 0 3px #4ee39f)" : undefined }} />;
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center"><div><div className="num text-[34px] font-semibold">{pct}%</div><div className="text-[11px] text-white/45">da meta do mês</div></div></div>
          </div>
          <div className="mt-5 grid w-full grid-cols-2 gap-2 text-[11px]">
            {[["WhatsApp", "#4ee39f"], ["E-mail", "#d4f06a"], ["SMS", "#f5a524"], ["Espontâneo", "rgba(255,255,255,.3)"]].map(([l, c]) => <span key={l} className="flex items-center gap-1.5 text-white/60"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[["Clientes que voltaram", "18"], ["Receita recuperada", "R$ 3.240"], ["Custo das mensagens", "R$ 41"]].map(([l, v]) => <div key={l} className={`${glass} p-3.5`}><div className="text-[11px] text-white/50">{l}</div><div className="num mt-1 text-[22px] font-semibold">{v}</div></div>)}
          </div>
          <div className={`${glass} flex-1 p-4`}>
            <div className="mb-1 text-[12.5px] font-medium">Desempenho por campanha</div>
            {camps.map(([n, r, v], i) => (
              <div key={n} className="mt-4 text-[12.5px]">
                <div className="flex justify-between"><span>{n}</span><span className="text-white/55"><span className="num">{r}%</span> · {v}</span></div>
                <div className="mt-1.5 h-2 rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-[#1f9e6c] to-[#4ee39f] shadow-[0_0_12px_rgba(78,227,159,.4)]" style={{ width: on ? `${r * 4}%` : "0%", transition: `width 1.1s cubic-bezier(.2,.8,.2,1) ${0.4 + i * 0.12}s` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
