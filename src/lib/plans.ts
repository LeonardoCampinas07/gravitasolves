import { eq, sql } from "drizzle-orm";
import { plans, usageCounters, type Channel } from "@/db/schema";
import type { Tx } from "@/db/client";

export interface PlanLimits {
  maxCustomers: number;
  aiRequestsPerMonth: number;
  messagesPerMonth: number;
  automations: number;
  channels: Channel[];
  apiAccess: boolean;
  members: number;
}

export class PlanLimitError extends Error {}

export async function getPlan(tx: Tx, planId: string) {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plano ${planId} não encontrado`);
  return plan;
}

export function currentPeriod(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export async function getUsage(tx: Tx, orgId: string) {
  const [row] = await tx.select().from(usageCounters)
    .where(sql`${usageCounters.orgId} = ${orgId} and ${usageCounters.period} = ${currentPeriod()}`);
  return row ?? { orgId, period: currentPeriod(), aiRequests: 0, messagesSent: 0 };
}

export async function incrementUsage(tx: Tx, orgId: string, field: "aiRequests" | "messagesSent", by = 1) {
  if (field === "aiRequests") {
    await tx.execute(sql`
      insert into usage_counters (org_id, period, ai_requests, messages_sent) values (${orgId}, ${currentPeriod()}, ${by}, 0)
      on conflict (org_id, period) do update set ai_requests = usage_counters.ai_requests + ${by}`);
  } else {
    await tx.execute(sql`
      insert into usage_counters (org_id, period, ai_requests, messages_sent) values (${orgId}, ${currentPeriod()}, 0, ${by})
      on conflict (org_id, period) do update set messages_sent = usage_counters.messages_sent + ${by}`);
  }
}

/** Lança PlanLimitError se a cota mensal de IA estiver esgotada; caso contrário consome 1. */
export async function consumeAiQuota(tx: Tx, orgId: string, planId: string) {
  const plan = await getPlan(tx, planId);
  const usage = await getUsage(tx, orgId);
  if (usage.aiRequests >= plan.limits.aiRequestsPerMonth)
    throw new PlanLimitError(`Limite mensal de ${plan.limits.aiRequestsPerMonth} solicitações de IA do plano ${plan.name} atingido.`);
  await incrementUsage(tx, orgId, "aiRequests");
}
