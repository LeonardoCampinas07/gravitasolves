/**
 * Job diário (idempotente): reclassifica clientes, executa automações e aplica a política de retenção.
 * Disparado por /api/cron/daily (Vercel Cron, Supabase pg_cron + http, etc.) ou `npm run jobs:run`.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { automations, customers, dataSources, organizations } from "@/db/schema";
import { syncGoogle } from "./sources/google";
import { syncIcsUrl } from "./sources/ics-url";
import { reclassifyOrg, type Transition } from "./customers";
import { createCampaign, dispatchCampaign, transitionCampaign } from "./campaigns/service";
import { getPlan } from "./plans";
import { assertBillingActive, BillingInactiveError } from "@/lib/billing/service";
import { audit } from "./audit";
import { STATUS_LABEL } from "./classification";
import { today } from "./dates";
import { isSandboxOrg } from "./sandbox";

export interface DailyReport { orgId: string; reclassified: number; transitions: number; automationsRun: number; campaignsCreated: number; purged: number; errors: string[] }

export async function runDailyJobs(): Promise<DailyReport[]> {
  const db = await getDb();
  const orgs = await db.select().from(organizations);
  const reports: DailyReport[] = [];
  for (const org of orgs) {
    if (isSandboxOrg(org.id)) continue; // a simulação é recriada sozinha e nunca roda automações
    const report: DailyReport = { orgId: org.id, reclassified: 0, transitions: 0, automationsRun: 0, campaignsCreated: 0, purged: 0, errors: [] };
    try {
      // 1) Fontes automáticas (Google Agenda e agenda por link) antes de reclassificar.
      const [g] = await withOrg(org.id, (tx) => tx.select().from(dataSources).where(and(eq(dataSources.orgId, org.id), eq(dataSources.kind, "google_calendar"))));
      if (g?.secretEncrypted) await syncGoogle(org.id, null).catch((e) => report.errors.push(`Google Agenda: ${e instanceof Error ? e.message : e}`));
      const [ics] = await withOrg(org.id, (tx) => tx.select().from(dataSources).where(and(eq(dataSources.orgId, org.id), eq(dataSources.kind, "ics_url"))));
      if (ics?.secretEncrypted) await syncIcsUrl(org.id, null).catch((e) => report.errors.push(`Agenda por link: ${e instanceof Error ? e.message : e}`));
      const { changed, transitions } = await withOrg(org.id, (tx) => reclassifyOrg(tx, org));
      report.reclassified = changed; report.transitions = transitions.length;
      const auto = await runAutomations(org.id, org.planId, transitions);
      report.automationsRun = auto.run; report.campaignsCreated = auto.created; report.errors.push(...auto.errors);
      report.purged = await applyRetention(org.id, org.dataRetentionDays);
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : String(e));
    }
    reports.push(report);
  }
  return reports;
}

export async function runAutomations(orgId: string, planId: string, transitions: Transition[]) {
  const out = { run: 0, created: 0, errors: [] as string[] };
  const { rules, allowed } = await withOrg(orgId, async (tx) => {
    try { await assertBillingActive(tx, orgId); } catch (e) { if (e instanceof BillingInactiveError) return { rules: [], allowed: 0 }; throw e; }
    const plan = await getPlan(tx, planId);
    const rules = await tx.select().from(automations).where(and(eq(automations.orgId, orgId), eq(automations.enabled, true)));
    return { rules, allowed: plan.limits.automations };
  });
  if (!allowed) return out;
  for (const rule of rules.slice(0, allowed)) {
    const ids = transitions.filter((t) => t.to === rule.triggerStatus).map((t) => t.customerId);
    out.run++;
    if (ids.length) {
      try {
        const r = await createCampaign(orgId, {
          name: `${rule.name} — ${today().split("-").reverse().join("/")}`,
          audience: { customerIds: ids, statuses: [rule.triggerStatus] },
          channel: rule.channel, tone: rule.tone, offer: rule.offer, automationId: rule.id,
          objective: `Reativar clientes que acabaram de entrar em "${STATUS_LABEL[rule.triggerStatus]}"`,
          requiresApproval: rule.requiresApproval,
        }, { type: "automation", userId: null });
        out.created++;
        if (!rule.requiresApproval && r.queued > 0) {
          await transitionCampaign(orgId, r.campaign.id, "submit", { type: "automation", userId: null });
          const d = await dispatchCampaign(orgId, r.campaign.id, { type: "automation", userId: null });
          if (d.notConfigured) out.errors.push(`Automação "${rule.name}": canal não configurado; campanha aguardando envio manual.`);
        }
      } catch (e) {
        out.errors.push(`Automação "${rule.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    await withOrg(orgId, (tx) => tx.update(automations).set({ lastRunAt: new Date() }).where(eq(automations.id, rule.id)));
  }
  return out;
}

/** Exclui clientes sem nenhuma atividade há mais que o prazo de retenção da empresa (LGPD, art. 15–16). */
export async function applyRetention(orgId: string, retentionDays: number) {
  if (!retentionDays || retentionDays < 30) return 0;
  return withOrg(orgId, async (tx) => {
    const deleted = await tx.delete(customers).where(and(
      eq(customers.orgId, orgId),
      sql`greatest(coalesce(${customers.lastVisitAt}::timestamptz, ${customers.createdAt}), ${customers.updatedAt}) < now() - make_interval(days => ${retentionDays})`,
    )).returning({ id: customers.id });
    if (deleted.length)
      await audit(tx, { orgId, actorType: "system", action: "retention.purge", summary: `${deleted.length} cliente(s) excluídos pela política de retenção de ${retentionDays} dias` });
    return deleted.length;
  });
}
