"use client";
/** Calculadora da landing: a pessoa informa os próprios números e vê quanto está parado. Nada aqui é dado real de cliente. */
import { useState } from "react";
import { money } from "@/lib/format";

function NumberField({ label, value, onChange, prefix, max }: { label: string; value: number; onChange: (n: number) => void; prefix?: string; max: number }) {
  return (
    <label className="block">
      <span className="text-[13px] text-ink-600">{label}</span>
      <div className="mt-1.5 flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-brand-600/60">
        {prefix && <span className="mr-1.5 text-sm text-ink-500">{prefix}</span>}
        <input
          type="number" inputMode="numeric" min={0} max={max} value={value || ""}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
          className="num w-full bg-transparent text-[15px] text-ink-950 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </label>
  );
}

export function LostRevenue() {
  const [customers, setCustomers] = useState(40);
  const [ticket, setTicket] = useState(80);
  const [visits, setVisits] = useState(1);
  const monthly = customers * ticket * visits * 100; // em centavos
  return (
    <div className="grid gap-8 glass relative overflow-hidden rounded-3xl p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.1em] text-brand-600">Faça a conta</div>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">Quanto custa o cliente que parou de vir?</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-600">Coloque os seus números. É uma estimativa simples, só para você ter noção do tamanho.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <NumberField label="Clientes que sumiram" value={customers} onChange={setCustomers} max={100000} />
          <NumberField label="Gasto médio por visita" value={ticket} onChange={setTicket} prefix="R$" max={100000} />
          <NumberField label="Visitas por mês" value={visits} onChange={setVisits} max={60} />
        </div>
      </div>
      <div className="rounded-2xl border border-brand-600/20 bg-brand-600/[0.05] p-6 text-center" aria-live="polite">
        <div className="text-[13px] text-ink-600">Receita que deixa de entrar</div>
        <div className="num mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em] bg-gradient-to-r from-[#4ee39f] to-[#d4f06a] bg-clip-text text-transparent sm:text-[46px]">{money(monthly)}</div>
        <div className="mt-1 text-[13px] text-ink-500">por mês</div>
        <div className="mx-auto mt-5 h-px w-16 bg-white/10" />
        <p className="mt-5 text-[13px] leading-relaxed text-ink-600">
          Se só <strong className="text-ink-950">1 em cada 5</strong> voltar, são <strong className="num text-ink-950">{money(Math.round(monthly / 5))}</strong> por mês de volta no caixa.
        </p>
      </div>
    </div>
  );
}
