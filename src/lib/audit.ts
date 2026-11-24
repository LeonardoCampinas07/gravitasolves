import { auditLogs } from "@/db/schema";
import type { Tx } from "@/db/client";

/**
 * Registro de auditoria. Não grave dados pessoais em `summary`/`metadata`
 * (use IDs e contagens) — o log sobrevive à exclusão do cliente.
 */
export async function audit(
  tx: Tx,
  e: {
    orgId: string | null;
    actorType: "user" | "agent" | "system" | "api";
    actorId?: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLogs).values({
    orgId: e.orgId, actorType: e.actorType, actorId: e.actorId ?? null, action: e.action,
    entity: e.entity, entityId: e.entityId, summary: e.summary, metadata: e.metadata ?? {},
  });
}
