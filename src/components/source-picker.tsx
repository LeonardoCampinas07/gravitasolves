"use client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarCheck, Zap, CalendarDays, FileClock, MessageCircle, MessagesSquare, Contact, FileSpreadsheet, Code2, Puzzle,
  ChevronDown, Check, UploadCloud, Copy, ExternalLink, RefreshCw, Sparkles, Link2,
} from "lucide-react";
import {
  connectIcsUrlAction, disconnectSourceAction, partnerRequestAction, saveBookingAction, setSourcePrefAction, syncGoogleAction, syncIcsUrlAction, uploadSourceAction,
} from "@/app/sources-actions";
import { loadDemoAction } from "@/app/actions";
import { ImportWizard } from "@/components/import-wizard";
import { Badge, Button, Checkbox, Field, Input, Notice, Textarea, cx } from "@/components/ui";

export interface SourceState {
  appUrl: string;
  canManage: boolean;
  google: { configured: boolean; connected: boolean; status: string | null; lastSyncAt: string | null; lastResult: Record<string, unknown> | null };
  icsUrl: { connected: boolean; host: string | null; status: string | null; lastSyncAt: string | null; lastResult: Record<string, unknown> | null };
  booking: { enabled: boolean; slug: string | null; services: string[]; staff: string[]; intro: string };
  whatsapp: { apiConnected: boolean; autoCapture: boolean; countContact: boolean };
  partnerRequested: string | null;
  apiAccess: boolean;
  counts: Record<string, number>; // clientes por origem
  defaultServices: string[];
}

type ModeId = "booking" | "quick" | "google" | "ics_url" | "ics" | "whatsapp_api" | "whatsapp_export" | "vcf" | "sheet" | "api" | "partner";

const MODES: { id: ModeId; icon: typeof Zap; title: string; fit: string; how: string; time: string }[] = [
  { id: "booking", icon: CalendarCheck, title: "Link de agendamento GravitaSolves", fit: "Quem marca horários pelo WhatsApp ou não usa nenhum sistema", how: "Seus clientes pedem horário por um link (bio do Instagram, WhatsApp). Cada pedido já cadastra o cliente, com autorização de contato.", time: "2 min" },
  { id: "quick", icon: Zap, title: "Registro rápido no balcão", fit: "Atendimento por ordem de chegada", how: "Ao fim de cada atendimento, nome, telefone e valor em poucos segundos — pelo celular.", time: "imediato" },
  { id: "google", icon: CalendarDays, title: "Google Agenda", fit: "Quem agenda no Google Agenda ou num app que sincroniza com ele", how: "Lemos 12 meses de agendamentos e sincronizamos todo dia. Somente leitura.", time: "1 min" },
  { id: "ics_url", icon: Link2, title: "Agenda do iPhone, Outlook ou Samsung (link)", fit: "Quem agenda no Calendário do iPhone (iCloud), Outlook ou outro app que gera link de agenda", how: "Cole o link público da agenda. Lemos os agendamentos e sincronizamos todo dia, sem senha. Somente leitura.", time: "2 min" },
  { id: "ics", icon: FileClock, title: "Arquivo de agenda (.ics)", fit: "Outlook, Apple Calendar, Google sem login ou sistemas que exportam agenda", how: "Exporte a agenda e envie o arquivo. Eventos passados viram visitas; futuros, agendamentos.", time: "3 min" },
  { id: "whatsapp_api", icon: MessageCircle, title: "WhatsApp Business (API oficial)", fit: "Quem atende pelo WhatsApp e quer tudo automático daqui para frente", how: "Cada pessoa que conversa com você vira cliente sozinha e a data da última conversa é atualizada.", time: "requer conta Meta" },
  { id: "whatsapp_export", icon: MessagesSquare, title: "Histórico do WhatsApp", fit: "Descobrir quem conversava com você e sumiu", how: "Exporte as conversas pelo próprio WhatsApp e envie aqui. Guardamos só nome, telefone e datas — nunca o conteúdo.", time: "5 min" },
  { id: "vcf", icon: Contact, title: "Contatos do celular", fit: "Montar a lista de clientes em segundos", how: "Exporte os contatos (.vcf) e envie. Depois, agenda ou WhatsApp trazem as datas.", time: "2 min" },
  { id: "sheet", icon: FileSpreadsheet, title: "Planilha (Excel ou CSV)", fit: "Quem já tem um relatório de clientes", how: "Reconhecemos as colunas automaticamente: nome, telefone, última visita, valor gasto…", time: "3 min" },
  { id: "api", icon: Code2, title: "Sistema próprio, Zapier ou Make", fit: "Quem tem desenvolvedor ou usa automações", how: "Envie visitas e clientes pela API do GravitaSolves em tempo real.", time: "técnico" },
  { id: "partner", icon: Puzzle, title: "Meu sistema de agendamento", fit: "Trinks, AppBarber, Booksy, Avec, Belle, Simples Agenda…", how: "Conectores nativos em desenvolvimento. Diga qual você usa e avisamos quando estiver pronto.", time: "em breve" },
];

const HOW_I_WORK: { label: string; modes: ModeId[] }[] = [
  { label: "Marco pelo WhatsApp", modes: ["booking", "whatsapp_export", "whatsapp_api"] },
  { label: "Uso o Google Agenda", modes: ["google", "ics"] },
  { label: "Uso a agenda do iPhone ou Outlook", modes: ["ics_url", "ics"] },
  { label: "Uso um sistema de agendamento", modes: ["partner", "ics", "sheet", "api"] },
  { label: "Atendo por ordem de chegada", modes: ["quick", "vcf", "booking"] },
  { label: "Não registro nada hoje", modes: ["booking", "quick", "vcf", "whatsapp_export"] },
];

export function SourcePicker({ state, compact = false, onAnySuccess }: { state: SourceState; compact?: boolean; onAnySuccess?: () => void }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const [open, setOpen] = useState<ModeId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const recommended = useMemo(() => new Set(answer === null ? [] : HOW_I_WORK[answer].modes), [answer]);
  const ordered = useMemo(() => answer === null ? MODES : [...MODES].sort((a, b) => Number(recommended.has(b.id)) - Number(recommended.has(a.id)) || HOW_I_WORK[answer].modes.indexOf(a.id) - HOW_I_WORK[answer].modes.indexOf(b.id)), [answer, recommended]);

  const status = (id: ModeId): { label: string; tone: "brand" | "warn" | "neutral" | "violet" } | null => {
    if (id === "booking" && state.booking.enabled) return { label: "Ativo", tone: "brand" };
    if (id === "google" && state.google.connected) return state.google.status === "error" ? { label: "Erro na sincronização", tone: "warn" } : { label: "Conectado", tone: "brand" };
    if (id === "ics_url" && state.icsUrl.connected) return state.icsUrl.status === "error" ? { label: "Erro na sincronização", tone: "warn" } : { label: "Conectado", tone: "brand" };
    if (id === "whatsapp_api" && state.whatsapp.apiConnected) return { label: state.whatsapp.autoCapture ? "Capturando" : "Conectado", tone: "brand" };
    if (id === "partner" && state.partnerRequested) return { label: `Pedido: ${state.partnerRequested}`, tone: "violet" };
    const countKey = { quick: "quick", ics: "ics", whatsapp_export: "whatsapp_export", vcf: "vcf", sheet: "csv", api: "api" }[id as string];
    const n = countKey ? (state.counts[countKey] ?? 0) + (id === "sheet" ? state.counts.xlsx ?? 0 : 0) : 0;
    if (n) return { label: `${n} clientes`, tone: "brand" };
    return null;
  };

  // Menos opções na tela: só as recomendadas (ou as 3 mais usadas), as já conectadas e a aberta; o resto fica em "ver todas".
  const DEFAULT_MODES: ModeId[] = ["booking", "quick", "sheet"];
  const visible = showAll ? ordered : ordered.filter((m) =>
    (answer === null ? DEFAULT_MODES.includes(m.id) : recommended.has(m.id)) || status(m.id) !== null || open === m.id);
  const hiddenCount = ordered.length - visible.length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-[15px] font-semibold">Como você atende seus clientes hoje?</div>
        <p className="mt-0.5 text-[13px] text-ink-500">Escolha a opção mais parecida — mostramos primeiro os jeitos mais fáceis para o seu caso. Você pode usar vários ao mesmo tempo: o GravitaSolves junta tudo pelo telefone.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {HOW_I_WORK.map((h, i) => (
            <button key={h.label} type="button" onClick={() => { setAnswer(answer === i ? null : i); setOpen(answer === i ? null : h.modes[0]); }}
              className={cx("rounded-full border px-3.5 py-1.5 text-[13px] transition", answer === i ? "border-ink-950 bg-ink-950 text-white" : "border-line bg-surface text-ink-700 hover:border-ink-300")}>
              {answer === i && <Check className="mr-1 inline size-3.5" />}{h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {visible.map((m) => {
          const st = status(m.id);
          const isOpen = open === m.id;
          const rec = recommended.has(m.id);
          const Icon = m.icon;
          return (
            <div key={m.id} className={cx("overflow-hidden rounded-2xl border bg-surface transition", isOpen ? "border-ink-950 shadow-[0_12px_40px_-24px_rgba(10,15,13,.45)]" : rec ? "border-brand-200" : "border-line")}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-paper/60">
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", isOpen || rec ? "bg-ink-950 text-citrus" : "bg-paper text-ink-600 ring-1 ring-line")}><Icon className="size-5" strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{m.title}</span>
                    {rec && <Badge tone="dark"><Sparkles className="size-3" />Recomendado para você</Badge>}
                    {st && <Badge tone={st.tone}>{st.label}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-ink-500">{m.fit}</span>
                </span>
                <span className="hidden text-xs text-ink-400 sm:block">{m.time}</span>
                <ChevronDown className={cx("size-4 shrink-0 text-ink-400 transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-line bg-paper/40 px-5 py-5 animate-fade">
                  <p className="mb-4 max-w-3xl text-[13.5px] text-ink-700">{m.how}</p>
                  <ModePanel id={m.id} state={state} onSuccess={onAnySuccess} />
                </div>
              )}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="rounded-2xl border border-dashed border-line px-5 py-3 text-[13px] font-medium text-ink-600 hover:border-ink-300 hover:text-ink-950">
            Ver todas as formas de conectar (+{hiddenCount})
          </button>
        )}
        {showAll && answer !== null && (
          <button type="button" onClick={() => setShowAll(false)} className="text-[12.5px] text-ink-500 hover:text-ink-950">Mostrar só as recomendadas</button>
        )}
      </div>

      {compact && (
        <p className="text-center text-[13px] text-ink-500">
          Quer só conhecer a plataforma? <DemoLink onDone={onAnySuccess} /> (clientes fictícios, identificados como demonstração).
        </p>
      )}
    </div>
  );
}

function DemoLink({ onDone }: { onDone?: () => void }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} className="font-medium text-ink-950 underline underline-offset-4" onClick={() => start(async () => { const r = await loadDemoAction(); if (r.ok) onDone?.(); })}>{pending ? "Carregando…" : "Carregar dados de demonstração"}</button>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mb-4 space-y-1.5 text-[13px] text-ink-700">
      {items.map((it, i) => <li key={i} className="flex gap-2.5"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-ink-950 text-[11px] text-citrus">{i + 1}</span><span>{it}</span></li>)}
    </ol>
  );
}

function ModePanel({ id, state, onSuccess }: { id: ModeId; state: SourceState; onSuccess?: () => void }) {
  switch (id) {
    case "booking": return <BookingPanel state={state} onSuccess={onSuccess} />;
    case "quick": return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agenda" className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-950 px-3.5 text-sm font-medium text-white hover:bg-ink-800"><Zap className="size-4" />Abrir a agenda e registrar</Link>
        <span className="text-xs text-ink-500">Dica: salve a página na tela inicial do celular para registrar em segundos.</span>
      </div>
    );
    case "google": return <GooglePanel state={state} onSuccess={onSuccess} />;
    case "ics_url": return <IcsUrlPanel state={state} onSuccess={onSuccess} />;
    case "ics": return (
      <>
        <Steps items={[
          <><b>Google Agenda:</b> calendar.google.com → ⚙ Configurações → Importar e exportar → Exportar (baixa um .zip — pode enviar o .zip).</>,
          <><b>Outlook:</b> Calendário → Compartilhar/Publicar → baixe o link ICS, ou Arquivo → Salvar calendário.</>,
          <><b>Apple Calendar (Mac):</b> selecione a agenda → Arquivo → Exportar → Exportar.</>,
          <>Envie abaixo. Eventos como “Almoço” ou “Folga” são ignorados; títulos como “Corte - João Silva” viram cliente + serviço.</>,
        ]} />
        <FileDrop kind="ics" accept=".ics,.zip" label="Arraste o arquivo .ics ou .zip da agenda" disabled={!state.canManage} onSuccess={onSuccess} />
      </>
    );
    case "whatsapp_api": return <WhatsAppApiPanel state={state} />;
    case "whatsapp_export": return (
      <>
        <Steps items={[
          <><b>Android:</b> abra a conversa → ⋮ → Mais → Exportar conversa → <b>Sem mídia</b> → salve ou envie para você mesmo.</>,
          <><b>iPhone:</b> abra a conversa → toque no nome → Exportar conversa → <b>Sem mídia</b>.</>,
          <>Repita para os clientes que quiser (comece pelos que sumiram) e envie todos de uma vez — .txt ou .zip.</>,
        ]} />
        <Notice><b>Privacidade:</b> lemos apenas quem é o contato e as datas das mensagens. O texto das conversas não é armazenado.</Notice>
        <div className="mt-3"><FileDrop kind="whatsapp" accept=".txt,.zip" multiple label="Arraste as conversas exportadas (.txt ou .zip)" disabled={!state.canManage} onSuccess={onSuccess} /></div>
        <ContactPref state={state} />
      </>
    );
    case "vcf": return (
      <>
        <Steps items={[
          <><b>Android:</b> app Contatos → ☰ → Corrigir e gerenciar → Exportar para arquivo (.vcf).</>,
          <><b>iPhone:</b> icloud.com/contacts → selecione os contatos → ⚙ → Exportar vCard.</>,
          <>Envie o arquivo. Contatos sem telefone ou e-mail são ignorados.</>,
        ]} />
        <FileDrop kind="vcf" accept=".vcf,.zip" label="Arraste o arquivo de contatos (.vcf)" disabled={!state.canManage} onSuccess={onSuccess} />
      </>
    );
    case "sheet": return <ImportWizard allowDemo={false} onDone={() => onSuccess?.()} />;
    case "api": return (
      <div className="space-y-3 text-[13px] text-ink-700">
        <p>Cada atendimento enviado pela API atualiza o cliente e atribui retornos às campanhas automaticamente. Funciona com Zapier, Make, n8n ou integração própria.</p>
        <pre className="thin-scroll overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11.5px] leading-relaxed text-ink-200">{`POST ${state.appUrl}/api/v1/visits
Authorization: Bearer gv_...
{"customer":{"phone":"+5511987654321"},"date":"2026-11-10","amount":80}`}</pre>
        {state.apiAccess ? <Link href="/integracoes" className="font-medium text-brand-700 underline">Gerar chave de API em Integrações</Link> : <Badge tone="warn">Disponível a partir do plano Profissional</Badge>}
      </div>
    );
    case "partner": return <PartnerPanel state={state} />;
  }
}

function FileDrop({ kind, accept, label, multiple, disabled, onSuccess }: { kind: "ics" | "whatsapp" | "vcf"; accept: string; label: string; multiple?: boolean; disabled?: boolean; onSuccess?: () => void }) {
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const send = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    start(async () => {
      const r = await uploadSourceAction(kind, fd);
      setRes(r.ok ? { ok: true, lines: r.data!.lines } : { ok: false, lines: [r.error ?? "Erro"] });
      if (r.ok) onSuccess?.();
    });
  };
  return (
    <div className="space-y-3">
      <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
        className={cx("flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-surface px-6 py-8 text-center transition", drag ? "border-brand-500 bg-brand-50" : "border-line hover:border-ink-300", disabled && "pointer-events-none opacity-50")}>
        <input ref={input} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(e) => send(e.target.files)} />
        <UploadCloud className={cx("size-6 text-ink-500", pending && "animate-bounce")} />
        <span className="mt-2 text-sm font-medium">{pending ? "Processando…" : label}</span>
        <span className="mt-0.5 text-xs text-ink-400">ou clique para escolher {multiple ? "os arquivos" : "o arquivo"}</span>
      </label>
      {res && <Notice tone={res.ok ? "success" : "danger"} title={res.ok ? "Pronto!" : undefined}>{res.lines.map((l) => <div key={l}>{l}</div>)}</Notice>}
    </div>
  );
}

function GooglePanel({ state, onSuccess }: { state: SourceState; onSuccess?: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const g = state.google;
  if (!g.configured) return (
    <Notice tone="warn" title="Conexão com Google ainda não habilitada neste servidor">
      O administrador da plataforma precisa cadastrar <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> (passo a passo em docs/03-PRODUCAO.md).
      Enquanto isso, use <b>Arquivo de agenda (.ics)</b>: exporte do Google Agenda e envie — o resultado é o mesmo, só não sincroniza sozinho.
    </Notice>
  );
  if (!g.connected) return (
    <div className="flex flex-wrap items-center gap-3">
      {state.canManage ? <a href="/api/sources/google/start" className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium shadow-sm hover:bg-paper">
        <svg viewBox="0 0 24 24" className="size-4"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
        Conectar com Google</a> : <span className="text-sm text-ink-500">Peça a um administrador para conectar.</span>}
      <span className="text-xs text-ink-500">Permissão somente de leitura. Você pode revogar a qualquer momento.</span>
    </div>
  );
  const r = g.lastResult ?? {};
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-700">
        Última sincronização: <b>{g.lastSyncAt ? new Date(g.lastSyncAt).toLocaleString("pt-BR") : "—"}</b>
        {"visits" in r && <> · {String(r.visits)} visitas, {String(r.upcoming)} futuros, {String(r.created)} clientes novos</>}
        {"error" in r && <div className="mt-1 text-st-high">Erro: {String(r.error)}</div>}
      </div>
      <p className="text-xs text-ink-500">A sincronização roda sozinha todos os dias. Títulos como “Corte - João Silva (11) 98888-7777” identificam melhor o cliente.</p>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
      {state.canManage && (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => { const x = await syncGoogleAction(); setMsg(x.ok ? { ok: true, text: x.data!.lines[0] } : { ok: false, text: x.error! }); if (x.ok) onSuccess?.(); })}><RefreshCw className={cx("size-4", pending && "animate-spin")} />Sincronizar agora</Button>
          <Button variant="ghost" disabled={pending} onClick={() => confirm("Desconectar o Google Agenda? Os clientes já importados continuam.") && start(async () => { await disconnectSourceAction("google_calendar"); })}>Desconectar</Button>
        </div>
      )}
    </div>
  );
}

function IcsUrlPanel({ state, onSuccess }: { state: SourceState; onSuccess?: () => void }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = state.icsUrl;
  const done = (x: { ok: boolean; data?: { lines: string[] }; error?: string }) => { setMsg(x.ok ? { ok: true, text: x.data!.lines.join(" ") } : { ok: false, text: x.error! }); if (x.ok) { setUrl(""); onSuccess?.(); } };
  if (!c.connected) return (
    <>
      <Steps items={[
        <><b>iPhone (iCloud):</b> app Calendário → Calendários → toque no ⓘ da agenda → ative <b>Calendário Público</b> → <b>Compartilhar Link</b> → Copiar.</>,
        <><b>Outlook:</b> outlook.com → ⚙ Configurações → Calendário → Calendários compartilhados → Publicar um calendário → “Pode ver todos os detalhes” → copie o link <b>ICS</b>.</>,
        <><b>Samsung / Google:</b> se a agenda do Samsung sincroniza com uma conta Google, use <b>Google Agenda</b>. Se é só no celular, exporte o arquivo e use <b>Arquivo de agenda (.ics)</b>.</>,
        <>Cole o link abaixo (começa com <code>webcal://</code> ou <code>https://</code>). Eventos como “Almoço” ou “Folga” são ignorados.</>,
      ]} />
      {state.canManage ? (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); start(async () => done(await connectIcsUrlAction(url))); }}>
          <Input type="url" inputMode="url" required placeholder="webcal://p00-caldav.icloud.com/published/2/…" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" aria-label="Link da agenda" />
          <Button type="submit" disabled={pending || !url.trim()}>{pending ? <RefreshCw className="size-4 animate-spin" /> : <Link2 className="size-4" />}Conectar e sincronizar</Button>
        </form>
      ) : <span className="text-sm text-ink-500">Peça a um administrador para conectar.</span>}
      <p className="mt-2 text-xs text-ink-500">O link dá acesso de leitura à agenda: guardamos criptografado e nunca mostramos de volta. Para cortar o acesso, desative o compartilhamento no celular.</p>
      {msg && <div className="mt-2"><Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice></div>}
    </>
  );
  const r = c.lastResult ?? {};
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-700">
        Agenda conectada{c.host && <> ({c.host})</>} · Última sincronização: <b>{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("pt-BR") : "—"}</b>
        {"visits" in r && <> · {String(r.visits)} visitas, {String(r.upcoming)} futuros, {String(r.created)} clientes novos</>}
        {"error" in r && <div className="mt-1 text-st-high">Erro: {String(r.error)}</div>}
      </div>
      <p className="text-xs text-ink-500">A sincronização roda sozinha todos os dias. Títulos como “Limpeza - Maria Souza (11) 98888-7777” identificam melhor o cliente.</p>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
      {state.canManage && (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => done(await syncIcsUrlAction()))}><RefreshCw className={cx("size-4", pending && "animate-spin")} />Sincronizar agora</Button>
          <Button variant="ghost" disabled={pending} onClick={() => confirm("Desconectar a agenda por link? Os clientes já importados continuam.") && start(async () => { await disconnectSourceAction("ics_url"); })}>Desconectar</Button>
        </div>
      )}
    </div>
  );
}

function ContactPref({ state }: { state: SourceState }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-3">
      <Checkbox disabled={pending || !state.canManage} defaultChecked={state.whatsapp.countContact}
        onChange={(e) => { const v = e.target.checked; start(async () => { await setSourcePrefAction("countContactAsActivity", v); }); }}
        label="Considerar a última conversa como atividade do cliente"
        hint="Útil quando você não registra visitas: quem não conversa com você há muito tempo aparece como inativo. Se houver visita mais recente, ela prevalece." />
    </div>
  );
}

function WhatsAppApiPanel({ state }: { state: SourceState }) {
  const [pending, start] = useTransition();
  if (!state.whatsapp.apiConnected) return (
    <div className="space-y-3 text-[13px] text-ink-700">
      <p>Usa a API oficial da Meta (seu número continua seu). O WhatsApp não permite ler conversas antigas por integração — para o passado, use <b>Histórico do WhatsApp</b>.</p>
      <Link href="/integracoes" className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-950 px-3.5 text-sm font-medium text-white hover:bg-ink-800"><MessageCircle className="size-4" />Conectar WhatsApp em Integrações</Link>
    </div>
  );
  return (
    <div className="space-y-3">
      <Checkbox disabled={pending || !state.canManage} defaultChecked={state.whatsapp.autoCapture}
        onChange={(e) => { const v = e.target.checked; start(async () => { await setSourcePrefAction("whatsappAutoCapture", v); }); }}
        label="Criar cliente automaticamente para cada pessoa que mandar mensagem"
        hint="Quem já é cliente só tem a data do último contato atualizada. Pedidos de “SAIR” nunca criam cadastro." />
      <ContactPref state={state} />
    </div>
  );
}

function PartnerPanel({ state }: { state: SourceState }) {
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(state.partnerRequested);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{["Trinks", "AppBarber", "Booksy", "Avec", "Belle Software", "Simples Agenda", "Agenda Edu", "Outro"].map((s) => (
        <button key={s} type="button" onClick={() => setV(s === "Outro" ? "" : s)} className={cx("rounded-md px-2.5 py-1 text-xs ring-1", v === s ? "bg-ink-950 text-white ring-ink-950" : "bg-surface text-ink-600 ring-line hover:text-ink-950")}>{s}</button>
      ))}</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await partnerRequestAction(v); if (r.ok) setDone(v); }); }}>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Qual sistema você usa?" />
        <Button disabled={pending || !v.trim()}>Avisar-me</Button>
      </form>
      {done && <Notice tone="success">Registramos <b>{done}</b>. Enquanto o conector não fica pronto: exporte a agenda (.ics) ou um relatório de clientes (planilha) do seu sistema.</Notice>}
    </div>
  );
}

function BookingPanel({ state, onSuccess }: { state: SourceState; onSuccess?: () => void }) {
  const b = state.booking;
  const [pending, start] = useTransition();
  const [slug, setSlug] = useState(b.slug);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const link = slug ? `${state.appUrl}/agendar/${slug}` : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <form className="space-y-3" action={(fd) => start(async () => {
        const r = await saveBookingAction(fd);
        if (r.ok) { setSlug(r.data!); setMsg({ ok: true, text: "Link salvo e ativo." }); onSuccess?.(); } else setMsg({ ok: false, text: r.error! });
      })}>
        <Field label="Endereço do link" hint="Só letras, números e hífen.">
          <div className="flex items-center rounded-lg border border-line bg-surface pl-3 text-sm text-ink-400 focus-within:border-brand-500">
            <span className="shrink-0">…/agendar/</span><input name="slug" defaultValue={b.slug ?? ""} placeholder="seu-negocio" className="h-9 w-full bg-transparent px-1 text-ink-950 outline-none" />
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Serviços (um por linha)"><Textarea name="services" rows={4} defaultValue={(b.services.length ? b.services : state.defaultServices).join("\n")} /></Field>
          <Field label="Profissionais (opcional)"><Textarea name="staff" rows={4} defaultValue={b.staff.join("\n")} placeholder={"Rafael\nThiago"} /></Field>
        </div>
        <Field label="Mensagem de boas-vindas (opcional)"><Input name="intro" defaultValue={b.intro} placeholder="Escolha o melhor horário e confirmamos pelo WhatsApp." /></Field>
        {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
        <div className="flex gap-2">
          <Button disabled={pending || !state.canManage}>{b.enabled ? "Salvar alterações" : "Ativar link de agendamento"}</Button>
          {b.enabled && <Button type="button" variant="ghost" disabled={pending} onClick={() => { const fd = new FormData(); fd.set("enabled", "off"); fd.set("slug", slug ?? ""); start(async () => { await saveBookingAction(fd); setMsg({ ok: true, text: "Link desativado." }); }); }}>Desativar</Button>}
        </div>
      </form>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-400">Seu link</div>
        {link && (b.enabled || msg?.ok) ? (
          <>
            <div className="mt-2 break-all rounded-lg bg-paper p-2.5 text-[13px] font-medium">{link}</div>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(link)}><Copy className="size-4" />Copiar</Button>
              <a href={`/agendar/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-600 hover:bg-paper"><ExternalLink className="size-4" />Ver</a>
            </div>
            <p className="mt-3 text-xs text-ink-500">Coloque na bio do Instagram, no status e na mensagem automática do WhatsApp. Os pedidos chegam em <Link className="underline" href="/agenda">Agenda</Link>.</p>
          </>
        ) : <p className="mt-2 text-[13px] text-ink-500">Ative para gerar o link.</p>}
      </div>
    </div>
  );
}
