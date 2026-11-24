/**
 * Agente analista de retenção. Com a Claude API: loop de tool use sobre as ferramentas da
 * plataforma. Sem a API: interpretador de comandos por regras (modo básico), que usa as mesmas
 * ferramentas e deixa claro que não é IA generativa.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { agentMessages } from "@/db/schema";
import { getSegment } from "@/lib/segments";
import { resolveSettings } from "@/lib/settings";
import { consumeAiQuota, PlanLimitError } from "@/lib/plans";
import { assertBillingActive } from "@/lib/billing/service";
import { audit } from "@/lib/audit";
import { today } from "@/lib/dates";
import { AI_MODEL, FALLBACK_PARAMS, aiEnabled, describeAiError, getAnthropic } from "./client";
import { TOOL_DEFS, runTool, type ToolAction, type ToolContext } from "./tools";
import { runBasicAgent } from "./basic-agent";

type ApiMessage = Anthropic.Beta.BetaMessageParam;

export interface AgentReply { text: string; actions: ToolAction[]; mode: "ai" | "basic"; toolsUsed: string[] }

const MAX_TOOL_ROUNDS = 8;
const MAX_TURNS_PER_CONVERSATION = 30;

/**
 * Prompt de sistema ESTÁVEL por empresa (sem data nem nada que mude a cada turno), para que
 * ferramentas + sistema fiquem no cache de prompt da API. A data vai na mensagem do usuário.
 */
function systemPrompt(ctx: ToolContext): Anthropic.Beta.BetaTextBlockParam[] {
  const seg = getSegment(ctx.org.segment);
  const s = resolveSettings(ctx.org);
  const text = [
    `Você é o GravitaSolves, consultor de retenção e recuperação de clientes do estabelecimento "${ctx.org.name}" (${seg.label}). Pense como um consultor sênior de varejo de serviços: alguém que olha os números, separa o que é fato do que é suposição e entrega um plano que o dono consegue executar ainda esta semana.`,
    "",
    "Seu trabalho: diagnosticar a base, achar padrões de inatividade, priorizar quem tem mais chance de voltar (e vale mais), propor e preparar campanhas e medir resultados.",
    "",
    "Método:",
    "- Antes de afirmar qualquer número, busque-o com as ferramentas. Nunca invente clientes, valores, taxas ou resultados. Se um dado não existe na base, diga isso e sugira como passar a registrá-lo.",
    "- Separe sempre FATO (veio das ferramentas) de HIPÓTESE (sua leitura). Hipóteses vêm marcadas como tal, por exemplo \"Hipótese: ...\", com o que confirmaria ou derrubaria cada uma.",
    "- Projeções de receita são estimativas com premissas explícitas (ticket médio × taxa de retorno assumida). Receita recuperada só existe quando foi registrada.",
    "- Priorize por impacto: valor histórico do cliente × probabilidade de retorno (quem sumiu há menos tempo e vinha com regularidade volta mais). Diga o porquê da ordem.",
    "- Se a base for pequena (menos de ~30 clientes no grupo), avise que a leitura é indicativa, não estatística.",
    "- Termine com uma recomendação prática: o que fazer agora, para quem, por qual canal e como medir em 2 a 4 semanas.",
    "",
    "Regras de produto e conformidade:",
    "- Campanhas só como RASCUNHO (create_campaign_draft). Depois de criar, explique que ela precisa de revisão e aprovação em Campanhas. Nunca diga que algo foi enviado.",
    "- Clientes sem autorização, descadastrados ou bloqueados já são excluídos pelo sistema. Diga quantos ficaram de fora e por quê; não sugira contorná-lo.",
    "- Ofertas e descontos só se o usuário pedir ou concordar." + (seg.restrictions ? ` Restrição do setor: ${seg.restrictions}` : ""),
    "- Fora do escopo da plataforma: diga educadamente o que você pode fazer.",
    "",
    "Formato: português do Brasil, direto, parágrafos curtos, listas com '- ', destaques em **negrito**, sem tabelas. Respostas simples merecem respostas curtas.",
    "",
    `Conhecimento do segmento (${seg.label}): ${seg.aiContext}`,
    `Vocabulário: ${seg.vocab.visit}/${seg.vocab.visits}, ${seg.vocab.staff}, ${seg.vocab.service}.`,
    `Critérios configurados: em risco a partir de ${s.thresholds.atRiskDays} dias sem ${seg.vocab.visit}, inativo a partir de ${s.thresholds.inactiveDays}, altamente inativo a partir de ${s.thresholds.highlyInactiveDays}.`,
  ].join("\n");
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

async function loadConversation(orgId: string, conversationId: string): Promise<{ history: ApiMessage[]; turns: number }> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.select().from(agentMessages)
      .where(and(eq(agentMessages.orgId, orgId), eq(agentMessages.role, "assistant"), sql`${agentMessages.meta}->>'conversationId' = ${conversationId}`, sql`${agentMessages.meta}->>'mode' = 'ai'`))
      .orderBy(asc(agentMessages.createdAt));
    // Reenvia a conversa exatamente como foi trocada com a API (inclui blocos de raciocínio/ferramentas).
    const history = rows.flatMap((r) => (r.meta.api as ApiMessage[] | undefined) ?? []);
    return { history, turns: rows.length };
  });
}

export async function runAgentTurn(ctx: ToolContext, conversationId: string, userText: string): Promise<AgentReply & { conversationId: string }> {
  const text = userText.trim().slice(0, 4000);
  if (!text) throw new Error("Mensagem vazia.");

  let mode: "ai" | "basic" = aiEnabled() ? "ai" : "basic";
  let quotaNotice = "";
  if (mode === "ai") {
    try { await withOrg(ctx.org.id, async (tx) => { await assertBillingActive(tx, ctx.org.id); await consumeAiQuota(tx, ctx.org.id, ctx.org.planId); }); }
    catch (e) { if (e instanceof PlanLimitError) { mode = "basic"; quotaNotice = e.message; } else throw e; }
  }

  let reply: AgentReply;
  let apiMessages: ApiMessage[] = [];
  if (mode === "basic") {
    reply = await runBasicAgent(ctx, text);
    if (quotaNotice) reply.text = `_${quotaNotice} Respondendo em modo básico._\n\n${reply.text}`;
  } else {
    let { history, turns } = await loadConversation(ctx.org.id, conversationId);
    if (turns >= MAX_TURNS_PER_CONVERSATION) { conversationId = crypto.randomUUID(); history = []; }
    try {
      const r = await runClaude(ctx, history, text);
      reply = r.reply; apiMessages = r.newMessages;
    } catch (e) {
      const basic = await runBasicAgent(ctx, text);
      reply = { ...basic, text: `_A IA não respondeu (${describeAiError(e)}). Resposta em modo básico:_\n\n${basic.text}` };
    }
  }

  await withOrg(ctx.org.id, async (tx) => {
    await tx.insert(agentMessages).values({ orgId: ctx.org.id, userId: ctx.userId, role: "user", content: text, meta: { conversationId } });
    await tx.insert(agentMessages).values({
      orgId: ctx.org.id, userId: ctx.userId, role: "assistant", content: reply.text,
      meta: { conversationId, mode: reply.mode, actions: reply.actions, toolsUsed: reply.toolsUsed, api: apiMessages },
    });
    if (reply.toolsUsed.length)
      await audit(tx, { orgId: ctx.org.id, actorType: "agent", actorId: ctx.userId, action: "agent.turn", summary: `Ferramentas: ${reply.toolsUsed.join(", ")}`, metadata: { mode: reply.mode } });
  });
  return { ...reply, conversationId };
}

async function runClaude(ctx: ToolContext, history: ApiMessage[], userText: string) {
  const client = getAnthropic();
  // A data entra na mensagem (depois do prefixo em cache), não no prompt de sistema.
  const newMessages: ApiMessage[] = [{ role: "user", content: `[Data de hoje: ${today()}]
${userText}` }];
  const system = systemPrompt(ctx);
  const actions: ToolAction[] = [];
  const toolsUsed: string[] = [];
  const tools = TOOL_DEFS as unknown as Anthropic.Beta.BetaTool[];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "medium" },
      system,
      tools,
      cache_control: { type: "ephemeral" }, // cache automático da conversa (rodadas de ferramenta reaproveitam o prefixo)
      messages: [...history, ...newMessages],
    });
    if (res.stop_reason === "refusal") {
      return { reply: { text: "Não posso ajudar com esse pedido. Posso analisar sua base, encontrar clientes inativos, criar campanhas em rascunho e mostrar resultados.", actions, mode: "ai" as const, toolsUsed }, newMessages: [] };
    }
    newMessages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });

    if (res.stop_reason === "pause_turn") continue;
    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: { text: text || "Pronto.", actions, mode: "ai" as const, toolsUsed }, newMessages };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolsUsed.push(tu.name);
      try {
        const out = await runTool(tu.name, tu.input, ctx);
        if (out.action) actions.push(out.action);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out.data) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: e instanceof Error ? e.message : "Erro", is_error: true });
      }
    }
    newMessages.push({ role: "user", content: results });
  }
  return {
    reply: { text: "A análise exigiu passos demais. Tente um pedido mais específico.", actions, mode: "ai" as const, toolsUsed },
    newMessages: [] as ApiMessage[],
  };
}
