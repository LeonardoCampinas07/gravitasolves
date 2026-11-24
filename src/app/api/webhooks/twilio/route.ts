/** Webhook do Twilio (status de SMS e mensagens recebidas). Valida X-Twilio-Signature com o Auth Token da empresa. */
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { decryptSecret, safeEqual } from "@/lib/crypto";
import { applyDeliveryStatus, handleInbound } from "@/lib/inbound";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("org inválida", { status: 400 });
  const db = await getDb();
  const [integ] = await db.select().from(integrations).where(and(eq(integrations.orgId, orgId), eq(integrations.provider, "twilio")));
  if (!integ?.secretEncrypted) return new Response("Não configurado", { status: 404 });

  const form = await req.formData();
  const params = [...form.entries()].map(([k, v]) => [k, String(v)] as const).sort(([a], [b]) => a.localeCompare(b));
  // A URL assinada é a pública configurada (APP_URL), não a interna do servidor.
  const publicUrl = `${process.env.APP_URL ?? url.origin}${url.pathname}${url.search}`;
  const expected = createHmac("sha1", decryptSecret(integ.secretEncrypted)).update(publicUrl + params.map(([k, v]) => k + v).join("")).digest("base64");
  if (!safeEqual(req.headers.get("x-twilio-signature") ?? "", expected)) return new Response("Assinatura inválida", { status: 401 });

  const p = Object.fromEntries(params);
  if (p.MessageStatus && p.MessageSid) {
    const map: Record<string, "sent" | "delivered" | "read" | "failed"> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed", undelivered: "failed" };
    const st = map[p.MessageStatus];
    if (st) await applyDeliveryStatus(orgId, p.MessageSid, st, p.ErrorCode ? `Erro Twilio ${p.ErrorCode}` : undefined);
  } else if (p.From && p.Body !== undefined) {
    await handleInbound(orgId, "sms", p.From, p.Body);
  }
  return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
