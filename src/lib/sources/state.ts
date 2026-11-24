import { and, eq, sql } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { customers, dataSources, integrations } from "@/db/schema";
import type { Ctx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getPlan } from "@/lib/plans";
import { SERVICES } from "@/lib/demo";
import { googleConfigured } from "./google";
import type { SourceState } from "@/components/source-picker";

/** Estado de todas as fontes de dados de uma empresa, para a tela "Conexões". */
export async function loadSourceState(ctx: Ctx): Promise<SourceState> {
  const db = await getDb();
  const [wa] = await db.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.orgId, ctx.org.id), eq(integrations.provider, "whatsapp_cloud")));
  const { sources, counts, plan } = await withOrg(ctx.org.id, async (tx) => ({
    sources: await tx.select().from(dataSources).where(eq(dataSources.orgId, ctx.org.id)),
    counts: await tx.select({ source: customers.source, n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.orgId, ctx.org.id)).groupBy(customers.source),
    plan: await getPlan(tx, ctx.org.planId),
  }));
  const g = sources.find((s) => s.kind === "google_calendar");
  const ics = sources.find((s) => s.kind === "ics_url");
  const partner = sources.find((s) => s.kind === "partner_request");
  return {
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    canManage: can(ctx.role, "integrations:write"),
    google: { configured: googleConfigured(), connected: !!g?.secretEncrypted, status: g?.status ?? null, lastSyncAt: g?.lastSyncAt?.toISOString() ?? null, lastResult: g?.lastResult ?? null },
    icsUrl: { connected: !!ics?.secretEncrypted, host: (ics?.config.host as string | undefined) ?? null, status: ics?.status ?? null, lastSyncAt: ics?.lastSyncAt?.toISOString() ?? null, lastResult: ics?.lastResult ?? null },
    booking: { ...ctx.settings.booking, slug: ctx.org.slug },
    whatsapp: { apiConnected: !!wa, autoCapture: ctx.settings.whatsappAutoCapture, countContact: ctx.settings.countContactAsActivity },
    partnerRequested: (partner?.config.system as string | undefined) ?? null,
    apiAccess: plan.limits.apiAccess,
    counts: Object.fromEntries(counts.map((c) => [c.source, Number(c.n)])),
    defaultServices: (SERVICES[ctx.org.segment] ?? SERVICES.generic).services,
  };
}
