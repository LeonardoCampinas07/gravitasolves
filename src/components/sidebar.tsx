"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, UserMinus, Sparkles, Megaphone, Workflow, LineChart, Plug, Settings, LogOut, Menu, X, CalendarDays, Cable, HelpCircle,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { cx } from "@/components/ui";
import { NotificationBell } from "@/components/notification-bell";
import type { ActionItem } from "@/lib/action-center";
import { logoutAction } from "@/app/(auth)/actions";

const NAV: { section: string; items: { href: string; label: string; icon: typeof Users; badgeKey?: "lapsed" | "pending" | "requests" }[] }[] = [
  { section: "", items: [
    { href: "/visao-geral", label: "Visão geral", icon: LayoutDashboard },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, badgeKey: "requests" },
  ] },
  { section: "Clientes", items: [
    { href: "/clientes", label: "Todos os clientes", icon: Users },
    { href: "/inativos", label: "Recuperação", icon: UserMinus, badgeKey: "lapsed" },
    { href: "/fontes", label: "Conexões", icon: Cable },
  ] },
  { section: "Reativação", items: [
    { href: "/agente", label: "Agente de IA", icon: Sparkles },
    { href: "/campanhas", label: "Campanhas", icon: Megaphone, badgeKey: "pending" },
    { href: "/automacoes", label: "Automações", icon: Workflow },
    { href: "/resultados", label: "Resultados", icon: LineChart },
  ] },
  { section: "Conta", items: [
    { href: "/integracoes", label: "Integrações", icon: Plug },
    { href: "/configuracoes", label: "Configurações", icon: Settings },
    { href: "/ajuda", label: "Central de ajuda", icon: HelpCircle },
  ] },
];

export function Sidebar({ orgName, userName, planName, badges, aiMode, notifications = [], sim }: {
  orgName: string; userName: string; planName: string; badges: { lapsed: number; pending: number; requests: number }; aiMode: "ai" | "basic"; notifications?: ActionItem[]; sim?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="thin-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-3">
      {NAV.map((group) => (
        <div key={group.section || "main"} className="flex flex-col gap-0.5">
          {group.section && <div className="px-3 pb-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/30">{group.section}</div>}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link key={item.href} href={item.href}
                className={cx("group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-all",
                  active
                    ? "bg-[#4ee39f] font-semibold text-[#06130d] shadow-[0_10px_28px_-12px_rgba(78,227,159,.8)]"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white")}>
                <Icon className={cx("size-[17px]", active ? "text-[#06130d]" : "text-white/40 group-hover:text-white/80")} strokeWidth={active ? 2 : 1.75} />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className={cx("num rounded-md px-1.5 text-[11px] font-medium",
                    active ? "bg-[#06130d]/15 text-[#06130d]" : item.badgeKey === "requests" ? "bg-[#4ee39f] text-[#06130d]" : "bg-white/10 text-white/75")}>
                    {badge > 999 ? "999+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 p-3">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
        <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-[#4ee39f]/20 blur-2xl" />
        <div className="relative flex items-center gap-2 text-[12px] text-white/80">
          <span className={cx("size-1.5 rounded-full", aiMode === "ai" ? "bg-[#4ee39f] shadow-[0_0_8px_#4ee39f]" : "bg-st-risk")} />
          {sim ? "Simulação · dados fictícios" : aiMode === "ai" ? "Agente com IA ativo" : "Agente em modo básico"}
        </div>
        <div className="relative mt-1 text-[11px] text-white/40">Plano {planName}</div>
      </div>
      <div className="flex items-center gap-2.5 px-1">
        <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#4ee39f] to-[#12a37a] text-xs font-semibold text-[#06130d]">{initials(userName)}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-white/85">{userName}</div>
          <div className="truncate text-[11px] text-white/40">{orgName}</div>
        </div>
        {sim ? (
          <a href="/simulacao/sair" title="Sair da simulação" aria-label="Sair da simulação" className="grid size-8 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"><LogOut className="size-4" /></a>
        ) : (
          <form action={logoutAction}>
            <button title="Sair" aria-label="Sair" className="grid size-8 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"><LogOut className="size-4" /></button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Barra superior no celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#060a08]/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/visao-geral"><Logo tone="light" size={24} /></Link>
        <div className="flex items-center gap-1">
          <NotificationBell items={notifications} className="relative grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/[0.06]" />
          <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/[0.06]" aria-label="Abrir menu"><Menu className="size-5" /></button>
        </div>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden animate-fade" onClick={() => setOpen(false)} />}
      <aside className={cx(
        "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-white/[0.06] bg-[#070c0a]/95 backdrop-blur-xl transition-transform lg:translate-x-0 lg:bg-black/25",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/visao-geral"><Logo tone="light" size={26} /></Link>
          <button onClick={() => setOpen(false)} className="text-white/50 lg:hidden" aria-label="Fechar menu"><X className="size-5" /></button>
        </div>
        <div className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#4ee39f]"><LogoMark size={15} tone="dark" /></span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-white/85">{orgName}</span>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
