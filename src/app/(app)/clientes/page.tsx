import Link from "next/link";
import { asc, desc, sql } from "drizzle-orm";
import { Upload, Search, Users, Cable, SlidersHorizontal } from "lucide-react";
import { withOrg } from "@/db/client";
import { customers, type CustomerStatus } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { customerWhere } from "@/lib/customers";
import { STATUS_LABEL, lastActivity } from "@/lib/classification";
import { getSegment } from "@/lib/segments";
import { daysBetween, today } from "@/lib/dates";
import { dateBR, money, num } from "@/lib/format";
import { ButtonLink, Card, EmptyState, Input, PageHeader, cx } from "@/components/ui";
import { NewCustomerButton } from "./new-customer";
import { CustomerTable, type CustomerRow } from "./customer-table";

export const metadata = { title: "Clientes" };
const PAGE = 50;
const ALL: CustomerStatus[] = ["active", "at_risk", "inactive", "highly_inactive", "recovered", "unknown"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; dias?: string; visitas?: string; gasto?: string; tag?: string; contato?: string }> }) {
  const ctx = await requireCtx("customers:read");
  const sp = await searchParams;
  const status = ALL.includes(sp.status as CustomerStatus) ? (sp.status as CustomerStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = sp.sort === "name" ? [asc(customers.name)] : sp.sort === "recent" ? [desc(customers.lastVisitAt)] : sp.sort === "value" ? [desc(customers.totalSpentCents)] : sp.sort === "priority" ? [desc(customers.priorityScore)] : sp.sort === "freq" ? [desc(customers.visitCount)] : [asc(customers.lastVisitAt)];
  const seg = getSegment(ctx.org.segment);
  const t = today();

  const pos = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  const f = { dias: pos(sp.dias), visitas: pos(sp.visitas), gasto: pos(sp.gasto), tag: sp.tag?.slice(0, 30) || undefined, contato: sp.contato === "1" };
  const activeFilters = [f.dias, f.visitas, f.gasto, f.tag, f.contato || undefined].filter(Boolean).length;
  const { rows, total, counts, tags } = await withOrg(ctx.org.id, async (tx) => {
    const where = customerWhere(ctx.org.id, { statuses: status ? [status] : undefined, search: sp.q, minDaysInactive: f.dias, minVisits: f.visitas, minSpentCents: f.gasto ? f.gasto * 100 : undefined, tag: f.tag, contactable: f.contato });
    const tagRows = await tx.selectDistinct({ t: sql<string>`unnest(${customers.tags})` }).from(customers).where(sql`${customers.orgId} = ${ctx.org.id}`).limit(50);
    const tags = tagRows.map((r) => String(r.t)).sort();
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(where);
    const rows = await tx.select().from(customers).where(where).orderBy(...sort, asc(customers.id)).limit(PAGE).offset((page - 1) * PAGE);
    const counts = await tx.select({ status: customers.status, n: sql<number>`count(*)::int` }).from(customers).where(customerWhere(ctx.org.id, {})).groupBy(customers.status);
    return { tags, rows, total: Number(n), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number> };
  });
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const qs = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { status, q: sp.q, sort: sp.sort, dias: sp.dias, visitas: sp.visitas, gasto: sp.gasto, tag: sp.tag, contato: sp.contato, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/clientes?${u}`;
  };

  return (
    <>
      <PageHeader guide="clientes" title="Clientes" description={`${num(all)} clientes cadastrados. A classificação é atualizada automaticamente todos os dias.`}
        actions={<><NewCustomerButton /><ButtonLink href="/clientes/importar" variant="secondary"><Upload className="size-4" />Planilha</ButtonLink><ButtonLink href="/fontes"><Cable className="size-4" />Conectar fontes</ButtonLink></>} />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Link href={qs({ status: undefined, page: undefined })} className={cx("rounded-lg px-3 py-1.5 text-[13px]", !status ? "bg-ink-950 text-white" : "bg-surface text-ink-600 ring-1 ring-line hover:text-ink-950")}>Todos <span className="num opacity-60">{num(all)}</span></Link>
        {ALL.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={qs({ status: s, page: undefined })} className={cx("rounded-lg px-3 py-1.5 text-[13px]", status === s ? "bg-ink-950 text-white" : "bg-surface text-ink-600 ring-1 ring-line hover:text-ink-950")}>
            {STATUS_LABEL[s]} <span className="num opacity-60">{num(counts[s])}</span>
          </Link>
        ))}
      </div>

      <Card>
        <form className="border-b border-line p-3" action="/clientes">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <Input name="q" defaultValue={sp.q} placeholder="Buscar por nome, telefone ou e-mail" className="pl-9" />
            </div>
            <select name="sort" defaultValue={sp.sort ?? ""} aria-label="Ordenar" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm">
              <option value="">Mais tempo sem visita</option><option value="priority">Maior potencial</option><option value="recent">Visita mais recente</option>
              <option value="value">Maior gasto total</option><option value="freq">Mais frequentes</option><option value="name">Nome (A–Z)</option>
            </select>
            <button className="h-9 rounded-lg bg-ink-950 px-4 text-sm font-medium text-white">Buscar</button>
          </div>
          <details className="group mt-2" open={activeFilters > 0}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 text-[12.5px] text-ink-500 hover:text-ink-950">
              <SlidersHorizontal className="size-3.5" />Mais filtros{activeFilters > 0 && <span className="num rounded bg-brand-500 px-1.5 text-[11px] font-medium text-white">{activeFilters}</span>}
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-[12px] text-ink-500">Sem vir há pelo menos<div className="mt-1 flex items-center gap-1.5"><Input name="dias" type="number" min={1} defaultValue={sp.dias} placeholder="ex.: 45" /><span>dias</span></div></label>
              <label className="text-[12px] text-ink-500">Mínimo de {seg.vocab.visits}<Input name="visitas" type="number" min={1} defaultValue={sp.visitas} placeholder="ex.: 3" className="mt-1" /></label>
              <label className="text-[12px] text-ink-500">Gastou no total pelo menos<div className="mt-1 flex items-center gap-1.5"><span>R$</span><Input name="gasto" type="number" min={1} defaultValue={sp.gasto} placeholder="ex.: 300" /></div></label>
              <label className="text-[12px] text-ink-500">Etiqueta
                <select name="tag" defaultValue={sp.tag ?? ""} className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-950">
                  <option value="">Todas</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-[13px] text-ink-700"><input type="checkbox" name="contato" value="1" defaultChecked={f.contato} className="size-4 accent-[#4ee39f]" />Só quem posso contatar</label>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button className="h-8 rounded-lg bg-ink-950 px-3 text-[12.5px] font-medium text-white">Aplicar filtros</button>
              {activeFilters > 0 && <Link href={qs({ dias: undefined, visitas: undefined, gasto: undefined, tag: undefined, contato: undefined, page: undefined })} className="text-[12.5px] text-ink-500 underline hover:text-ink-950">Limpar filtros</Link>}
            </div>
          </details>
        </form>
        {rows.length ? (
          <CustomerTable visitsLabel={cap(seg.vocab.visits)} canWrite={can(ctx.role, "customers:write")} canCampaign={can(ctx.role, "campaigns:write")} canExport={can(ctx.role, "data:export")}
            rows={rows.map((c): CustomerRow => {
              const act = lastActivity(c, ctx.settings);
              return {
                id: c.id, name: c.name, phone: c.phone, email: c.email, status: c.status, isDemo: c.isDemo, sourceLabel: SOURCE_LABEL[c.source] ?? null,
                subtitle: [c.favoriteService, c.preferredStaff].filter(Boolean).join(" · "), activity: dateBR(act), activityDays: act ? daysBetween(act, t) : null,
                viaContact: !!act && act !== c.lastVisitAt, visits: c.visitCount, avgTicket: money(c.avgTicketCents), total: money(c.totalSpentCents), score: c.priorityScore,
                optedOut: !!c.optedOutAt, tags: c.tags ?? [],
                channels: [c.consentWhatsapp && c.phone && "WhatsApp", c.consentEmail && c.email && "E-mail", c.consentSms && c.phone && "SMS"].filter(Boolean) as string[],
              };
            })} />
        ) : (
          <EmptyState icon={all ? <Users className="size-5" /> : <Cable className="size-5" />} title={all ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            description={all ? "Ajuste a busca ou os filtros." : "Conecte sua agenda, WhatsApp, link de agendamento ou contatos — sem planilha."}
            action={!all && <ButtonLink href="/fontes">Conectar meus clientes</ButtonLink>} />
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between px-4 py-3 text-[13px] text-ink-500">
            <span>{num((page - 1) * PAGE + 1)}–{num(Math.min(page * PAGE, total))} de {num(total)}</span>
            <div className="flex gap-2">
              {page > 1 && <ButtonLink variant="secondary" href={qs({ page: String(page - 1) })}>Anterior</ButtonLink>}
              {page * PAGE < total && <ButtonLink variant="secondary" href={qs({ page: String(page + 1) })}>Próxima</ButtonLink>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SOURCE_LABEL: Record<string, string> = {
  csv: "planilha", xlsx: "planilha", api: "API", quick: "balcão", booking: "link", whatsapp: "WhatsApp", whatsapp_export: "WhatsApp",
  vcf: "contatos", ics: "agenda", google_calendar: "Google Agenda", manual: "manual",
};
