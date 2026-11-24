"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Check, X, UserX, MessageCircle, CheckCheck } from "lucide-react";
import { appointmentAction, quickCheckInAction } from "@/app/sources-actions";
import { Badge, Button, Checkbox, Field, Input, Notice, cx } from "@/components/ui";

export interface ApptView { id: string; when: string; name: string; phone: string | null; service: string | null; staff: string | null; status: string; source: string; amountCents: number | null; customerId: string | null; notes: string | null }

const SOURCE: Record<string, string> = { booking_page: "Link", quick: "Balcão", google_calendar: "Google", ics: "Agenda", manual: "Manual" };
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function QuickCheckIn({ services, staff }: { services: string[]; staff: string[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const [service, setService] = useState("");
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="space-y-3" action={(fd) => start(async () => {
      fd.set("service", service);
      const r = await quickCheckInAction(fd);
      if (!r.ok) return setMsg({ tone: "danger", text: r.error ?? "Erro" });
      setMsg({ tone: "success", text: r.data?.recovered ? "Registrado — e esse cliente voltou por causa de uma campanha!" : "Atendimento registrado." });
      form.current?.reset(); setService("");
    })}>
      <Field label="Nome do cliente"><Input name="name" required autoComplete="off" /></Field>
      <Field label="WhatsApp" hint="Com DDD. Identifica o cliente nas próximas visitas."><Input name="phone" inputMode="tel" placeholder="(11) 98765-4321" /></Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Serviço</span>
        <div className="flex flex-wrap gap-1.5">
          {services.slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => setService(service === s ? "" : s)} className={cx("rounded-lg px-2.5 py-1.5 text-[13px] ring-1 transition", service === s ? "bg-ink-950 text-white ring-ink-950" : "bg-surface text-ink-700 ring-line hover:ring-ink-300")}>{s}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)"><Input name="amount" inputMode="decimal" placeholder="0,00" /></Field>
        {staff.length > 0 ? (
          <Field label="Profissional"><select name="staff" className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm"><option value="">—</option>{staff.map((s) => <option key={s}>{s}</option>)}</select></Field>
        ) : <Field label="Data"><Input name="date" type="date" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} /></Field>}
      </div>
      <Checkbox name="consent" label="Cliente autorizou receber mensagens pelo WhatsApp" />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button className="h-10 w-full" disabled={pending}><CheckCheck className="size-4" />{pending ? "Registrando…" : "Registrar atendimento"}</Button>
    </form>
  );
}

export function AppointmentRow({ a, canWrite }: { a: ApptView; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  const d = new Date(a.when);
  const date = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const run = (op: "confirm" | "done" | "no_show" | "cancel") => {
    let amount: string | undefined;
    if (op === "done") { const v = prompt("Valor do atendimento (R$) — deixe em branco se não souber:", ""); if (v === null) return; amount = v; }
    start(async () => { const r = await appointmentAction(a.id, op, amount); setMsg(r.ok ? (r.data?.recovered ? "Cliente recuperado por campanha!" : undefined) : r.error); });
  };
  const wa = a.phone ? `https://wa.me/${a.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, ${a.name.split(" ")[0]}! Confirmando seu horário${a.service ? ` de ${a.service}` : ""} em ${date} às ${time}. Podemos confirmar?`)}` : null;
  return (
    <li className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", pending && "opacity-60")}>
      <div className="w-24 shrink-0"><div className="num text-sm font-semibold">{time}</div><div className="text-xs capitalize text-ink-500">{date}</div></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {a.customerId ? <Link href={`/clientes/${a.customerId}`} className="truncate text-sm font-medium hover:underline">{a.name}</Link> : <span className="text-sm font-medium">{a.name}</span>}
          <Badge>{SOURCE[a.source] ?? a.source}</Badge>
          {a.status === "no_show" && <Badge tone="warn">Faltou</Badge>}
          {a.status === "done" && a.amountCents ? <Badge tone="brand">{brl(a.amountCents)}</Badge> : null}
        </div>
        <div className="truncate text-xs text-ink-500">{[a.service, a.staff, a.phone].filter(Boolean).join(" · ")}{a.notes ? ` · “${a.notes}”` : ""}</div>
        {msg && <div className="text-xs text-st-recovered">{msg}</div>}
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-1.5">
          {wa && a.status === "requested" && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"><MessageCircle className="size-3.5" />Combinar</a>}
          {a.status === "requested" && <Button variant="secondary" className="h-8 px-2.5 text-xs" disabled={pending} onClick={() => run("confirm")}><Check className="size-3.5" />Confirmar</Button>}
          {(a.status === "requested" || a.status === "confirmed") && <Button className="h-8 px-2.5 text-xs" disabled={pending} onClick={() => run("done")}><CheckCheck className="size-3.5" />Atendido</Button>}
          {a.status === "confirmed" && <Button variant="ghost" className="h-8 px-2 text-xs" disabled={pending} onClick={() => run("no_show")} title="Faltou"><UserX className="size-3.5" /></Button>}
          {(a.status === "requested" || a.status === "confirmed") && <Button variant="ghost" className="h-8 px-2 text-xs" disabled={pending} onClick={() => confirm("Cancelar este horário?") && run("cancel")} title="Cancelar"><X className="size-3.5" /></Button>}
        </div>
      )}
    </li>
  );
}
