"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tooltipStyle = { borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "rgba(13,20,17,.95)", color: "#e4eae7", fontSize: 12, boxShadow: "0 16px 40px -16px rgba(0,0,0,.8)" };
const tickStyle = { fontSize: 11, fill: "#74807a" };

export function StatusDonut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive>
            {data.filter((d) => d.value > 0).map((d) => <Cell key={d.label} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString("pt-BR"), ""]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-2xl font-semibold">{total.toLocaleString("pt-BR")}</div>
          <div className="text-[11px] text-ink-500">clientes</div>
        </div>
      </div>
    </div>
  );
}

export function RecoveryTrend({ data, height = 220 }: { data: { week: string; recovered: number; revenueCents: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: `${d.week.slice(8, 10)}/${d.week.slice(5, 7)}`, revenue: d.revenueCents / 100 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs><linearGradient id="barMint" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7af0b9" /><stop offset="100%" stopColor="#12a37a" stopOpacity={0.55} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tickStyle} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }}
            formatter={(v, name) => (name === "recovered" ? [v, "Clientes recuperados"] : [Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Receita"])}
            labelFormatter={(l) => `Semana de ${l}`} />
          <Bar dataKey="recovered" fill="url(#barMint)" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, color = "#e8692a" }: { data: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-700">{d.label}</span>
            <span className="num shrink-0 text-ink-500">{d.sub ?? d.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Área verde com a receita recuperada por semana (valores registrados). */
export function RevenueArea({ data, height = 170 }: { data: { week: string; recovered: number; revenueCents: number }[]; height?: number }) {
  const rows = data.map((d) => ({ label: `${d.week.slice(8, 10)}/${d.week.slice(5, 7)}`, revenue: d.revenueCents / 100, recovered: d.recovered }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="areaMint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ee39f" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#4ee39f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tickStyle} interval="preserveStartEnd" minTickGap={24} />
          <YAxis hide />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(78,227,159,.35)", strokeDasharray: "3 3" }}
            formatter={(v, name) => (name === "revenue" ? [Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Receita recuperada"] : [v, "Clientes"])}
            labelFormatter={(l) => `Semana de ${l}`} />
          <Area type="monotone" dataKey="revenue" stroke="#4ee39f" strokeWidth={2.5} fill="url(#areaMint)"
            dot={false} activeDot={{ r: 5, fill: "#4ee39f", stroke: "#06130d", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
