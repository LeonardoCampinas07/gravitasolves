/**
 * SIMULAÇÃO pública ("Ver simulação" na landing).
 *
 * Uma empresa fictícia — "Barbearia Exemplo" — com o plano Profissional ativo e dados de
 * demonstração (clientes marcados is_demo = true, telefones e e-mails inventados em @exemplo.com).
 * Quem entra na simulação só consegue OLHAR: toda server action é recusada em requireCtx,
 * o agente responde sem gravar nada e nenhuma mensagem real é enviada.
 *
 * Os dados são recriados uma vez por dia (datas relativas a hoje), então o painel nunca envelhece.
 * A empresa não tem slug (sem página pública de agendamento) e é ignorada pelas rotinas diárias.
 */
import { asc, eq, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/db/client";
import {
  appointments, automations, billingPayments, campaignMessages, campaigns, customers, inboundMessages,
  memberships, organizations, subscriptions, users, type Channel, type CustomerStatus, type MessageStatus, type Organization,
} from "@/db/schema";
import { addDays, dayOf, today } from "./dates";
import { buildDemoRows } from "./demo";
import { importRows } from "./import/run";
import { reclassifyOrg, recordVisit } from "./customers";
import { composeBody } from "./campaigns/service";
import { templateVariants } from "./campaigns/templates";
import { resolveSettings } from "./settings";

export const SANDBOX_ORG_ID = "5e5e5e5e-0000-4000-8000-000000000001";
export const SANDBOX_USER_ID = "5e5e5e5e-0000-4000-8000-000000000002";
export const SIM_COOKIE = "gravita_sim";
export const SANDBOX_NAME = "Barbearia Exemplo";
export const SIM_BLOCKED_MESSAGE = "Isto é uma simulação: nada pode ser criado, alterado ou enviado. Crie sua conta para usar de verdade.";

/** Aumente ao mudar os dados fictícios: a simulação é recriada na próxima visita. */
const SANDBOX_VERSION = 3;

export const isSandboxOrg = (orgId: string | null | undefined) => orgId === SANDBOX_ORG_ID;

export class SimulationError extends Error {
  constructor() { super(SIM_BLOCKED_MESSAGE); this.name = "SimulationError"; }
}

let memo: { day: string; p: Promise<Organization> } | null = null;

/** Garante que a empresa da simulação existe e foi montada hoje. Seguro para chamadas concorrentes. */
export function ensureSandbox(): Promise<Organization> {
  const day = today();
  if (memo?.day === day) return memo.p;
  const p = build(day).catch((e) => { memo = null; throw e; });
  memo = { day, p };
  return p;
}

async function current(tx: Tx | Awaited<ReturnType<typeof getDb>>, day: string) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, SANDBOX_ORG_ID));
  const version = (org?.settings as { sandboxVersion?: number } | undefined)?.sandboxVersion;
  return org && dayOf(org.createdAt) === day && version === SANDBOX_VERSION ? org : null;
}

async function build(day: string): Promise<Organization> {
  const db = await getDb();
  const ok = await current(db, day);
  if (ok) return ok;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gravita_sandbox'))`);
    const again = await current(tx, day);
    if (again) return again;
    await tx.execute(sql`select set_config('app.current_org', ${SANDBOX_ORG_ID}, true)`);
    // Recria do zero: apagar a empresa remove em cascata todos os dados fictícios dela.
    await tx.delete(organizations).where(eq(organizations.id, SANDBOX_ORG_ID));
    await tx.insert(users).values({
      id: SANDBOX_USER_ID, email: "visitante@simulacao.gravitasolves.invalid", name: "Visitante",
      passwordHash: "disabled", // não é um hash scrypt → impossível entrar com senha
      emailVerifiedAt: new Date(),
    }).onConflictDoNothing();
    const [org] = await tx.insert(organizations).values({
      id: SANDBOX_ORG_ID, name: SANDBOX_NAME, segment: "barbershop", baseSize: "100-500", planId: "pro",
      settings: { signature: "Equipe Barbearia Exemplo", sandboxVersion: SANDBOX_VERSION } as Organization["settings"], onboardingStep: 7, onboardingDone: true, slug: null,
    }).returning();
    await tx.insert(memberships).values({ userId: SANDBOX_USER_ID, orgId: org.id, role: "owner" });
    await seed(tx, org, day);
    return org;
  });
}

/** Momento do dia `d` às `h` horas (horário de Brasília). */
const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);

async function seed(tx: Tx, org: Organization, t: string) {
  const s = resolveSettings(org);
  await importRows(tx, org, buildDemoRows("barbershop", 180, t), {
    filename: "simulacao-barbearia-exemplo", source: "demo", userId: SANDBOX_USER_ID, isDemo: true,
    mapping: {
      name: "Nome", phone: "Telefone", email: "E-mail", lastVisit: "Última visita", firstVisit: "Primeira visita",
      visitCount: "Quantidade de visitas", avgTicket: "Ticket médio", favoriteService: "Serviço mais utilizado",
      preferredStaff: "Profissional", consentWhatsapp: "Aceita WhatsApp", consentEmail: "Aceita e-mail",
    },
  });
  await reclassifyOrg(tx, org, t);

  // Assinatura do plano do meio (Profissional), já paga — nada disso passa pelo Asaas.
  const periodStart = addDays(t, -10);
  await tx.insert(subscriptions).values({
    orgId: org.id, status: "active", planId: "pro", currentPeriodEnd: at(addDays(periodStart, 30), 23, 59),
    provider: "simulacao", billingName: SANDBOX_NAME,
  });
  await tx.insert(billingPayments).values({
    id: `simulacao-${t}`, orgId: org.id, planId: "pro", status: "RECEIVED", valueCents: 34900,
    billingType: "PIX", dueDate: periodStart, paidAt: at(periodStart, 9, 12),
  }).onConflictDoNothing();

  const all = await tx.select().from(customers).where(eq(customers.orgId, org.id)).orderBy(asc(customers.lastVisitAt));
  const used = new Set<string>();
  const pick = (n: number, ok: (c: (typeof all)[number]) => boolean) => {
    const out = all.filter((c) => !used.has(c.id) && ok(c)).slice(0, n);
    out.forEach((c) => used.add(c.id));
    return out;
  };
  const lapsedBefore = (d: string) => (c: (typeof all)[number]) => !!c.lastVisitAt && c.lastVisitAt < d;

  type Spec = {
    name: string; channel: Channel; daysAgo: number; statuses: CustomerStatus[]; offer: string | null;
    list: typeof all; returns: number; createdByType: "user" | "agent" | "automation"; objective: string;
  };
  const specs: Spec[] = [
    {
      name: "Volta às aulas — sumidos há mais de 2 meses", channel: "whatsapp", daysAgo: 34, statuses: ["inactive", "highly_inactive"],
      offer: "10% de desconto no corte", returns: 9, createdByType: "user", objective: "Trazer de volta quem não aparece há meses",
      list: pick(40, (c) => c.consentWhatsapp && !!c.phone && lapsedBefore(addDays(t, -50))(c)),
    },
    {
      name: "Clientes em risco — lembrete amigável", channel: "whatsapp", daysAgo: 13, statuses: ["at_risk"],
      offer: null, returns: 5, createdByType: "automation", objective: "Lembrar quem está passando do intervalo normal",
      list: pick(26, (c) => c.consentWhatsapp && !!c.phone && lapsedBefore(addDays(t, -20))(c)),
    },
    {
      name: "E-mail: barba de graça na volta", channel: "email", daysAgo: 21, statuses: ["inactive"],
      offer: "barba de cortesia no próximo corte", returns: 3, createdByType: "user", objective: "Reativar pelo e-mail quem não usa WhatsApp",
      list: pick(18, (c) => c.consentEmail && !!c.email && lapsedBefore(addDays(t, -30))(c)),
    },
  ];

  const statusMix: MessageStatus[] = ["read", "delivered", "read", "replied", "sent", "read", "delivered", "failed", "read", "replied"];
  const replies = ["Opa! Tem horário sábado de manhã?", "Quero sim, pode marcar com o Rafael", "Valeu pelo lembrete, passo aí essa semana", "Tem vaga amanhã depois das 18h?"];

  for (const sp of specs) {
    const sentDay = addDays(t, -sp.daysAgo);
    const variants = templateVariants(org.segment, sp.statuses, sp.offer);
    const [camp] = await tx.insert(campaigns).values({
      orgId: org.id, name: sp.name, objective: sp.objective, audience: { statuses: sp.statuses }, channel: sp.channel,
      offer: sp.offer, variants, emailSubject: sp.channel === "email" ? "Sentimos sua falta por aqui" : null,
      status: "completed", requiresApproval: true, approvedBy: SANDBOX_USER_ID, approvedAt: at(sentDay, 9, 40),
      generatedBy: "template", createdByType: sp.createdByType, createdBy: SANDBOX_USER_ID,
      createdAt: at(addDays(sentDay, -1), 17), completedAt: at(sentDay, 10, 5),
    }).returning();
    let replyN = 0;
    for (let i = 0; i < sp.list.length; i++) {
      const c = sp.list[i];
      // As primeiras pessoas da lista voltam; elas aparecem como lidas/respondidas.
      const st: MessageStatus = i < sp.returns ? (i % 3 === 0 ? "replied" : "read") : statusMix[i % statusMix.length];
      const sent = st !== "failed";
      const sentAt = at(sentDay, 10, i % 50);
      const [msg] = await tx.insert(campaignMessages).values({
        orgId: org.id, campaignId: camp.id, customerId: c.id, channel: sp.channel, variantIndex: i % variants.length,
        body: composeBody(variants[i % variants.length], c, org, s, sp.channel, sp.offer),
        status: st, sentVia: "api", providerMessageId: sent ? `simulacao-${camp.id.slice(0, 8)}-${i}` : null,
        error: sent ? null : "Número sem WhatsApp (simulação)",
        sentAt: sent ? sentAt : null,
        deliveredAt: sent && st !== "sent" ? new Date(sentAt.getTime() + 60_000) : null,
        readAt: st === "read" || st === "replied" ? new Date(sentAt.getTime() + 40 * 60_000) : null,
        repliedAt: st === "replied" ? new Date(sentAt.getTime() + 95 * 60_000) : null,
        createdAt: at(addDays(sentDay, -1), 17),
      }).returning();
      if (sent) await tx.update(customers).set({ lastContactAt: sentAt, contactCount: sql`${customers.contactCount} + 1` }).where(eq(customers.id, c.id));
      if (st === "replied") {
        await tx.insert(inboundMessages).values({
          orgId: org.id, customerId: c.id, campaignMessageId: msg.id, channel: sp.channel,
          body: replies[replyN++ % replies.length], receivedAt: new Date(sentAt.getTime() + 95 * 60_000),
        });
      }
    }
    // Retornos atribuídos à campanha (viram "recuperados" com receita no painel de Resultados).
    for (let i = 0; i < Math.min(sp.returns, sp.list.length); i++) {
      const c = sp.list[i];
      const visitDay = addDays(sentDay, 2 + ((i * 3) % Math.max(3, sp.daysAgo - 3)));
      if (visitDay > t) continue;
      const amount = Math.max(4500, Math.round((c.avgTicketCents || 6000) / 500) * 500);
      await recordVisit(tx, org, c.id, { date: visitDay, amountCents: amount, description: c.favoriteService ?? "Corte", source: "manual" });
    }
  }

  // Campanha preparada pelo agente ontem, aguardando aprovação humana (nada foi enviado).
  // Pode incluir quem recebeu a campanha de mais de 30 dias atrás e não voltou.
  const fresh = await tx.select().from(customers).where(eq(customers.orgId, org.id)).orderBy(asc(customers.lastVisitAt));
  const recent = new Set(specs.filter((sp) => sp.daysAgo < 30).flatMap((sp) => sp.list.map((c) => c.id)));
  const pendingList = fresh.filter((c) => c.consentWhatsapp && !!c.phone && !recent.has(c.id) && ["inactive", "highly_inactive"].includes(c.status)).slice(0, 15);
  if (pendingList.length) {
    const offer = "corte + barba por R$ 70";
    const variants = templateVariants(org.segment, ["inactive", "highly_inactive"], offer);
    const [camp] = await tx.insert(campaigns).values({
      orgId: org.id, name: "Agente: reconquistar quem gastava mais", objective: "Clientes de ticket alto que pararam de vir",
      audience: { statuses: ["inactive", "highly_inactive"], minAvgTicketCents: 7000 }, channel: "whatsapp", offer, variants,
      status: "pending_approval", requiresApproval: true, generatedBy: "template", createdByType: "agent", createdBy: SANDBOX_USER_ID,
      rationale: "Esses clientes tinham ticket acima da média e estão sumidos. Uma oferta de combo costuma funcionar bem para eles.",
      createdAt: at(addDays(t, -1), 18, 20),
    }).returning();
    await tx.insert(campaignMessages).values(pendingList.map((c, i) => ({
      orgId: org.id, campaignId: camp.id, customerId: c.id, channel: "whatsapp" as const, variantIndex: i % variants.length,
      body: composeBody(variants[i % variants.length], c, org, s, "whatsapp", offer), status: "queued" as const,
      createdAt: at(addDays(t, -1), 18, 20),
    })));
  }
  await tx.insert(campaigns).values({
    orgId: org.id, name: "Rascunho: aniversariantes do mês", objective: "Ideia para testar mais tarde", channel: "whatsapp",
    audience: { statuses: ["at_risk"] }, variants: templateVariants(org.segment, ["at_risk"], null), status: "draft",
    generatedBy: "template", createdByType: "user", createdBy: SANDBOX_USER_ID, createdAt: at(addDays(t, -3), 11),
  });

  await tx.insert(automations).values([
    { orgId: org.id, name: "Lembrete automático para clientes em risco", triggerStatus: "at_risk", channel: "whatsapp", tone: "acolhedor", requiresApproval: true, enabled: true, lastRunAt: at(addDays(t, -13), 8) },
    { orgId: org.id, name: "Oferta para quem sumiu há muito tempo", triggerStatus: "highly_inactive", channel: "email", tone: "direto", offer: "15% de desconto", requiresApproval: true, enabled: false },
  ]);

  // Agenda: pedidos do link de agendamento, horários confirmados e atendimentos já feitos.
  const regulars = all.filter((c) => c.status === "active").slice(-8);
  const svc = ["Corte", "Corte + barba", "Barba", "Pigmentação"];
  const staff = ["Rafael", "Thiago", "Marcos"];
  const price = [5000, 8000, 3500, 9000];
  const appts: (typeof appointments.$inferInsert)[] = [
    { orgId: org.id, scheduledFor: at(addDays(t, 1), 10), service: "Corte + barba", staff: "Rafael", status: "requested", source: "booking_page", contactName: "Gustavo Martins", contactPhone: "+55 (11) 90000-0101", notes: "Pedido feito pelo link (simulação)" },
    { orgId: org.id, scheduledFor: at(addDays(t, 2), 17, 30), service: "Corte", staff: "Thiago", status: "requested", source: "booking_page", contactName: "Enzo Ribeiro", contactPhone: "+55 (11) 90000-0102" },
  ];
  regulars.forEach((c, i) => {
    const future = i < 4;
    const day = future ? addDays(t, i % 3) : addDays(t, -1 - i);
    appts.push({
      orgId: org.id, customerId: c.id, scheduledFor: at(day, 9 + i, i % 2 ? 30 : 0), service: svc[i % 4], staff: staff[i % 3],
      status: future ? "confirmed" : "done", amountCents: price[i % 4], source: "manual",
    });
  });
  await tx.insert(appointments).values(appts);

  await reclassifyOrg(tx, org, t);
}
