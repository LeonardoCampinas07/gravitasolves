/**
 * Webhook da WhatsApp Cloud API (Meta).
 * GET: verificação (hub.challenge). POST: statuses e mensagens recebidas, com assinatura X-Hub-Signature-256.
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { safeEqual } from "@/lib/crypto";
import { applyDeliveryStatus, handleInbound } from "@/lib/inbound";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token)
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

interface WaPayload {
  entry?: { changes?: { value?: {
    metadata?: { phone_number_id?: string };
    contacts?: { wa_id?: string; profile?: { name?: string } }[];
    statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
    messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[];
  } }[] }[];
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("Webhook não configurado", { status: 503 });
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEqual(sig, expected)) return new Response("Assinatura inválida", { status: 401 });

  let payload: WaPayload;
  try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido", { status: 400 }); }
  const db = await getDb();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const phoneNumberId = v?.metadata?.phone_number_id;
      if (!v || !phoneNumberId) continue;
      const [integ] = await db.select({ orgId: integrations.orgId }).from(integrations)
        .where(sql`${integrations.provider} = 'whatsapp_cloud' and ${integrations.config}->>'phoneNumberId' = ${phoneNumberId}`);
      if (!integ) continue;
      for (const s of v.statuses ?? []) {
        if (["sent", "delivered", "read", "failed"].includes(s.status))
          await applyDeliveryStatus(integ.orgId, s.id, s.status as "sent", s.errors?.[0]?.message ?? s.errors?.[0]?.title);
      }
      for (const m of v.messages ?? []) {
        const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? null;
        const profile = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        await handleInbound(integ.orgId, "whatsapp", `+${m.from.replace(/\D/g, "")}`, body, profile);
      }
    }
  }
  return new Response("ok");
}
