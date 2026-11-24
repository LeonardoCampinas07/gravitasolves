import Link from "next/link";
import { Bot, Plus, Search } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import type { ActionItem } from "@/lib/action-center";

/** Barra superior do painel (desktop): busca de clientes, atalhos e avatar. */
export function Topbar({ userName, notifications }: { userName: string; notifications: ActionItem[] }) {
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const icon = "relative grid size-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white";
  return (
    <div className="relative z-20 hidden px-8 pt-5 lg:block">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3">
        <form action="/clientes" role="search" className="group flex h-11 flex-1 items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 backdrop-blur-xl transition focus-within:border-[#4ee39f]/50 focus-within:bg-white/[0.06] max-w-[460px]">
          <Search className="size-4 text-white/40 group-focus-within:text-[#4ee39f]" />
          <input name="q" placeholder="Buscar cliente por nome, telefone ou e-mail" aria-label="Buscar clientes"
            className="h-full flex-1 bg-transparent text-[13.5px] text-white placeholder:text-white/35 focus:outline-none" />
          <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/35 xl:block">Enter</kbd>
        </form>
        <div className="ml-auto flex items-center gap-2.5">
          <Link href="/campanhas?nova=1" title="Nova campanha" aria-label="Nova campanha"
            className="grid size-10 place-items-center rounded-full bg-[#4ee39f] text-[#06130d] shadow-[0_10px_28px_-10px_rgba(78,227,159,.9)] transition hover:scale-105 hover:bg-[#7af0b9]">
            <Plus className="size-5" strokeWidth={2.4} />
          </Link>
          <Link href="/agente" title="Agente de IA" aria-label="Agente de IA" className={icon}><Bot className="size-[18px]" /></Link>
          <NotificationBell items={notifications} className={icon} />
          <Link href="/configuracoes" title={userName} aria-label="Minha conta"
            className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-[#4ee39f] to-[#0e8463] text-[13px] font-semibold text-[#06130d] ring-2 ring-white/10">
            {initials}
          </Link>
        </div>
      </div>
    </div>
  );
}
