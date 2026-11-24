/** Validação + gravação de linhas importadas (planilha ou API). */
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { consentEvents, customers, imports, organizations, visits, type Organization } from "@/db/schema";
import { getPlan } from "@/lib/plans";
import { assertBillingActive } from "@/lib/billing/service";
import { resolveSettings } from "@/lib/settings";
import { attributeReturn, reclassifyOrg } from "@/lib/customers";
import { audit } from "@/lib/audit";
import { today } from "@/lib/dates";
import type { Mapping } from "./mapping";
import {
  cleanText, normalizeEmail, normalizeName, normalizePhone, parseBool, parseCount, parseDate, parseMoneyCents,
} from "./normalize";

export interface CleanRow {
  name: string;
  phone: string | null;
  email: string | null;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  visitCount: number | null;
  totalSpentCents: number | null;
  avgTicketCents: number | null;
  lastVisitAmountCents: number | null;
  favoriteService: string | null;
  preferredStaff: string | null;
  notes: string | null;
  consentWhatsapp: boolean | null;
  consentEmail: boolean | null;
  consentSms: boolean | null;
  externalId: string | null;
}

export interface RowError { row: number; message: string }

/** Converte uma linha bruta usando o mapeamento. Linha = número da planilha (cabeçalho = 1). */
export function cleanRow(raw: Record<string, unknown>, m: Mapping, rowNumber: number, ref = today()):
  { ok: true; value: CleanRow; warnings: string[] } | { ok: false; error: RowError } {
  const get = (k: keyof Mapping) => (m[k] ? raw[m[k] as string] : undefined);
  const warnings: string[] = [];
  const name = normalizeName(get("name"));
  if (!name) return { ok: false, error: { row: rowNumber, message: "Nome em branco" } };

  const rawPhone = get("phone");
  const phone = normalizePhone(rawPhone);
  if (rawPhone && String(rawPhone).trim() && !phone) warnings.push(`telefone inválido (${String(rawPhone).slice(0, 20)})`);
  const rawEmail = get("email");
  const email = normalizeEmail(rawEmail);
  if (rawEmail && String(rawEmail).trim() && !email) warnings.push("e-mail inválido");

  const rawLast = get("lastVisit");
  const lastVisitAt = parseDate(rawLast, ref);
  if (rawLast && !lastVisitAt) warnings.push(`data da última visita inválida ou futura (${String(rawLast).slice(0, 20)})`);
  let firstVisitAt = parseDate(get("firstVisit"), ref);
  if (firstVisitAt && lastVisitAt && firstVisitAt > lastVisitAt) firstVisitAt = null;

  const visitCount = parseCount(get("visitCount"));
  let totalSpentCents = parseMoneyCents(get("totalSpent"));
  let avgTicketCents = parseMoneyCents(get("avgTicket"));
  if (avgTicketCents === null && totalSpentCents !== null && visitCount) avgTicketCents = Math.round(totalSpentCents / visitCount);
  if (totalSpentCents === null && avgTicketCents !== null && visitCount) totalSpentCents = avgTicketCents * visitCount;

  return {
    ok: true,
    warnings,
    value: {
      name, phone, email, lastVisitAt, firstVisitAt, visitCount, totalSpentCents, avgTicketCents,
      lastVisitAmountCents: parseMoneyCents(get("lastVisitAmount")),
      favoriteService: cleanText(get("favoriteService"), 120),
      preferredStaff: cleanText(get("preferredStaff"), 80),
      notes: cleanText(get("notes"), 1000),
      consentWhatsapp: parseBool(get("consentWhatsapp")),
      consentEmail: parseBool(get("consentEmail")),
      consentSms: parseBool(get("consentSms")),
      externalId: cleanText(get("externalId"), 80),
    },
  };
}

export interface ImportOptions {
  filename: string;
  source: "csv" | "xlsx" | "api" | "demo";
  userId: string | null;
  mapping: Mapping;
  /** Declaração do estabelecimento de que possui autorização dos clientes para os canais marcados. */
  declaredConsent?: { whatsapp?: boolean; email?: boolean; sms?: boolean };
  /** Declaração de legítimo interesse (relação comercial prévia), usada apenas para e-mail quando habilitado. */
  declaredLegitimateInterest?: boolean;
  isDemo?: boolean;
}

export interface ImportResult { importId: string; totalRows: number; created: number; updated: number; skipped: number; errors: RowError[]; returnsDetected: number }

export async function importRows(tx: Tx, org: Organization, rawRows: Record<string, unknown>[], opts: ImportOptions): Promise<ImportResult> {
  if (!opts.isDemo) await assertBillingActive(tx, org.id);
  const settings = resolveSettings(org);
  const plan = await getPlan(tx, org.planId);
  const [{ count: existingCount }] = await tx.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, org.id));
  let capacity = plan.limits.maxCustomers - Number(existingCount);

  const errors: RowError[] = [];
  let created = 0, updated = 0, skipped = 0, returnsDetected = 0;
  const seen = new Set<string>();
  const ref = today();
  const consentSource = opts.declaredConsent ? `Declaração do estabelecimento na importação "${opts.filename}" em ${ref}` : `Planilha "${opts.filename}"`;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const res = cleanRow(rawRows[i], opts.mapping, rowNumber, ref);
    if (!res.ok) { errors.push(res.error); skipped++; continue; }
    const r = res.value;
    for (const w of res.warnings) errors.push({ row: rowNumber, message: `Aviso: ${w}` });
    const key = r.phone ?? r.email ?? (r.externalId ? `ext:${r.externalId}` : `name:${r.name.toLowerCase()}`);
    if (seen.has(key)) { errors.push({ row: rowNumber, message: "Duplicado dentro do arquivo (mesmo telefone/e-mail) — ignorado" }); skipped++; continue; }
    seen.add(key);

    const existing = await findExisting(tx, org.id, r);
    const wa = r.consentWhatsapp ?? (opts.declaredConsent?.whatsapp ? true : null);
    const em = r.consentEmail ?? (opts.declaredConsent?.email ? true : null);
    const sm = r.consentSms ?? (opts.declaredConsent?.sms ? true : null);
    const anyConsent = wa || em || sm;

    if (!existing) {
      if (capacity <= 0) { errors.push({ row: rowNumber, message: `Limite de ${plan.limits.maxCustomers} clientes do plano ${plan.name} atingido` }); skipped++; continue; }
      const [c] = await tx.insert(customers).values({
        orgId: org.id, name: r.name, phone: r.phone, email: r.email, externalId: r.externalId,
        lastVisitAt: r.lastVisitAt, firstVisitAt: r.firstVisitAt ?? (r.visitCount === 1 ? r.lastVisitAt : null),
        visitCount: r.visitCount ?? (r.lastVisitAt ? 1 : 0),
        totalSpentCents: r.totalSpentCents ?? 0, avgTicketCents: r.avgTicketCents ?? 0,
        favoriteService: r.favoriteService, preferredStaff: r.preferredStaff, notes: r.notes,
        consentWhatsapp: !!wa, consentEmail: !!em, consentSms: !!sm,
        legalBasis: anyConsent ? "consent" : opts.declaredLegitimateInterest ? "legitimate_interest" : "none",
        consentSource: anyConsent ? consentSource : null, consentAt: anyConsent ? new Date() : null,
        isDemo: !!opts.isDemo, source: opts.source,
      }).returning({ id: customers.id });
      capacity--; created++;
      await logConsent(tx, org.id, c.id, { whatsapp: wa, email: em, sms: sm }, consentSource, opts.userId);
      continue;
    }

    // Atualização: valores informados substituem; a data de última visita só avança.
    const advanced = !!(r.lastVisitAt && (!existing.lastVisitAt || r.lastVisitAt > existing.lastVisitAt));
    const visitCount = r.visitCount ?? (advanced ? existing.visitCount + 1 : existing.visitCount);
    let totalSpent = r.totalSpentCents ?? existing.totalSpentCents;
    if (r.totalSpentCents === null && advanced && r.lastVisitAmountCents) totalSpent = existing.totalSpentCents + r.lastVisitAmountCents;
    const avg = r.avgTicketCents ?? (visitCount ? Math.round(totalSpent / visitCount) : existing.avgTicketCents);
    await tx.update(customers).set({
      name: r.name, phone: r.phone ?? existing.phone, email: r.email ?? existing.email, externalId: r.externalId ?? existing.externalId,
      lastVisitAt: advanced ? r.lastVisitAt : existing.lastVisitAt,
      firstVisitAt: r.firstVisitAt ?? existing.firstVisitAt,
      visitCount, totalSpentCents: totalSpent, avgTicketCents: avg,
      favoriteService: r.favoriteService ?? existing.favoriteService, preferredStaff: r.preferredStaff ?? existing.preferredStaff,
      notes: r.notes ?? existing.notes,
      // Consentimento só é concedido por dado explícito; revogação via planilha também é respeitada.
      consentWhatsapp: wa ?? existing.consentWhatsapp, consentEmail: em ?? existing.consentEmail, consentSms: sm ?? existing.consentSms,
      ...(anyConsent && !existing.optedOutAt ? { legalBasis: "consent" as const, consentSource, consentAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(customers.id, existing.id));
    updated++;
    if (!existing.optedOutAt) await logConsent(tx, org.id, existing.id, diffConsent(existing, wa, em, sm), consentSource, opts.userId);

    if (advanced && r.lastVisitAt) {
      const [v] = await tx.insert(visits).values({
        orgId: org.id, customerId: existing.id, occurredAt: r.lastVisitAt, amountCents: r.lastVisitAmountCents ?? 0,
        description: "Detectado na importação", source: "import",
      }).returning({ id: visits.id });
      const rec = await attributeReturn(tx, org.id, settings, { customerId: existing.id, visitDate: r.lastVisitAt, revenueCents: r.lastVisitAmountCents ?? 0, visitId: v.id });
      if (rec) returnsDetected++;
    }
  }

  await reclassifyOrg(tx, (await tx.select().from(organizations).where(eq(organizations.id, org.id)))[0]);
  const [imp] = await tx.insert(imports).values({
    orgId: org.id, filename: opts.filename, totalRows: rawRows.length, created, updated, skipped,
    errors: errors.slice(0, 500), mapping: opts.mapping as Record<string, string>, createdBy: opts.userId,
  }).returning({ id: imports.id });
  await audit(tx, {
    orgId: org.id, actorType: opts.source === "api" ? "api" : "user", actorId: opts.userId, action: "customers.import",
    entity: "import", entityId: imp.id, summary: `${created} criados, ${updated} atualizados, ${skipped} ignorados`,
    metadata: { totalRows: rawRows.length, source: opts.source },
  });
  return { importId: imp.id, totalRows: rawRows.length, created, updated, skipped, errors, returnsDetected };
}

async function findExisting(tx: Tx, orgId: string, r: CleanRow) {
  const tries = [
    r.phone ? eq(customers.phone, r.phone) : null,
    r.email ? eq(customers.email, r.email) : null,
    r.externalId ? eq(customers.externalId, r.externalId) : null,
  ].filter(Boolean);
  for (const cond of tries) {
    const [c] = await tx.select().from(customers).where(and(eq(customers.orgId, orgId), cond!)).limit(1);
    if (c) return c;
  }
  return null;
}

function diffConsent(e: typeof customers.$inferSelect, wa: boolean | null, em: boolean | null, sm: boolean | null) {
  return {
    whatsapp: wa !== null && wa !== e.consentWhatsapp ? wa : null,
    email: em !== null && em !== e.consentEmail ? em : null,
    sms: sm !== null && sm !== e.consentSms ? sm : null,
  };
}

async function logConsent(tx: Tx, orgId: string, customerId: string, c: { whatsapp: boolean | null; email: boolean | null; sms: boolean | null }, source: string, userId: string | null) {
  for (const [channel, v] of Object.entries(c)) {
    if (v === null) continue;
    await tx.insert(consentEvents).values({
      orgId, customerId, channel, action: v ? "granted" : "revoked", legalBasis: "consent", source, actor: userId ? `user:${userId}` : "system",
    });
  }
}
