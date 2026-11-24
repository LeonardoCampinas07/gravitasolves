"use client";
import { useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { removeDemoAction } from "@/app/actions";

export function DemoBanner({ count, canRemove }: { count: number; canRemove: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-st-recovered/20 bg-st-recovered/[0.07] px-4 py-2 text-center text-[13px] text-st-recovered">
      <FlaskConical className="size-4" />
      <span><strong>{count.toLocaleString("pt-BR")} clientes de demonstração</strong> (fictícios) — não recebem mensagens reais.</span>
      {canRemove && (
        <button disabled={pending} onClick={() => { if (confirm("Remover todos os clientes de demonstração?")) start(async () => { await removeDemoAction(); }); }}
          className="font-medium underline underline-offset-4 disabled:opacity-50">
          {pending ? "Removendo…" : "Remover dados de demonstração"}
        </button>
      )}
    </div>
  );
}
