/**
 * Webhook do Asaas (cobranças da assinatura da plataforma).
 * - Autenticação: cabeçalho `asaas-access-token` igual a ASAAS_WEBHOOK_TOKEN (definido no painel do Asaas).
 * - O corpo NÃO é confiável: o serviço reconsulta a cobrança na API antes de ativar qualquer plano.
 * - Idempotente: eventos repetidos são ignorados.
 */
import { safeEqual } from "@/lib/crypto";
import { handleAsaasEvent } from "@/lib/billing/service";
import { log } from "@/lib/log";

export async function POST(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) return new Response("Webhook não configurado", { status: 503 });
  if (!safeEqual(req.headers.get("asaas-access-token") ?? "", expected)) { log("warn", "billing.webhook_unauthorized"); return new Response("Não autorizado", { status: 401 }); }

  let body: unknown;
  try { body = await req.json(); } catch { return new Response("JSON inválido", { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as { event?: unknown }).event !== "string")
    return new Response("Evento inválido", { status: 400 });

  try {
    const result = await handleAsaasEvent(body as Parameters<typeof handleAsaasEvent>[0]);
    log("info", "billing.webhook", { asaasEvent: (body as { event: string }).event, ...result });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    // 500 faz o Asaas reenviar o evento mais tarde (a fila dele pausa após falhas seguidas).
    log("error", "billing.webhook_failed", { asaasEvent: (body as { event?: string }).event, error: e });
    return new Response("Erro ao processar", { status: 500 });
  }
}
