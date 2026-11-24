"use client";
/** Meta mensal de clientes recuperados: mostra o progresso e permite ajustar sem sair do painel. */
import { useState, useTransition } from "react";
import { Pencil, Target } from "lucide-react";
import { saveGoalAction } from "@/app/actions";

export function GoalCard({ goal, done, canEdit }: { goal: number; done: number; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goal ? String(goal) : "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const save = () => start(async () => {
    const r = await saveGoalAction(Number(value) || 0);
    if (r.ok) { setEditing(false); setError(undefined); } else setError(r.error ?? "Erro");
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] text-white/55"><Target className="size-3.5" />Meta do mês</div>
        {canEdit && !editing && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-white/45 hover:bg-white/5 hover:text-white"><Pencil className="size-3" />{goal ? "Ajustar" : "Definir meta"}</button>}
      </div>
      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min={0} max={100000} value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="Clientes recuperados por mês"
            className="h-9 w-24 rounded-lg border border-white/15 bg-white/5 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4ee39f]/40" />
          <span className="text-[12px] text-white/45">clientes/mês</span>
          <button disabled={pending} onClick={save} className="ml-auto h-8 rounded-lg bg-[#4ee39f] px-3 text-[12.5px] font-medium text-[#06130d] disabled:opacity-50">{pending ? "…" : "Salvar"}</button>
          <button onClick={() => setEditing(false)} className="h-8 px-2 text-[12.5px] text-white/45 hover:text-white">Cancelar</button>
        </div>
      ) : goal ? (
        <>
          <div className="num mt-1 text-[26px] font-semibold text-white">{done}<span className="text-[15px] font-normal text-white/40"> / {goal} clientes</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#12a37a] to-[#4ee39f] transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 text-[11.5px] text-white/40">{pct >= 100 ? "Meta batida! 🎉" : `${pct}% — faltam ${goal - done}`}</div>
        </>
      ) : (
        <p className="mt-2 text-[12.5px] text-white/45">Defina quantos clientes quer trazer de volta por mês para acompanhar o progresso aqui.</p>
      )}
      {error && <p className="mt-1 text-[12px] text-st-high-text">{error}</p>}
    </div>
  );
}
