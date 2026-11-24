"use client";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { requestBookingAction } from "@/app/sources-actions";
import { Button, Checkbox, Field, Input, Notice, cx } from "@/components/ui";

const TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export function BookingForm({ slug, services, staff, staffLabel, businessName }: { slug: string; services: string[]; staff: string[]; staffLabel: string; businessName: string }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return {
      value: d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      wd: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", ""),
      day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }),
    };
  }), []);
  const [service, setService] = useState(services[0] ?? "");
  const [pro, setPro] = useState("");
  const [date, setDate] = useState(days[0].value);
  const [time, setTime] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  if (done) return (
    <div className="mt-6 rounded-xl bg-brand-50 p-5 text-center animate-rise">
      <CheckCircle2 className="mx-auto size-8 text-brand-600" />
      <div className="mt-2 font-semibold">Pedido enviado!</div>
      <p className="mt-1 text-sm text-ink-600">{businessName} vai confirmar seu horário pelo WhatsApp.</p>
    </div>
  );

  const chip = (active: boolean) => cx("rounded-xl px-3 py-2 text-sm ring-1 transition", active ? "bg-ink-950 text-white ring-ink-950" : "bg-surface text-ink-700 ring-line hover:ring-ink-300");
  return (
    <form className="mt-6 space-y-5" action={(fd) => {
      fd.set("service", service); fd.set("staff", pro); fd.set("date", date); fd.set("time", time);
      start(async () => { const r = await requestBookingAction(slug, fd); if (r.ok) setDone(true); else setError(r.error); });
    }}>
      {services.length > 0 && (
        <div><div className="mb-2 text-[13px] font-medium text-ink-700">Serviço</div>
          <div className="flex flex-wrap gap-2">{services.map((s) => <button type="button" key={s} onClick={() => setService(s)} className={chip(service === s)}>{s}</button>)}</div></div>
      )}
      {staff.length > 0 && (
        <div><div className="mb-2 text-[13px] font-medium capitalize text-ink-700">{staffLabel} (opcional)</div>
          <div className="flex flex-wrap gap-2">{["", ...staff].map((s) => <button type="button" key={s || "any"} onClick={() => setPro(s)} className={chip(pro === s)}>{s || "Tanto faz"}</button>)}</div></div>
      )}
      <div>
        <div className="mb-2 text-[13px] font-medium text-ink-700">Dia</div>
        <div className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d) => (
            <button type="button" key={d.value} onClick={() => setDate(d.value)} className={cx("flex min-w-16 flex-col items-center rounded-xl px-3 py-2 ring-1 transition", date === d.value ? "bg-ink-950 text-white ring-ink-950" : "bg-surface ring-line hover:ring-ink-300")}>
              <span className="text-[11px] capitalize opacity-70">{d.wd}</span><span className="num text-sm font-semibold">{d.day}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-medium text-ink-700">Horário preferido</div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{TIMES.map((t) => <button type="button" key={t} onClick={() => setTime(t)} className={cx(chip(time === t), "num")}>{t}</button>)}</div>
        <p className="mt-1.5 text-xs text-ink-400">É uma preferência — o estabelecimento confirma a disponibilidade.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Seu nome"><Input name="name" required autoComplete="name" /></Field>
        <Field label="WhatsApp"><Input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" /></Field>
      </div>
      <Field label="Observação (opcional)"><Input name="notes" maxLength={300} /></Field>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Checkbox name="consent" label={`Quero receber lembretes e novidades de ${businessName} pelo WhatsApp`} hint="Opcional. Você pode sair quando quiser respondendo SAIR." />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button className="h-11 w-full text-[15px]" disabled={pending || !time}>{pending ? "Enviando…" : time ? `Pedir horário · ${time}` : "Escolha um horário"}</Button>
    </form>
  );
}
