"use client";
/** Sino de notificações: lista as pendências reais da central de ações. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import type { ActionItem } from "@/lib/action-center";

const DOT: Record<ActionItem["tone"], string> = { danger: "bg-st-high", warn: "bg-st-risk", brand: "bg-[#4ee39f]", neutral: "bg-white/30" };

export function NotificationBell({ items, className }: { items: ActionItem[]; className: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const urgent = items.filter((i) => i.tone !== "neutral").length;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" title="Notificações"
        aria-label={urgent ? `Notificações: ${urgent} pendência(s)` : "Notificações"} className={className}>
        <Bell className="size-[18px]" />
        {urgent > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#4ee39f] px-1 text-[10.5px] font-semibold text-[#06130d]">{urgent > 9 ? "9+" : urgent}</span>}
      </button>
      {open && (
        <div role="menu" className="fixed inset-x-4 top-16 z-50 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[360px] rounded-2xl border border-white/10 bg-[#0d1411]/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl animate-rise">
          <div className="border-b border-white/[0.07] px-4 py-3 text-[13px] font-medium text-white">Notificações</div>
          {items.length ? (
            <ul className="max-h-[60vh] divide-y divide-white/[0.06] overflow-y-auto">
              {items.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} onClick={() => setOpen(false)} role="menuitem" className="flex gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[i.tone]}`} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-white">{i.title}</span>
                      <span className="block text-[12px] text-white/45">{i.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-white/50"><CheckCircle2 className="size-4 text-[#4ee39f]" />Nenhuma pendência. Tudo em dia.</div>
          )}
        </div>
      )}
    </div>
  );
}
