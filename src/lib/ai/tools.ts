/**
 * Ferramentas do agente. São as ÚNICAS ações que o agente pode executar — todas filtradas
 * pela empresa e pelo papel do usuário. O agente nunca envia mensagens: cria rascunhos que
 * passam por revisão e aprovação humana.
 *
 * Minimização de dados (LGPD): o modelo recebe nome curto (primeiro nome + inicial) e métricas;
 * telefone e e-mail nunca são enviados ao provedor de IA.
 */
import { z } from "zod";
import { SimulationError, isSandboxOrg } from "@/lib/sandbox";
import { asc, desc, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { customers, type CustomerStatus, type Organization, type Role } from "@/db/schema";
import { resolveSettings } from "@/lib/settings";
import { getSegment } from "@/lib/segments";
import { customerWhere } from "@/lib/customers";
import { getCampaignStats, getInactivityPatterns, getOverview, getRecoveredBetween } from "@/lib/analytics";
import { createCampaign } from "@/lib/campaigns/service";
import { can } from "@/lib/auth/permissions";
import { STATUS_LABEL } from "@/lib/classification";
import { addDays, daysBetween, monthStart, today } from "@/lib/dates";
import { getActionItems, getMonthComparison } from "@/lib/action-center";
import { shortName } from "@/lib/format";

export interface ToolContext { org: Organization; userId: string; role: Role }
export interface ToolAction { type: "campaign_created"; campaignId: string; name: string }
export interface ToolOutput { data: unknown; action?: ToolAction }

const STATUS = z.enum(["active", "at_risk", "inactive", "highly_inactive", "recovered", "unknown"]);

export const schemas = {
  get_overview: z.object({}),
  find_customers: z.object({
    statuses: z.array(STATUS).optional(),
    min_days_inactive: z.number().int().min(0).optional(),
    max_days_inactive: z.number().int().min(0).optional(),
    min_avg_ticket_reais: z.number().min(0).optional(),
    sort_by: z.enum(["priority", "days_inactive", "avg_ticket", "total_spent", "visits"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  analyze_patterns: z.object({}),
  recovery_diagnosis: z.object({}),
  create_campaign_draft: z.object({
    name: z.string().min(3).max(120),
    channel: z.enum(["whatsapp", "email", "sms"]),
    statuses: z.array(z.enum(["at_risk", "inactive", "highly_inactive"])).optional(),
    min_days_inactive: z.number().int().min(0).optional(),
    max_days_inactive: z.number().int().min(0).optional(),
    min_avg_ticket_reais: z.number().min(0).optional(),
    min_priority: z.number().int().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
    tone: z.string().max(60).optional(),
    offer: z.string().max(200).optional(),
    objective: z.string().max(300).optional(),
  }),
  campaign_performance: z.object({ campaign_id: z.string().uuid().optional() }),
  recovered_revenue: z.object({ period: z.enum(["this_month", "last_month", "last_30_days", "last_90_days", "all_time"]) }),
  get_settings: z.object({}),
};
export type ToolName = keyof typeof schemas;

/** Definições no formato da Claude API (JSON Schema). */
export const TOOL_DEFS: { name: ToolName; description: string; input_schema: Record<string, unknown> }[] = [
  { name: "get_overview", description: "Resumo da base: total de clientes, quantidade por status (ativo, em risco, inativo, altamente inativo, recuperado), quanto os afastados costumavam gastar, projeção de receita recuperável, recuperações e receita recuperada no mês, campanhas em andamento.", input_schema: { type: "object", properties: {} } },
  {
    name: "find_customers",
    description: "Busca clientes por status e tempo sem visita. Retorna o total encontrado e até `limit` clientes com nome curto, status, dias sem visita, nº de visitas, ticket médio, serviço favorito, profissional preferido, score de potencial de retorno (0-100) e canais autorizados. Use sort_by=priority para 'maior potencial de retorno'.",
    input_schema: {
      type: "object",
      properties: {
        statuses: { type: "array", items: { type: "string", enum: STATUS.options }, description: "Filtrar por status" },
        min_days_inactive: { type: "integer", description: "Mínimo de dias desde a última visita" },
        max_days_inactive: { type: "integer", description: "Máximo de dias desde a última visita" },
        min_avg_ticket_reais: { type: "number", description: "Ticket médio mínimo em reais" },
        sort_by: { type: "string", enum: ["priority", "days_inactive", "avg_ticket", "total_spent", "visits"], description: "visits = clientes que mais compram/frequentam" },
        limit: { type: "integer", description: "Máximo de clientes listados (1-50). Padrão 10." },
      },
    },
  },
  { name: "recovery_diagnosis", description: "Diagnóstico para melhorar a taxa de recuperação: pendências reais (campanhas aguardando aprovação, mensagens na fila, falhas, respostas, afastados prontos para contato, afastados sem autorização), retornos deste mês x mês passado e taxa de recuperação dos últimos 90 dias. Use para 'como melhorar', 'o que fazer agora'.", input_schema: { type: "object", properties: {} } },
  { name: "analyze_patterns", description: "Padrões de inatividade: taxa de afastamento por serviço favorito, por profissional preferido e por faixa de fidelidade (nº de visitas).", input_schema: { type: "object", properties: {} } },
  {
    name: "create_campaign_draft",
    description: "Cria uma campanha de reativação em RASCUNHO para um público. As mensagens são geradas e cada cliente passa pelas regras de consentimento, bloqueio e frequência. NÃO envia nada: a campanha precisa ser revisada e aprovada por uma pessoa na tela de Campanhas. Padrão de público: clientes em risco, inativos e altamente inativos.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome descritivo da campanha" },
        channel: { type: "string", enum: ["whatsapp", "email", "sms"] },
        statuses: { type: "array", items: { type: "string", enum: ["at_risk", "inactive", "highly_inactive"] } },
        min_days_inactive: { type: "integer" },
        max_days_inactive: { type: "integer" },
        min_avg_ticket_reais: { type: "number" },
        min_priority: { type: "integer", description: "Score mínimo de potencial de retorno (0-100)" },
        limit: { type: "integer", description: "Máximo de clientes (prioriza maior potencial)" },
        tone: { type: "string", description: "Tom de voz, ex.: descontraído, acolhedor, profissional" },
        offer: { type: "string", description: "Oferta, somente se o usuário pediu ou aprovou. Respeite restrições do setor." },
        objective: { type: "string" },
      },
      required: ["name", "channel"],
    },
  },
  { name: "campaign_performance", description: "Desempenho das campanhas: público, enviadas, entregues, respostas, clientes que retornaram, receita atribuída e taxa de recuperação. Sem campaign_id retorna todas, mais recentes primeiro.", input_schema: { type: "object", properties: { campaign_id: { type: "string" } } } },
  { name: "recovered_revenue", description: "Clientes recuperados e receita recuperada (atribuída a campanhas) em um período. A receita só inclui valores informados (importação, registro de visita ou API).", input_schema: { type: "object", properties: { period: { type: "string", enum: ["this_month", "last_month", "last_30_days", "last_90_days", "all_time"] } }, required: ["period"] } },
  { name: "get_settings", description: "Critérios de inatividade configurados (dias para em risco/inativo/altamente inativo), segmento, regras de frequência de contato e premissas de projeção.", input_schema: { type: "object", properties: {} } },
];

const reais = (c: number) => Math.round(c) / 100;

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput> {
  if (!(name in schemas)) throw new Error(`Ferramenta desconhecida: ${name}`);
  const parsed = schemas[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) throw new Error(`Parâmetros inválidos: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  const input = parsed.data as Record<string, unknown>;
  const orgId = ctx.org.id;
  const s = resolveSettings(ctx.org);
  const t = today();

  switch (name as ToolName) {
    case "get_overview":
      return withOrg(orgId, async (tx) => {
        const o = await getOverview(tx, orgId, s);
        return { data: {
          total_clientes: o.total,
          por_status: Object.fromEntries(Object.entries(o.byStatus).map(([k, v]) => [STATUS_LABEL[k as CustomerStatus], v])),
          afastados_soma_ticket_medio_reais: reais(o.lapsedTicketSumCents),
          afastados_gasto_historico_reais: reais(o.lapsedLifetimeCents),
          projecao_receita_recuperavel_reais: reais(o.projectedRecoverableCents),
          projecao_premissas: s.returnProbability,
          afastados_com_contato_autorizado: o.contactableLapsed,
          recuperados_no_mes: o.recoveredThisMonth,
          receita_recuperada_no_mes_reais: reais(o.recoveredRevenueThisMonthCents),
          campanhas_em_andamento: o.activeCampaigns,
          clientes_de_demonstracao: o.demoCustomers,
        } };
      });

    case "find_customers":
      return withOrg(orgId, async (tx) => {
        const f = {
          statuses: input.statuses as CustomerStatus[] | undefined,
          minDaysInactive: input.min_days_inactive as number | undefined,
          maxDaysInactive: input.max_days_inactive as number | undefined,
          minAvgTicketCents: input.min_avg_ticket_reais !== undefined ? Math.round((input.min_avg_ticket_reais as number) * 100) : undefined,
        };
        const where = customerWhere(orgId, f, t);
        const order = { priority: [desc(customers.priorityScore)], days_inactive: [asc(customers.lastVisitAt)], avg_ticket: [desc(customers.avgTicketCents)], total_spent: [desc(customers.totalSpentCents)], visits: [desc(customers.visitCount)] }[(input.sort_by as string) ?? "priority"] ?? [desc(customers.priorityScore)];
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(where);
        const rows = await tx.select().from(customers).where(where).orderBy(...order, asc(customers.name)).limit((input.limit as number) ?? 10);
        return { data: {
          total_encontrado: Number(n),
          listados: rows.length,
          clientes: rows.map((c) => ({
            id: c.id, nome: shortName(c.name), status: STATUS_LABEL[c.status],
            dias_sem_visita: c.lastVisitAt ? daysBetween(c.lastVisitAt, t) : null, visitas: c.visitCount,
            ticket_medio_reais: reais(c.avgTicketCents), gasto_total_reais: reais(c.totalSpentCents),
            servico_favorito: c.favoriteService, profissional: c.preferredStaff, potencial_retorno: c.priorityScore,
            canais_autorizados: [c.consentWhatsapp && c.phone && "whatsapp", c.consentEmail && c.email && "email", c.consentSms && c.phone && "sms"].filter(Boolean),
            descadastrado: !!c.optedOutAt, demonstracao: c.isDemo,
          })),
        } };
      });

    case "recovery_diagnosis":
      return withOrg(orgId, async (tx) => {
        const [items, cmp, o] = [await getActionItems(tx, orgId, s, t), await getMonthComparison(tx, orgId, t), await getOverview(tx, orgId, s)];
        return { data: {
          pendencias: items.map((i) => ({ tipo: i.key, quantidade: i.count, descricao: i.title })),
          retornos_mes_atual: cmp.cur, retornos_mesmo_periodo_mes_passado: cmp.prev,
          receita_mes_atual_reais: reais(cmp.curRev), receita_mesmo_periodo_mes_passado_reais: reais(cmp.prevRev),
          contatados_90_dias: cmp.contacted90, voltaram_90_dias: cmp.recovered90,
          taxa_recuperacao_90_dias: cmp.rate90 === null ? null : `${Math.round(cmp.rate90 * 100)}%`,
          afastados_total: o.byStatus.at_risk + o.byStatus.inactive + o.byStatus.highly_inactive, afastados_com_contato_autorizado: o.contactableLapsed,
          meta_mensal: s.monthlyGoal || null, intervalo_minimo_entre_mensagens_dias: s.frequencyCapDays,
        } };
      });
    case "analyze_patterns":
      return withOrg(orgId, async (tx) => {
        const p = await getInactivityPatterns(tx, orgId);
        const fmt = (rows: { key: string; lapsed: number; total: number; rate: number }[]) =>
          rows.map((r) => ({ grupo: r.key, afastados: r.lapsed, total: r.total, taxa_afastamento: Math.round(r.rate * 1000) / 10 + "%" }));
        return { data: { por_servico: fmt(p.byService), por_profissional: fmt(p.byStaff), por_fidelidade: fmt(p.byLoyalty) } };
      });

    case "create_campaign_draft": {
      if (isSandboxOrg(orgId)) throw new SimulationError();
      if (!can(ctx.role, "campaigns:write")) throw new Error("Seu papel não permite criar campanhas.");
      const r = await createCampaign(orgId, {
        name: input.name as string,
        channel: input.channel as "whatsapp" | "email" | "sms",
        audience: {
          statuses: (input.statuses as CustomerStatus[] | undefined) ?? ["at_risk", "inactive", "highly_inactive"],
          minDaysInactive: input.min_days_inactive as number | undefined,
          maxDaysInactive: input.max_days_inactive as number | undefined,
          minAvgTicketCents: input.min_avg_ticket_reais !== undefined ? Math.round((input.min_avg_ticket_reais as number) * 100) : undefined,
          minPriority: input.min_priority as number | undefined,
          limit: input.limit as number | undefined,
        },
        tone: (input.tone as string | undefined) ?? getSegment(ctx.org.segment).defaultTone,
        offer: (input.offer as string | undefined) ?? null,
        objective: (input.objective as string | undefined) ?? null,
      }, { type: "agent", userId: ctx.userId });
      return {
        data: {
          campanha_id: r.campaign.id, status: "rascunho", publico_total: r.queued + r.skipped,
          elegiveis_para_envio: r.queued, bloqueados_por_regras_de_contato: r.skipped,
          mensagens_geradas_por: r.copy?.generatedBy === "ai" ? "IA" : "modelos do segmento",
          variacoes: r.campaign.variants, estrategia: r.campaign.rationale, aviso: r.notice ?? null,
          proximo_passo: "Revisar e aprovar em Campanhas antes de qualquer envio.",
        },
        action: { type: "campaign_created", campaignId: r.campaign.id, name: r.campaign.name },
      };
    }

    case "campaign_performance":
      return withOrg(orgId, async (tx) => {
        const stats = await getCampaignStats(tx, orgId, input.campaign_id as string | undefined);
        return { data: stats.slice(0, 20).map((c) => ({
          id: c.id, nome: c.name, canal: c.channel, status: c.status, criada_em: c.createdAt.toISOString().slice(0, 10),
          publico: c.audience, bloqueados: c.skipped, enviadas: c.sent, entregues: c.delivered, respostas: c.replied,
          retornaram: c.returned, receita_atribuida_reais: reais(c.revenueCents), taxa_recuperacao: Math.round(c.recoveryRate * 1000) / 10 + "%",
        })) };
      });

    case "recovered_revenue":
      return withOrg(orgId, async (tx) => {
        const period = input.period as string;
        let from = "2000-01-01", to = t;
        if (period === "this_month") from = monthStart(t);
        if (period === "last_month") { to = addDays(monthStart(t), -1); from = monthStart(to); }
        if (period === "last_30_days") from = addDays(t, -29);
        if (period === "last_90_days") from = addDays(t, -89);
        const r = await getRecoveredBetween(tx, orgId, from, to);
        return { data: { periodo: { de: from, ate: to }, clientes_recuperados: r.recovered, receita_recuperada_reais: reais(r.revenueCents), recuperacoes_com_valor_informado: r.withRevenueInformed } };
      });

    case "get_settings":
      return { data: {
        segmento: getSegment(ctx.org.segment).label,
        dias_para_em_risco: s.thresholds.atRiskDays, dias_para_inativo: s.thresholds.inactiveDays, dias_para_altamente_inativo: s.thresholds.highlyInactiveDays,
        usa_ritmo_individual: s.useIndividualRhythm, janela_atribuicao_dias: s.attributionWindowDays,
        intervalo_minimo_entre_mensagens_dias: s.frequencyCapDays, max_mensagens_30_dias: s.maxMessagesPer30Days,
        exige_aprovacao: s.requireApproval, premissas_projecao: s.returnProbability,
      } };
  }
}
