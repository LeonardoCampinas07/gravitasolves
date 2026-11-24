import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { agentMessages } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { aiEnabled, AI_MODEL } from "@/lib/ai/client";
import { getSegment } from "@/lib/segments";
import { AgentChat, type ChatMsg } from "./chat";

export const metadata = { title: "Agente de IA" };

export default async function AgentPage() {
  const ctx = await requireCtx("agent:use");
  const history = await withOrg(ctx.org.id, async (tx) => {
    const [last] = await tx.select({ conv: sql<string>`${agentMessages.meta}->>'conversationId'` }).from(agentMessages)
      .where(and(eq(agentMessages.orgId, ctx.org.id), eq(agentMessages.userId, ctx.user.id))).orderBy(desc(agentMessages.createdAt)).limit(1);
    if (!last?.conv) return { conversationId: null, messages: [] as ChatMsg[] };
    const rows = await tx.select().from(agentMessages)
      .where(and(eq(agentMessages.orgId, ctx.org.id), sql`${agentMessages.meta}->>'conversationId' = ${last.conv}`)).orderBy(asc(agentMessages.createdAt)).limit(80);
    return {
      conversationId: last.conv,
      messages: rows.map((r) => ({ id: r.id, role: r.role, text: r.content, mode: r.meta.mode as "ai" | "basic" | undefined, actions: (r.meta.actions as ChatMsg["actions"]) ?? [] })),
    };
  });
  return <AgentChat initial={history.messages} conversationId={history.conversationId} aiMode={aiEnabled() ? "ai" : "basic"} model={AI_MODEL} orgName={ctx.org.name} segmentLabel={getSegment(ctx.org.segment).label} sim={ctx.sim} />;
}
