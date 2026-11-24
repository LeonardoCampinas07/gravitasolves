import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Check, ArrowRight } from "lucide-react";
import { getDb, withOrg } from "@/db/client";
import { campaigns, customers, dataSources, integrations } from "@/db/schema";
import type { Ctx } from "@/lib/auth/session";
import { Card, ProgressBar, cx } from "@/components/ui";

/** "Comece por aqui": guia os próximos passos até a primeira recuperação. Some quando tudo estiver feito. */
export async function SetupChecklist({ ctx }: { ctx: Ctx }) {
  const db = await getDb();
  const [integ] = await db.select({ n: sql<number>`count(*)::int` }).from(integrations).where(eq(integrations.orgId, ctx.org.id));
  const { real, sources, approved } = await withOrg(ctx.org.id, async (tx) => ({
    real: Number((await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(eq(customers.orgId, ctx.org.id), eq(customers.isDemo, false))))[0].n),
    sources: Number((await tx.select({ n: sql<number>`count(*)::int` }).from(dataSources).where(and(eq(dataSources.orgId, ctx.org.id), eq(dataSources.status, "active"))))[0].n),
    approved: Number((await tx.select({ n: sql<number>`count(*)::int` }).from(campaigns).where(and(eq(campaigns.orgId, ctx.org.id), inArray(campaigns.status, ["approved", "sending", "completed"]))))[0].n),
  }));
  const steps = [
    { done: real > 0, title: "Conecte seus clientes reais", desc: "Agenda, WhatsApp, contatos ou planilha.", href: "/fontes" },
    { done: sources > 0 || ctx.settings.booking.enabled, title: "Ative uma fonte automática", desc: "Link de agendamento ou Google Agenda mantêm a base sempre atualizada.", href: "/fontes" },
    { done: Number(integ.n) > 0, title: "Conecte o WhatsApp oficial", desc: "Para enviar campanhas automaticamente (opcional).", href: "/integracoes" },
    { done: approved > 0, title: "Aprove sua primeira campanha", desc: "O agente prepara; você revisa e libera.", href: "/campanhas" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  // Uma linha só: o próximo passo em destaque; a lista completa fica recolhida em "ver todos".
  const next = steps.find((s) => !s.done)!;
  return (
    <Card className="mb-4 overflow-hidden animate-rise">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-950 text-[12px] font-semibold text-citrus">{steps.indexOf(next) + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">Próximo passo · {done} de {steps.length}</div>
          <div className="truncate text-[14px] font-semibold">{next.title} <span className="font-normal text-ink-500">— {next.desc}</span></div>
        </div>
        <div className="hidden w-28 sm:block"><ProgressBar value={done / steps.length} /></div>
        <Link href={next.href} className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium">Fazer agora<ArrowRight className="size-4" /></Link>
      </div>
      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none px-5 py-2 text-[12.5px] text-ink-500 hover:text-ink-950">
          <span className="group-open:hidden">Ver todos os passos</span><span className="hidden group-open:inline">Esconder passos</span>
        </summary>
        <ol className="grid divide-y divide-line border-t border-line sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Link href={s.href} className={cx("group flex h-full gap-3 p-4 transition-colors hover:bg-paper/70", s.done && "opacity-60")}>
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", s.done ? "bg-brand-500 text-white" : "bg-ink-950 text-citrus")}>
                  {s.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="text-[13.5px] font-medium">{s.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{s.desc}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
