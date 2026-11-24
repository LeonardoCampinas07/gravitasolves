/** Direitos do titular (LGPD art. 18): acesso/portabilidade e eliminação. */
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  campaignMessages, consentEvents, customers, inboundMessages, recoveries, visits, blocklist,
} from "@/db/schema";
import { audit } from "./audit";

export async function exportCustomerData(tx: Tx, orgId: string, customerId: string) {
  const [c] = await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)));
  if (!c) throw new Error("Cliente não encontrado");
  const where = <T extends { orgId: unknown; customerId: unknown }>(t: T) => and(eq(t.orgId as never, orgId), eq(t.customerId as never, customerId));
  return {
    gerado_em: new Date().toISOString(),
    titular: c,
    visitas: await tx.select().from(visits).where(where(visits)),
    mensagens_enviadas: await tx.select().from(campaignMessages).where(where(campaignMessages)),
    mensagens_recebidas: await tx.select().from(inboundMessages).where(where(inboundMessages)),
    historico_de_consentimento: await tx.select().from(consentEvents).where(where(consentEvents)),
    retornos_atribuidos: await tx.select().from(recoveries).where(where(recoveries)),
  };
}

/**
 * Elimina o cliente e dados vinculados (cascata). Opcionalmente mantém o contato na lista de
 * bloqueio — único dado preservado, para garantir que a pessoa não volte a ser contatada.
 */
export async function deleteCustomerData(tx: Tx, orgId: string, customerId: string, actorId: string, keepBlocked: boolean) {
  const [c] = await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)));
  if (!c) throw new Error("Cliente não encontrado");
  if (keepBlocked) {
    for (const value of [c.phone, c.email].filter(Boolean) as string[])
      await tx.insert(blocklist).values({ orgId, value, reason: "Solicitação de exclusão (LGPD)" }).onConflictDoNothing();
  }
  await tx.delete(customers).where(eq(customers.id, customerId));
  await audit(tx, { orgId, actorType: "user", actorId, action: "customer.delete", entity: "customer", entityId: customerId, summary: "Dados do titular eliminados" + (keepBlocked ? " (contato mantido na lista de bloqueio)" : "") });
}

export async function exportOrgData(tx: Tx, orgId: string) {
  return {
    gerado_em: new Date().toISOString(),
    clientes: await tx.select().from(customers).where(eq(customers.orgId, orgId)),
    visitas: await tx.select().from(visits).where(eq(visits.orgId, orgId)),
    consentimentos: await tx.select().from(consentEvents).where(eq(consentEvents.orgId, orgId)),
    bloqueios: await tx.select().from(blocklist).where(eq(blocklist.orgId, orgId)),
  };
}
