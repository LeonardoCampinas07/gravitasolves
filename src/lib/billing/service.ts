/**
 * Assinaturas da plataforma (o que o estabelecimento paga à GravitaSolves).
 *
 * Regras de segurança:
 * - O plano só muda quando o WEBHOOK do Asaas confirma o pagamento e a cobrança é
 *   reconsultada na API do Asaas (nunca pela resposta do navegador).
 * - Valores sempre vêm da tabela `plans` no servidor — o cliente nunca envia preço.
 * - O bloqueio por falta de pagamento só vale quando a cobrança está configurada
 *   (ASAAS_API_KEY) ou BILLING_ENFORCE=true. Em desenvolvimento nada muda.
 * - Conta sem assinatura ativa continua podendo VER e EXPORTAR os próprios dados (LGPD);
 *   ficam bloqueados IA, envios, importações e automações.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, type Tx } from "@/db/client";
import { billingEvents, billingPayments, organizations, plans, subscriptions, type Subscription } from "@/db/schema";
import { audit } from "@/lib/audit";
import { PlanLimitError } from "@/lib/plans";
import { asaas, asaasConfigured, normalizeDocument, type AsaasPayment } from "./asaas";

export class BillingInactiveError extends PlanLimitError {}

const DAY = 86_400_000;
export const trialDays = () => Math.max(0, Number(process.env.BILLING_TRIAL_DAYS ?? 7) || 0);
export const graceDays = () => Math.max(0, Number(process.env.BILLING_GRACE_DAYS ?? 3) || 0);
export const billingEnforced = () => process.env.BILLING_ENFORCE === "true" || (process.env.BILLING_ENFORCE !== "false" && asaasConfigured());

type DbLike = Tx | Awaited<ReturnType<typeof getDb>>;

/** Lê a assinatura; cria o período de teste no primeiro acesso. */
export async function getSubscription(db: DbLike, orgId: string, planId: string): Promise<Subscription> {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (s) return s;
  const [created] = await db.insert(subscriptions).values({
    orgId, planId, status: "trialing", trialEndsAt: new Date(Date.now() + trialDays() * DAY),
  }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)))[0];
}

export interface AccessState {
  active: boolean;
  status: Subscription["status"];
  /** Texto curto para o usuário. */
  label: string;
  /** Data relevante (fim do teste, vencimento, fim do acesso). */
  until: Date | null;
  tone: "success" | "warn" | "danger" | "neutral";
}

export function accessState(s: Subscription, now = new Date()): AccessState {
  const t = now.getTime();
  const periodOk = s.currentPeriodEnd && s.currentPeriodEnd.getTime() > t;
  switch (s.status) {
    case "active":
      if (s.cancelAtPeriodEnd) return { active: Boolean(periodOk), status: periodOk ? "active" : "expired", label: periodOk ? "Cancelada — acesso até o fim do período pago" : "Assinatura encerrada", until: s.currentPeriodEnd, tone: periodOk ? "warn" : "danger" };
      if (periodOk || !s.currentPeriodEnd) return { active: true, status: "active", label: "Assinatura ativa", until: s.currentPeriodEnd, tone: "success" };
      // Período venceu e a renovação ainda não foi confirmada: tolerância.
      if (s.currentPeriodEnd.getTime() + graceDays() * DAY > t) return { active: true, status: "past_due", label: "Pagamento da renovação pendente", until: new Date(s.currentPeriodEnd.getTime() + graceDays() * DAY), tone: "warn" };
      return { active: false, status: "past_due", label: "Pagamento em atraso", until: s.currentPeriodEnd, tone: "danger" };
    case "past_due": {
      const base = s.currentPeriodEnd?.getTime() ?? t;
      const graceEnd = base + graceDays() * DAY;
      return graceEnd > t
        ? { active: true, status: "past_due", label: "Pagamento em atraso — regularize para não perder o acesso", until: new Date(graceEnd), tone: "warn" }
        : { active: false, status: "past_due", label: "Pagamento em atraso", until: new Date(graceEnd), tone: "danger" };
    }
    case "trialing":
    case "pending": {
      // "pending" = assinou e aguarda o 1º pagamento; mantém o teste enquanto ele durar.
      if (periodOk) return { active: true, status: "active", label: "Assinatura ativa", until: s.currentPeriodEnd, tone: "success" };
      const ok = s.trialEndsAt && s.trialEndsAt.getTime() > t;
      if (ok) return { active: true, status: s.status, label: s.status === "pending" ? "Aguardando o primeiro pagamento" : "Período de teste", until: s.trialEndsAt, tone: "neutral" };
      return { active: false, status: "expired", label: s.status === "pending" ? "Aguardando pagamento" : "Período de teste encerrado", until: s.trialEndsAt, tone: "danger" };
    }
    case "canceled":
      return periodOk
        ? { active: true, status: "canceled", label: "Cancelada — acesso até o fim do período pago", until: s.currentPeriodEnd, tone: "warn" }
        : { active: false, status: "canceled", label: "Assinatura cancelada", until: s.currentPeriodEnd, tone: "danger" };
    default:
      return { active: false, status: "expired", label: "Assinatura encerrada", until: null, tone: "danger" };
  }
}

/** Bloqueia recursos pagos quando a assinatura não está em dia (só com cobrança ativada). */
export async function assertBillingActive(tx: Tx, orgId: string) {
  if (!billingEnforced()) return;
  const [org] = await tx.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new Error("Empresa não encontrada.");
  const state = accessState(await getSubscription(tx, orgId, org.planId));
  if (!state.active)
    throw new BillingInactiveError(`${state.label}. Regularize a assinatura em Configurações → Plano para usar este recurso. Seus dados continuam disponíveis para consulta e exportação.`);
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function loadPlan(db: DbLike, planId: string) {
  const [p] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.active, true)));
  if (!p) throw new Error("Plano inválido.");
  return p;
}

/**
 * Cria (ou altera) a assinatura no Asaas. Não ativa nada: devolve o link da fatura.
 * A ativação acontece só no webhook, depois da confirmação do pagamento.
 */
export async function startSubscription(input: { orgId: string; userId: string; planId: string; name: string; email: string; document: string }) {
  if (!asaasConfigured()) throw new Error("A cobrança ainda não está configurada neste servidor (ASAAS_API_KEY).");
  const doc = normalizeDocument(input.document);
  if (!doc) throw new Error("CPF ou CNPJ inválido.");
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId));
  const plan = await loadPlan(db, input.planId);
  const sub = await getSubscription(db, input.orgId, org.planId);
  const value = plan.priceCents / 100;

  let customerId = sub.providerCustomerId;
  if (!customerId) customerId = (await asaas.createCustomer({ name: input.name, email: input.email, cpfCnpj: doc, externalReference: input.orgId })).id;

  let providerSubscriptionId = sub.providerSubscriptionId;
  const live = providerSubscriptionId && (sub.status === "active" || sub.status === "past_due" || sub.status === "pending") && !sub.cancelAtPeriodEnd;
  if (live && providerSubscriptionId) {
    // Troca de plano: altera o valor das próximas cobranças; o plano muda quando a próxima for paga.
    await asaas.updateSubscription(providerSubscriptionId, { value, description: `GravitaSolves — plano ${plan.name}` });
    await db.update(subscriptions).set({ pendingPlanId: plan.id === org.planId ? null : plan.id, updatedAt: new Date() }).where(eq(subscriptions.orgId, input.orgId));
  } else {
    const created = await asaas.createSubscription({
      customer: customerId, value, nextDueDate: today(),
      description: `GravitaSolves — plano ${plan.name}`, externalReference: input.orgId,
    });
    providerSubscriptionId = created.id;
    await db.update(subscriptions).set({
      status: sub.status === "trialing" || sub.status === "expired" || sub.status === "canceled" ? "pending" : sub.status,
      pendingPlanId: plan.id, cancelAtPeriodEnd: false, providerCustomerId: customerId, providerSubscriptionId,
      billingName: input.name, billingEmail: input.email, billingDocument: doc, updatedAt: new Date(),
    }).where(eq(subscriptions.orgId, input.orgId));
  }
  await syncPayments(input.orgId, providerSubscriptionId!);
  await db.transaction((tx) => audit(tx, { orgId: input.orgId, actorType: "user", actorId: input.userId, action: live ? "billing.change_plan" : "billing.subscribe", entity: "subscription", entityId: providerSubscriptionId!, metadata: { planId: plan.id } }));
  const [open] = await db.select().from(billingPayments)
    .where(and(eq(billingPayments.orgId, input.orgId), eq(billingPayments.subscriptionId, providerSubscriptionId!)))
    .orderBy(desc(billingPayments.dueDate)).limit(5);
  return { invoiceUrl: open && !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(open.status) ? open.invoiceUrl : null, changedOnly: Boolean(live) };
}

/** Cancela a renovação. O acesso continua até o fim do período já pago. */
export async function cancelSubscription(orgId: string, userId: string) {
  const db = await getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (!sub?.providerSubscriptionId) throw new Error("Não há assinatura para cancelar.");
  await asaas.deleteSubscription(sub.providerSubscriptionId);
  const paid = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now();
  await db.update(subscriptions).set({ status: paid ? "active" : "canceled", cancelAtPeriodEnd: true, pendingPlanId: null, updatedAt: new Date() }).where(eq(subscriptions.orgId, orgId));
  await db.transaction((tx) => audit(tx, { orgId, actorType: "user", actorId: userId, action: "billing.cancel", entity: "subscription", entityId: sub.providerSubscriptionId! }));
}

/** Copia as cobranças da assinatura para exibição (status é só informativo; quem ativa é o webhook). */
export async function syncPayments(orgId: string, providerSubscriptionId: string) {
  const db = await getDb();
  const { data } = await asaas.listSubscriptionPayments(providerSubscriptionId);
  for (const p of data ?? []) await upsertPayment(db, orgId, p);
}

async function upsertPayment(db: DbLike, orgId: string, p: AsaasPayment, planId?: string | null) {
  const row = {
    orgId, subscriptionId: p.subscription ?? null, status: p.status, valueCents: Math.round(p.value * 100),
    billingType: p.billingType ?? null, dueDate: p.dueDate ?? null, invoiceUrl: p.invoiceUrl ?? null,
    paidAt: p.confirmedDate || p.paymentDate || p.clientPaymentDate ? new Date(`${p.confirmedDate || p.paymentDate || p.clientPaymentDate}T12:00:00-03:00`) : null,
    updatedAt: new Date(),
  };
  await db.insert(billingPayments).values({ id: p.id, planId: planId ?? null, ...row })
    .onConflictDoUpdate({ target: billingPayments.id, set: planId ? { ...row, planId } : row });
}

const PAID = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

/**
 * Processa um evento do webhook do Asaas. Idempotente (billing_events.id).
 * Nunca confia no corpo recebido: reconsulta a cobrança na API e confere assinatura, empresa e valor.
 */
export async function handleAsaasEvent(evt: { id?: string; event?: string; payment?: { id?: string }; subscription?: { id?: string } }) {
  const db = await getDb();
  const eventId = String(evt.id ?? `${evt.event}:${evt.payment?.id ?? evt.subscription?.id ?? ""}`);
  const event = String(evt.event ?? "");
  const inserted = await db.insert(billingEvents).values({ id: eventId, event, payload: redact(evt) }).onConflictDoNothing().returning();
  if (!inserted.length) {
    const [prev] = await db.select().from(billingEvents).where(eq(billingEvents.id, eventId));
    if (prev?.processedAt) return { duplicate: true };
  }
  try {
    const result = await processEvent(db, event, evt);
    await db.update(billingEvents).set({ processedAt: new Date(), orgId: result.orgId ?? null, error: null }).where(eq(billingEvents.id, eventId));
    return result;
  } catch (e) {
    await db.update(billingEvents).set({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).where(eq(billingEvents.id, eventId));
    throw e;
  }
}

async function processEvent(db: DbLike, event: string, evt: { payment?: { id?: string }; subscription?: { id?: string } }): Promise<{ orgId?: string; action: string }> {
  if (event.startsWith("PAYMENT_") && evt.payment?.id) {
    const p = await asaas.getPayment(evt.payment.id); // fonte da verdade
    if (!p.subscription) return { action: "ignored:no_subscription" };
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, p.subscription));
    if (!sub) return { action: "ignored:unknown_subscription" };
    const targetPlanId = sub.pendingPlanId ?? sub.planId;
    const plan = await loadPlan(db, targetPlanId);
    await upsertPayment(db, sub.orgId, p, targetPlanId);

    if (PAID.has(p.status) && !p.deleted) {
      if (Math.round(p.value * 100) < plan.priceCents)
        return { orgId: sub.orgId, action: "ignored:value_below_plan" };
      const due = p.dueDate ? new Date(`${p.dueDate}T00:00:00-03:00`) : new Date();
      const from = new Date(Math.max(due.getTime(), sub.currentPeriodEnd?.getTime() ?? 0, Date.now() - 2 * DAY));
      const periodEnd = addMonth(from);
      await db.transaction(async (tx) => {
        await tx.update(subscriptions).set({ status: "active", planId: plan.id, pendingPlanId: null, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, updatedAt: new Date() }).where(eq(subscriptions.orgId, sub.orgId));
        await tx.update(organizations).set({ planId: plan.id }).where(eq(organizations.id, sub.orgId));
        await audit(tx, { orgId: sub.orgId, actorType: "system", action: "billing.payment_confirmed", entity: "payment", entityId: p.id, metadata: { planId: plan.id, valueCents: Math.round(p.value * 100) } });
      });
      return { orgId: sub.orgId, action: "activated" };
    }
    if (p.status === "OVERDUE") {
      if (sub.status === "active") await db.update(subscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscriptions.orgId, sub.orgId));
      return { orgId: sub.orgId, action: "past_due" };
    }
    if (["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(p.status)) {
      await db.transaction(async (tx) => {
        await tx.update(subscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscriptions.orgId, sub.orgId));
        await audit(tx, { orgId: sub.orgId, actorType: "system", action: "billing.payment_reversed", entity: "payment", entityId: p.id, metadata: { status: p.status } });
      });
      return { orgId: sub.orgId, action: "reversed" };
    }
    return { orgId: sub.orgId, action: `recorded:${p.status}` };
  }
  if (event === "SUBSCRIPTION_DELETED" && evt.subscription?.id) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, evt.subscription.id));
    if (!sub) return { action: "ignored:unknown_subscription" };
    const paid = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now();
    await db.update(subscriptions).set({ status: paid ? "active" : "canceled", cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscriptions.orgId, sub.orgId));
    return { orgId: sub.orgId, action: "canceled" };
  }
  return { action: "ignored" };
}

function addMonth(d: Date) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + 1);
  return r;
}

/** Guarda só o necessário do evento (sem dados pessoais do pagador). */
function redact(evt: Record<string, unknown>): Record<string, unknown> {
  const pick = (o: unknown, keys: string[]) => o && typeof o === "object" ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]])) : undefined;
  return { id: evt.id, event: evt.event, payment: pick(evt.payment, ["id", "status", "value", "subscription", "dueDate"]), subscription: pick(evt.subscription, ["id", "status"]) };
}
