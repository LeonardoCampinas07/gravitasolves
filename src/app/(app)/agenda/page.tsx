import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { CalendarCheck, Link2 } from "lucide-react";
import { withOrg } from "@/db/client";
import { appointments, customers } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { SERVICES } from "@/lib/demo";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { QuickCheckIn, AppointmentRow, type ApptView } from "./agenda-client";

export const metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const ctx = await requireCtx("customers:read");
  const startOfToday = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00-03:00`);
  const data = await withOrg(ctx.org.id, async (tx) => {
    const base = tx.select({ a: appointments, name: customers.name, phone: customers.phone }).from(appointments).leftJoin(customers, eq(customers.id, appointments.customerId));
    return {
      requested: await base.where(and(eq(appointments.orgId, ctx.org.id), eq(appointments.status, "requested"))).orderBy(asc(appointments.scheduledFor)).limit(100),
      upcoming: await tx.select({ a: appointments, name: customers.name, phone: customers.phone }).from(appointments).leftJoin(customers, eq(customers.id, appointments.customerId))
        .where(and(eq(appointments.orgId, ctx.org.id), eq(appointments.status, "confirmed"), gte(appointments.scheduledFor, startOfToday))).orderBy(asc(appointments.scheduledFor)).limit(100),
      overdue: await tx.select({ a: appointments, name: customers.name, phone: customers.phone }).from(appointments).leftJoin(customers, eq(customers.id, appointments.customerId))
        .where(and(eq(appointments.orgId, ctx.org.id), eq(appointments.status, "confirmed"), lt(appointments.scheduledFor, startOfToday), inArray(appointments.source, ["booking_page", "manual"]))).orderBy(desc(appointments.scheduledFor)).limit(50),
      recent: await tx.select({ a: appointments, name: customers.name, phone: customers.phone }).from(appointments).leftJoin(customers, eq(customers.id, appointments.customerId))
        .where(and(eq(appointments.orgId, ctx.org.id), inArray(appointments.status, ["done", "no_show"]))).orderBy(desc(appointments.scheduledFor)).limit(15),
    };
  });
  const view = (rows: typeof data.requested): ApptView[] => rows.map(({ a, name, phone }) => ({
    id: a.id, when: a.scheduledFor.toISOString(), name: name ?? a.contactName ?? "Cliente", phone: phone ?? a.contactPhone, service: a.service, staff: a.staff,
    status: a.status, source: a.source, amountCents: a.amountCents, customerId: a.customerId, notes: a.notes,
  }));
  const canWrite = can(ctx.role, "customers:write");
  const b = ctx.settings.booking;
  const services = b.services.length ? b.services : (SERVICES[ctx.org.segment] ?? SERVICES.generic).services;

  return (
    <>
      <PageHeader guide="agenda" title="Agenda" description="Pedidos de horário do seu link, próximos atendimentos e registro rápido no balcão. Cada atendimento concluído atualiza o cliente na hora."
        actions={b.enabled && ctx.org.slug ? <Link href={`/agendar/${ctx.org.slug}`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper"><Link2 className="size-4" />Meu link de agendamento</Link>
          : <Link href="/fontes" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-paper"><Link2 className="size-4" />Ativar link de agendamento</Link>} />
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        {canWrite && <Card className="self-start"><CardHeader title="Registro rápido" description="Atendeu alguém agora? Leva 5 segundos." /><div className="p-5"><QuickCheckIn services={services} staff={b.staff} /></div></Card>}
        <div className="space-y-4">
          <Section title="Pedidos de horário" description="Chegaram pelo seu link. Confirme com o cliente pelo WhatsApp." rows={view(data.requested)} canWrite={canWrite} highlight />
          {data.overdue.length > 0 && <Section title="Aguardando registro" description="Horários que já passaram: marque se o cliente veio ou faltou." rows={view(data.overdue)} canWrite={canWrite} />}
          <Section title="Próximos atendimentos" rows={view(data.upcoming)} canWrite={canWrite} />
          <Section title="Atendimentos recentes" rows={view(data.recent)} canWrite={false} />
        </div>
      </div>
    </>
  );
}

function Section({ title, description, rows, canWrite, highlight }: { title: string; description?: string; rows: ApptView[]; canWrite: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight && rows.length ? "border-brand-200" : undefined}>
      <CardHeader title={`${title}${rows.length ? ` (${rows.length})` : ""}`} description={description} />
      {rows.length ? <ul className="divide-y divide-line">{rows.map((r) => <AppointmentRow key={r.id} a={r} canWrite={canWrite} />)}</ul>
        : <EmptyState icon={<CalendarCheck className="size-5" />} title="Nada por aqui" />}
    </Card>
  );
}
