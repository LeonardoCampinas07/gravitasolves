/** Processamento de eventos recebidos dos provedores (status de entrega e mensagens de clientes). */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { campaignMessages, customers, inboundMessages, organizations, type MessageStatus } from "@/db/schema";
import { resolveSettings } from "./settings";
import { touchContact } from "./sources/ingest";
import { isOptOutMessage } from "./campaigns/compliance";
import { optOutCustomer } from "./customers";

const ORDER: MessageStatus[] = ["queued", "sent", "delivered", "read", "replied"];

/** Atualiza o status sem regredir (eventos podem chegar fora de ordem). */
export async function applyDeliveryStatus(orgId: string, providerMessageId: string, status: "sent" | "delivered" | "read" | "failed", error?: string) {
  if (!providerMessageId) return;
  await withOrg(orgId, async (tx) => {
    const [m] = await tx.select().from(campaignMessages).where(and(eq(campaignMessages.orgId, orgId), eq(campaignMessages.providerMessageId, providerMessageId)));
    if (!m) return;
    if (status === "failed") {
      await tx.update(campaignMessages).set({ status: "failed", error: (error ?? "Falha informada pelo provedor").slice(0, 300) }).where(eq(campaignMessages.id, m.id));
      return;
    }
    if (ORDER.indexOf(status) <= ORDER.indexOf(m.status)) return;
    await tx.update(campaignMessages).set({
      status, ...(status === "delivered" ? { deliveredAt: new Date() } : {}), ...(status === "read" ? { readAt: new Date(), deliveredAt: m.deliveredAt ?? new Date() } : {}),
    }).where(eq(campaignMessages.id, m.id));
  });
}

/** Mensagem recebida de um cliente: registra, marca resposta na última mensagem enviada e trata pedidos de descadastro. */
export async function handleInbound(orgId: string, channel: "whatsapp" | "sms", fromE164: string, body: string | null, profileName: string | null = null) {
  return withOrg(orgId, async (tx) => {
    // Captura automática: cada conversa atualiza o último contato e, se ligado, cria o cliente.
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
    const capture = channel === "whatsapp" && resolveSettings(org).whatsappAutoCapture && !isOptOutMessage(body);
    await touchContact(tx, org, fromE164, profileName, capture);
    const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, orgId), eq(customers.phone, fromE164)));
    const optOut = isOptOutMessage(body);
    let msgId: string | null = null;
    if (c) {
      const [last] = await tx.select().from(campaignMessages)
        .where(and(eq(campaignMessages.orgId, orgId), eq(campaignMessages.customerId, c.id), sql`${campaignMessages.sentAt} is not null`))
        .orderBy(desc(campaignMessages.sentAt)).limit(1);
      if (last) {
        msgId = last.id;
        if (!last.repliedAt) await tx.update(campaignMessages).set({ status: "replied", repliedAt: new Date() }).where(and(eq(campaignMessages.id, last.id), isNull(campaignMessages.repliedAt)));
      }
      if (optOut) await optOutCustomer(tx, orgId, c.id, `Resposta "${(body ?? "").slice(0, 20)}" via ${channel}`, "customer");
    }
    await tx.insert(inboundMessages).values({ orgId, customerId: c?.id ?? null, campaignMessageId: msgId, channel, body: body?.slice(0, 2000) ?? null, isOptOut: optOut });
    return { matched: !!c, optOut };
  });
}
