/**
 * Motor de ingestão: transforma agendamentos e contatos de qualquer fonte em clientes, visitas e
 * atividade — sem planilha. Deduplica por telefone → e-mail → nome (quando não há contato).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { appointments, customers, visits, type Organization } from "@/db/schema";
import { getPlan } from "@/lib/plans";
import { resolveSettings } from "@/lib/settings";
import { attributeReturn, reclassifyOrg, recordVisit, setConsent } from "@/lib/customers";
import { audit } from "@/lib/audit";
import { dayOf, today } from "@/lib/dates";

export interface PersonInput { name: string | null; phone: string | null; email?: string | null }

export class SourceLimitError extends Error {}

/** Encontra ou cria o cliente. Retorna null se o limite do plano impedir a criação. */
export async function upsertPerson(tx: Tx, org: Organization, p: PersonInput, source: string, ctx: { capacity: { left: number } }) {
  const conds = [
    p.phone ? eq(customers.phone, p.phone) : null,
    p.email ? eq(customers.email, p.email) : null,
  ].filter(Boolean);
  for (const c of conds) {
    const [found] = await tx.select().from(customers).where(and(eq(customers.orgId, org.id), c!)).limit(1);
    if (found) {
      // Completa dados que faltavam.
      const patch: Partial<typeof customers.$inferInsert> = {};
      if (!found.phone && p.phone) patch.phone = p.phone;
      if (!found.email && p.email) patch.email = p.email;
      if ((found.name.startsWith("Cliente ") || found.name.startsWith("Contato ")) && p.name && !/^(Cliente|Contato) /.test(p.name)) patch.name = p.name;
      if (Object.keys(patch).length) await tx.update(customers).set({ ...patch, updatedAt: new Date() }).where(eq(customers.id, found.id));
      return found.id;
    }
  }
  if (!p.phone && !p.email && p.name) {
    // Sem telefone/e-mail: reaproveita somente se houver exatamente um cliente com o mesmo nome.
    const same = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.orgId, org.id), sql`lower(${customers.name}) = ${p.name.toLowerCase()}`)).limit(2);
    if (same.length === 1) return same[0].id;
  }
  if (!p.name) return null;
  if (ctx.capacity.left <= 0) return null;
  const [c] = await tx.insert(customers).values({ orgId: org.id, name: p.name.slice(0, 120), phone: p.phone, email: p.email ?? null, source }).returning({ id: customers.id });
  ctx.capacity.left--;
  return c.id;
}

export async function capacityFor(tx: Tx, org: Organization) {
  const plan = await getPlan(tx, org.planId);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, org.id));
  return { left: plan.limits.maxCustomers - Number(n), max: plan.limits.maxCustomers };
}

export interface AppointmentInput {
  externalId: string;
  start: Date;
  person: PersonInput;
  service?: string | null;
  staff?: string | null;
  cancelled?: boolean;
}

export interface IngestResult { events: number; created: number; matched: number; visits: number; upcoming: number; skipped: number; limitReached: boolean; returns: number }

/**
 * Agendamentos vindos de agenda externa. Eventos passados (não cancelados) contam como visita;
 * futuros ficam como agendamento confirmado. Reimportar o mesmo evento não duplica.
 */
export async function ingestAppointments(tx: Tx, org: Organization, source: "google_calendar" | "ics", items: AppointmentInput[], actorId: string | null): Promise<IngestResult> {
  const res: IngestResult = { events: items.length, created: 0, matched: 0, visits: 0, upcoming: 0, skipped: 0, limitReached: false, returns: 0 };
  const cap = await capacityFor(tx, org);
  const now = new Date();
  const existing = new Set((await tx.select({ e: appointments.externalId }).from(appointments)
    .where(and(eq(appointments.orgId, org.id), eq(appointments.source, source)))).map((r) => r.e));
  const newVisits = new Map<string, { dates: string[]; services: string[]; staff: string[] }>();
  const before = cap.left;

  for (const it of items) {
    if (it.cancelled || existing.has(it.externalId)) { res.skipped++; continue; }
    const customerId = await upsertPerson(tx, org, it.person, source, { capacity: cap });
    if (!customerId) { res.skipped++; if (cap.left <= 0) res.limitReached = true; continue; }
    const past = it.start <= now;
    await tx.insert(appointments).values({
      orgId: org.id, customerId, scheduledFor: it.start, service: it.service ?? null, staff: it.staff ?? null,
      status: past ? "done" : "confirmed", source, externalId: it.externalId,
    }).onConflictDoNothing();
    existing.add(it.externalId);
    if (past) {
      const v = newVisits.get(customerId) ?? { dates: [], services: [], staff: [] };
      v.dates.push(dayOf(it.start));
      if (it.service) v.services.push(it.service);
      if (it.staff) v.staff.push(it.staff);
      newVisits.set(customerId, v);
      res.visits++;
    } else res.upcoming++;
  }
  res.created = before - cap.left;
  res.matched = newVisits.size;

  const s = resolveSettings(org);
  for (const [customerId, v] of newVisits) {
    await addVisits(tx, org, customerId, v.dates, source);
    const [c] = await tx.select().from(customers).where(eq(customers.id, customerId));
    const fav = mostCommon(v.services), staff = mostCommon(v.staff);
    if ((fav && !c.favoriteService) || (staff && !c.preferredStaff))
      await tx.update(customers).set({ favoriteService: c.favoriteService ?? fav, preferredStaff: c.preferredStaff ?? staff }).where(eq(customers.id, customerId));
    const latest = v.dates.sort().at(-1)!;
    if (await attributeReturn(tx, org.id, s, { customerId, visitDate: latest, revenueCents: 0, visitId: null })) res.returns++;
  }
  await reclassifyOrg(tx, org);
  await audit(tx, { orgId: org.id, actorType: actorId ? "user" : "system", actorId, action: `source.${source}`, summary: `${res.visits} visitas, ${res.upcoming} agendamentos futuros, ${res.created} clientes novos` });
  return res;
}

/** Soma visitas sem valor conhecido às métricas do cliente. */
async function addVisits(tx: Tx, org: Organization, customerId: string, dates: string[], source: string) {
  if (!dates.length) return;
  await tx.insert(visits).values(dates.map((d) => ({ orgId: org.id, customerId, occurredAt: d, amountCents: 0, source })));
  const sorted = [...dates].sort();
  const [c] = await tx.select().from(customers).where(eq(customers.id, customerId));
  await tx.update(customers).set({
    visitCount: c.visitCount + dates.length,
    lastVisitAt: !c.lastVisitAt || sorted.at(-1)! > c.lastVisitAt ? sorted.at(-1)! : c.lastVisitAt,
    firstVisitAt: !c.firstVisitAt || sorted[0] < c.firstVisitAt ? sorted[0] : c.firstVisitAt,
    avgTicketCents: c.totalSpentCents > 0 ? Math.round(c.totalSpentCents / (c.visitCount + dates.length)) : c.avgTicketCents,
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId));
}

function mostCommon(a: string[]) {
  const m = new Map<string, number>();
  a.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

export interface ContactInput { person: PersonInput; lastContactAt: Date | null; messageCount: number }

/** Contatos (WhatsApp exportado, contatos do celular). Atualiza a data do último contato. */
export async function ingestContacts(tx: Tx, org: Organization, source: "whatsapp_export" | "vcf", items: ContactInput[], actorId: string | null) {
  const cap = await capacityFor(tx, org);
  const before = cap.left;
  let matched = 0, skipped = 0;
  for (const it of items) {
    const id = await upsertPerson(tx, org, it.person, source, { capacity: cap });
    if (!id) { skipped++; continue; }
    matched++;
    if (it.lastContactAt) {
      await tx.execute(sql`update customers set
        last_contact_at = greatest(last_contact_at, ${it.lastContactAt.toISOString()}::timestamptz),
        contact_count = greatest(contact_count, ${it.messageCount}), updated_at = now()
        where id = ${id} and org_id = ${org.id}`);
    }
  }
  await reclassifyOrg(tx, org);
  const created = before - cap.left;
  await audit(tx, { orgId: org.id, actorType: "user", actorId, action: `source.${source}`, summary: `${matched} contatos processados, ${created} clientes novos` });
  return { total: items.length, matched, created, skipped, limitReached: cap.left <= 0 && skipped > 0 };
}

/** Mensagem recebida no WhatsApp oficial: registra o contato (e cria o cliente, se a captura estiver ligada). */
export async function touchContact(tx: Tx, org: Organization, phone: string, profileName: string | null, create: boolean) {
  const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, org.id), eq(customers.phone, phone))).limit(1);
  let id: string | null = c?.id ?? null;
  if (!id && create) {
    const cap = await capacityFor(tx, org);
    id = await upsertPerson(tx, org, { name: profileName?.trim() || `Contato ${phone.slice(-4)}`, phone }, "whatsapp", { capacity: cap });
  }
  if (id) await tx.update(customers).set({ lastContactAt: new Date(), contactCount: sql`${customers.contactCount} + 1`, updatedAt: new Date() }).where(eq(customers.id, id));
  return id;
}

// ───────────────────────── Agenda própria / atendimento rápido ─────────────────────────

/** Atendimento registrado no balcão (3 campos): cria/atualiza o cliente e registra a visita. */
export async function quickCheckIn(tx: Tx, org: Organization, input: { name: string; phone: string | null; service: string | null; staff: string | null; amountCents: number; date: string; consentWhatsapp: boolean }, actorId: string) {
  const cap = await capacityFor(tx, org);
  const customerId = await upsertPerson(tx, org, { name: input.name, phone: input.phone }, "quick", { capacity: cap });
  if (!customerId) throw new SourceLimitError("Limite de clientes do plano atingido.");
  if (input.consentWhatsapp && input.phone)
    await setConsent(tx, org.id, customerId, "whatsapp", true, { source: "Autorização informada no atendimento", actor: `user:${actorId}` });
  if (input.service || input.staff) {
    const [c] = await tx.select().from(customers).where(eq(customers.id, customerId));
    await tx.update(customers).set({ favoriteService: c.favoriteService ?? input.service, preferredStaff: c.preferredStaff ?? input.staff }).where(eq(customers.id, customerId));
  }
  const r = await recordVisit(tx, org, customerId, { date: input.date, amountCents: input.amountCents, description: input.service, source: "quick" });
  await tx.insert(appointments).values({
    orgId: org.id, customerId, scheduledFor: new Date(`${input.date}T12:00:00-03:00`), service: input.service, staff: input.staff,
    status: "done", amountCents: input.amountCents, source: "quick", visitId: r.visit.id,
  });
  return { customerId, recovered: !!r.recovery };
}

/** Marca um agendamento como atendido: vira visita (com valor) e pode gerar recuperação. */
export async function completeAppointment(tx: Tx, org: Organization, appointmentId: string, amountCents: number) {
  const [a] = await tx.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.orgId, org.id)));
  if (!a) throw new Error("Agendamento não encontrado");
  if (a.status === "done") throw new Error("Este atendimento já foi registrado.");
  let customerId = a.customerId;
  if (!customerId) {
    const cap = await capacityFor(tx, org);
    customerId = await upsertPerson(tx, org, { name: a.contactName, phone: a.contactPhone }, "booking", { capacity: cap });
    if (!customerId) throw new SourceLimitError("Limite de clientes do plano atingido.");
  }
  const date = dayOf(a.scheduledFor) > today() ? today() : dayOf(a.scheduledFor);
  const r = await recordVisit(tx, org, customerId, { date, amountCents, description: a.service, source: a.source });
  await tx.update(appointments).set({ status: "done", amountCents, visitId: r.visit.id, customerId }).where(eq(appointments.id, a.id));
  return { recovered: !!r.recovery };
}

export async function setAppointmentStatus(tx: Tx, orgId: string, ids: string[], status: "confirmed" | "no_show" | "cancelled") {
  await tx.update(appointments).set({ status }).where(and(eq(appointments.orgId, orgId), inArray(appointments.id, ids)));
}
