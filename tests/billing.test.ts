/**
 * Cobrança (Asaas) — a API do Asaas é SIMULADA com fetch mockado. Nenhuma chamada de rede, nenhuma cobrança real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { billingEvents, organizations, subscriptions, type Organization, type Subscription } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { normalizeDocument } from "@/lib/billing/asaas";
import { accessState, assertBillingActive, BillingInactiveError, cancelSubscription, handleAsaasEvent, startSubscription } from "@/lib/billing/service";
import { PlanLimitError } from "@/lib/plans";

const DAY = 86_400_000;
let org: Organization, userId: string;

// Estado do "Asaas" simulado
const payments = new Map<string, { id: string; customer: string; subscription: string; status: string; value: number; dueDate: string; invoiceUrl: string; billingType: string }>();
const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
let subSeq = 0;

function mockAsaas() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    expect(u.host).toBe("api-sandbox.asaas.com"); // nunca produção nos testes
    const path = u.pathname.replace(/^\/v3/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init.method), path, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (init.method === "POST" && path === "/customers") return json({ id: "cus_1", name: body.name });
    if (init.method === "POST" && path === "/subscriptions") {
      const id = `sub_${++subSeq}`;
      payments.set(`pay_${subSeq}`, { id: `pay_${subSeq}`, customer: body.customer, subscription: id, status: "PENDING", value: body.value, dueDate: body.nextDueDate, invoiceUrl: `https://sandbox.asaas.com/i/${subSeq}`, billingType: "UNDEFINED" });
      return json({ id, customer: body.customer, value: body.value, nextDueDate: body.nextDueDate, status: "ACTIVE" });
    }
    let m = path.match(/^\/subscriptions\/([^/]+)\/payments$/);
    if (m) return json({ data: [...payments.values()].filter((p) => p.subscription === m![1]) });
    m = path.match(/^\/subscriptions\/([^/]+)$/);
    if (m && init.method === "POST") return json({ id: m[1], value: body.value, status: "ACTIVE" });
    if (m && init.method === "DELETE") return json({ deleted: true, id: m[1] });
    m = path.match(/^\/payments\/([^/]+)$/);
    if (m) { const p = payments.get(m[1]); return p ? json(p) : json({ errors: [{ description: "não encontrado" }] }, 404); }
    return json({ errors: [{ description: `rota não simulada ${path}` }] }, 404);
  }));
}

beforeAll(async () => {
  process.env.ASAAS_API_KEY = "$aact_teste_falso";
  process.env.ASAAS_ENV = "sandbox";
  process.env.BILLING_TRIAL_DAYS = "14";
  mockAsaas();
  await getDb();
  const a = await createAccount({ name: "Dona C", email: "billing@teste.com", password: "senhaSegura123", orgName: "Barbearia C" });
  org = a.org; userId = a.user.id;
});
afterAll(() => { vi.unstubAllGlobals(); delete process.env.ASAAS_API_KEY; });

const sub = async () => (await (await getDb()).select().from(subscriptions).where(eq(subscriptions.orgId, org.id)))[0];
const orgPlan = async () => (await (await getDb()).select().from(organizations).where(eq(organizations.id, org.id)))[0].planId;

describe("documento", () => {
  it("valida CPF e CNPJ pelos dígitos", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeDocument("111.111.111-11")).toBeNull();
    expect(normalizeDocument("529.982.247-26")).toBeNull();
    expect(normalizeDocument("123")).toBeNull();
  });
});

describe("estado de acesso", () => {
  const base = { orgId: "x", planId: "basic", pendingPlanId: null, cancelAtPeriodEnd: false, provider: "asaas", providerCustomerId: null, providerSubscriptionId: null, billingName: null, billingEmail: null, billingDocument: null, createdAt: new Date(), updatedAt: new Date(), trialEndsAt: null, currentPeriodEnd: null } as Subscription;
  const now = Date.now();
  it("teste vigente libera; vencido bloqueia", () => {
    expect(accessState({ ...base, status: "trialing", trialEndsAt: new Date(now + DAY) }).active).toBe(true);
    expect(accessState({ ...base, status: "trialing", trialEndsAt: new Date(now - DAY) }).active).toBe(false);
  });
  it("atraso tem tolerância de 5 dias", () => {
    expect(accessState({ ...base, status: "past_due", currentPeriodEnd: new Date(now - 2 * DAY) }).active).toBe(true);
    expect(accessState({ ...base, status: "past_due", currentPeriodEnd: new Date(now - 6 * DAY) }).active).toBe(false);
  });
  it("cancelada mantém acesso até o fim do período pago", () => {
    expect(accessState({ ...base, status: "canceled", currentPeriodEnd: new Date(now + DAY) }).active).toBe(true);
    expect(accessState({ ...base, status: "canceled", currentPeriodEnd: new Date(now - DAY) }).active).toBe(false);
  });
});

describe("fluxo de assinatura (sandbox simulado)", () => {
  it("cria teste grátis no primeiro acesso e libera recursos", async () => {
    await withOrg(org.id, (tx) => assertBillingActive(tx, org.id));
    const s = await sub();
    expect(s.status).toBe("trialing");
    expect(s.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
  });

  it("rejeita documento inválido sem chamar o Asaas", async () => {
    const before = calls.length;
    await expect(startSubscription({ orgId: org.id, userId, planId: "pro", name: "Barbearia C", email: "c@teste.com", document: "123.456.789-00" })).rejects.toThrow(/inválido/);
    expect(calls.length).toBe(before);
  });

  it("assinar NÃO ativa o plano; usa o preço do servidor", async () => {
    const r = await startSubscription({ orgId: org.id, userId, planId: "pro", name: "Barbearia C", email: "c@teste.com", document: "529.982.247-25" });
    expect(r.invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\//);
    const created = calls.find((c) => c.method === "POST" && c.path === "/subscriptions")!;
    expect(created.body!.value).toBe(349); // plans.price_cents do plano pro / 100
    const s = await sub();
    expect(s.status).toBe("pending");
    expect(s.pendingPlanId).toBe("pro");
    expect(await orgPlan()).toBe("basic");
  });

  it("webhook com status forjado no corpo é ignorado (reconsulta a API)", async () => {
    await handleAsaasEvent({ id: "evt_forjado", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
    expect(await orgPlan()).toBe("basic"); // a API diz PENDING
    expect((await sub()).status).toBe("pending");
  });

  it("pagamento confirmado ativa o plano uma única vez (idempotente)", async () => {
    payments.get("pay_1")!.status = "RECEIVED";
    const r1 = await handleAsaasEvent({ id: "evt_pago", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
    expect(r1).toMatchObject({ action: "activated" });
    const s = await sub();
    expect(s.status).toBe("active");
    expect(s.planId).toBe("pro");
    expect(s.pendingPlanId).toBeNull();
    expect(s.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect(await orgPlan()).toBe("pro");
    const end = s.currentPeriodEnd!.getTime();
    const r2 = await handleAsaasEvent({ id: "evt_pago", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
    expect(r2).toMatchObject({ duplicate: true });
    expect((await sub()).currentPeriodEnd!.getTime()).toBe(end);
    const [e] = await (await getDb()).select().from(billingEvents).where(eq(billingEvents.id, "evt_pago"));
    expect(JSON.stringify(e.payload)).not.toMatch(/cpf|52998224725/);
  });

  it("valor abaixo do preço do plano não ativa", async () => {
    payments.set("pay_x", { ...payments.get("pay_1")!, id: "pay_x", value: 1, status: "RECEIVED" });
    await (await getDb()).update(subscriptions).set({ pendingPlanId: "premium" }).where(eq(subscriptions.orgId, org.id));
    const r = await handleAsaasEvent({ id: "evt_barato", event: "PAYMENT_RECEIVED", payment: { id: "pay_x" } });
    expect(r).toMatchObject({ action: "ignored:value_below_plan" });
    expect(await orgPlan()).toBe("pro");
    await (await getDb()).update(subscriptions).set({ pendingPlanId: null }).where(eq(subscriptions.orgId, org.id));
  });

  it("cobrança de assinatura desconhecida é ignorada", async () => {
    payments.set("pay_alheio", { ...payments.get("pay_1")!, id: "pay_alheio", subscription: "sub_de_outro", status: "RECEIVED" });
    expect(await handleAsaasEvent({ id: "evt_alheio", event: "PAYMENT_RECEIVED", payment: { id: "pay_alheio" } })).toMatchObject({ action: "ignored:unknown_subscription" });
  });

  it("estorno marca atraso; cancelamento mantém acesso até o fim do período", async () => {
    payments.get("pay_1")!.status = "REFUNDED";
    expect(await handleAsaasEvent({ id: "evt_estorno", event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } })).toMatchObject({ action: "reversed" });
    expect((await sub()).status).toBe("past_due");
    payments.get("pay_1")!.status = "RECEIVED";
    await handleAsaasEvent({ id: "evt_pago2", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
    await cancelSubscription(org.id, userId);
    const s = await sub();
    expect(s.cancelAtPeriodEnd).toBe(true);
    expect(accessState(s).active).toBe(true);
  });

  it("sem assinatura em dia bloqueia recursos com erro de plano", async () => {
    await (await getDb()).update(subscriptions).set({ status: "canceled", currentPeriodEnd: new Date(Date.now() - DAY) }).where(eq(subscriptions.orgId, org.id));
    const err = await withOrg(org.id, (tx) => assertBillingActive(tx, org.id)).catch((e) => e);
    expect(err).toBeInstanceOf(BillingInactiveError);
    expect(err).toBeInstanceOf(PlanLimitError);
    expect(String(err.message)).toMatch(/exportação/);
  });
});
