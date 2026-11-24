/** POST /api/v1/visits — registra uma visita/compra (ex.: vinda do sistema de agenda ou PDV). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db/client";
import { customers } from "@/db/schema";
import { authenticateApi, json } from "@/lib/api-auth";
import { normalizeEmail, normalizePhone, parseDate } from "@/lib/import/normalize";
import { recordVisit } from "@/lib/customers";
import { audit } from "@/lib/audit";

const Body = z.object({
  customer: z.object({ phone: z.string().optional(), email: z.string().optional(), external_id: z.string().optional() }),
  date: z.string(),
  amount: z.number().min(0).max(1_000_000).optional(),
  description: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateApi(req);
  if ("error" in auth) return auth.error;
  const org = auth.org;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Corpo inválido", details: parsed.error.issues }, 400);
  const b = parsed.data;
  const date = parseDate(b.date);
  if (!date) return json({ error: "Data inválida ou futura (use AAAA-MM-DD)" }, 400);
  const phone = normalizePhone(b.customer.phone), email = normalizeEmail(b.customer.email);
  const cond = phone ? eq(customers.phone, phone) : email ? eq(customers.email, email) : b.customer.external_id ? eq(customers.externalId, b.customer.external_id) : null;
  if (!cond) return json({ error: "Informe customer.phone, customer.email ou customer.external_id" }, 400);
  return withOrg(org.id, async (tx) => {
    const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, org.id), cond)).limit(1);
    if (!c) return json({ error: "Cliente não encontrado. Cadastre-o via POST /api/v1/customers." }, 404);
    const r = await recordVisit(tx, org, c.id, { date, amountCents: Math.round((b.amount ?? 0) * 100), description: b.description, source: "api" });
    await audit(tx, { orgId: org.id, actorType: "api", action: "visit.api", entity: "customer", entityId: c.id });
    return json({ ok: true, customer_id: c.id, visit_id: r.visit.id, attributed_to_campaign: r.recovery?.campaignId ?? null }, 201);
  });
}
