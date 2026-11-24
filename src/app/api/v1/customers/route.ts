/** POST /api/v1/customers — cria/atualiza até 500 clientes por chamada (mesmas regras da importação). */
import { z } from "zod";
import { withOrg } from "@/db/client";
import { authenticateApi, json } from "@/lib/api-auth";
import { importRows } from "@/lib/import/run";

const Customer = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().optional(), email: z.string().optional(), external_id: z.string().optional(),
  last_visit: z.string().optional(), first_visit: z.string().optional(), visit_count: z.number().int().min(0).optional(),
  total_spent: z.number().min(0).optional(), avg_ticket: z.number().min(0).optional(), last_visit_amount: z.number().min(0).optional(),
  favorite_service: z.string().optional(), preferred_staff: z.string().optional(), notes: z.string().optional(),
  consent_whatsapp: z.boolean().optional(), consent_email: z.boolean().optional(), consent_sms: z.boolean().optional(),
});
const Body = z.object({ customers: z.array(Customer).min(1).max(500) });

const MAP = {
  name: "name", phone: "phone", email: "email", externalId: "external_id", lastVisit: "last_visit", firstVisit: "first_visit",
  visitCount: "visit_count", totalSpent: "total_spent", avgTicket: "avg_ticket", lastVisitAmount: "last_visit_amount",
  favoriteService: "favorite_service", preferredStaff: "preferred_staff", notes: "notes",
  consentWhatsapp: "consent_whatsapp", consentEmail: "consent_email", consentSms: "consent_sms",
} as const;

export async function POST(req: Request) {
  const auth = await authenticateApi(req);
  if ("error" in auth) return auth.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Corpo inválido", details: parsed.error.issues.slice(0, 10) }, 400);
  const r = await withOrg(auth.org.id, (tx) => importRows(tx, auth.org, parsed.data.customers as Record<string, unknown>[], {
    filename: "api", source: "api", userId: null, mapping: MAP,
  }));
  return json({ ok: true, created: r.created, updated: r.updated, skipped: r.skipped, returns_detected: r.returnsDetected, errors: r.errors.map((e) => ({ index: e.row - 2, message: e.message })) });
}
