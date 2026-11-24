/** Evolução: etiquetas, filtros avançados, explicação do cliente, central de ações e novas perguntas do agente. */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { campaigns, customers, organizations, recoveries, type Organization } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { customerWhere } from "@/lib/customers";
import { resolveSettings } from "@/lib/settings";
import { classify } from "@/lib/classification";
import { customerInsight } from "@/lib/insights";
import { getActionItems, getMonthComparison } from "@/lib/action-center";
import { runBasicAgent } from "@/lib/ai/basic-agent";
import { addDays, today } from "@/lib/dates";
import { getDb } from "@/db/client";

const T = today();
let org: Organization, other: Organization, userId: string;

beforeAll(async () => {
  const a = await createAccount({ name: "Dona Evo", email: "evo@teste.com", password: "senhaSegura123", orgName: "Salão Evo" });
  const b = await createAccount({ name: "Dono Outro", email: "outro-evo@teste.com", password: "senhaSegura123", orgName: "Outro Evo" });
  const db = await getDb();
  await db.update(organizations).set({ segment: "barbershop", onboardingDone: true }).where(eq(organizations.id, a.org.id));
  [org] = await db.select().from(organizations).where(eq(organizations.id, a.org.id));
  [other] = await db.select().from(organizations).where(eq(organizations.id, b.org.id));
  userId = a.user.id;
  const base = (name: string, days: number, visits: number, spent: number, extra: Partial<typeof customers.$inferInsert> = {}) => ({
    orgId: org.id, name, phone: `+55119${String(Math.abs(name.length * 7919 + days)).padStart(8, "0")}`, lastVisitAt: addDays(T, -days),
    visitCount: visits, totalSpentCents: spent * 100, avgTicketCents: Math.round((spent * 100) / Math.max(1, visits)), ...extra,
  });
  await withOrg(org.id, (tx) => tx.insert(customers).values([
    base("Fiel Vip", 70, 12, 1200, { status: "inactive", consentWhatsapp: true, tags: ["vip"], priorityScore: 90 }),
    base("Sumido Antigo", 200, 2, 100, { status: "highly_inactive", priorityScore: 30 }),
    base("Em Dia", 5, 4, 300, { status: "active", consentWhatsapp: true }),
    base("Descadastrado", 90, 6, 500, { status: "inactive", consentWhatsapp: false, optedOutAt: new Date(), tags: ["vip"] }),
  ]));
  await withOrg(other.id, (tx) => tx.insert(customers).values({ orgId: other.id, name: "Vip De Outra Empresa", tags: ["vip"], visitCount: 50, totalSpentCents: 999900, lastVisitAt: addDays(T, -100), status: "inactive" }));
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
const find = (f: Parameters<typeof customerWhere>[1]) => withOrg(org.id, (tx) => tx.select({ name: customers.name }).from(customers).where(customerWhere(org.id, f)));

describe("filtros avançados e etiquetas", () => {
  it("filtra por etiqueta sem vazar dados de outra empresa", async () => {
    expect(names(await find({ tag: "vip" }))).toEqual(["Descadastrado", "Fiel Vip"]);
  });
  it("filtra por frequência, gasto, dias sem vir e contato autorizado", async () => {
    expect(names(await find({ minVisits: 5 }))).toEqual(["Descadastrado", "Fiel Vip"]);
    expect(names(await find({ minSpentCents: 100000 }))).toEqual(["Fiel Vip"]);
    expect(names(await find({ minDaysInactive: 150 }))).toEqual(["Sumido Antigo"]);
    expect(names(await find({ contactable: true }))).toEqual(["Em Dia", "Fiel Vip"]);
  });
  it("adiciona e remove etiquetas em lote (mesmo SQL da ação)", async () => {
    await withOrg(org.id, (tx) => tx.update(customers).set({ tags: sql`array_append(${customers.tags}, 'retorno')` })
      .where(and(eq(customers.orgId, org.id), eq(customers.name, "Sumido Antigo"))));
    expect(names(await find({ tag: "retorno" }))).toEqual(["Sumido Antigo"]);
    await withOrg(org.id, (tx) => tx.update(customers).set({ tags: sql`array_remove(${customers.tags}, 'retorno')` }).where(eq(customers.orgId, org.id)));
    expect(await find({ tag: "retorno" })).toHaveLength(0);
  });
});

describe("explicação do cliente (motivos + próximo passo)", () => {
  const s = () => resolveSettings(org);
  const get = async (name: string) => (await withOrg(org.id, (tx) => tx.select().from(customers).where(and(eq(customers.orgId, org.id), eq(customers.name, name)))))[0];
  it("sugere mensagem para afastado com autorização", async () => {
    const c = await get("Fiel Vip");
    const i = customerInsight(c, classify(c, s(), T), s(), { daysSinceLastMessage: null, replied: false });
    expect(i.next.action).toBe("campaign");
    expect(i.reasons.join(" ")).toMatch(/70 dias sem vir/);
    expect(i.reasons.join(" ")).toMatch(/já veio 12 vezes/);
  });
  it("respeita intervalo mínimo, falta de autorização e descadastro", async () => {
    const vip = await get("Fiel Vip");
    expect(customerInsight(vip, classify(vip, s(), T), s(), { daysSinceLastMessage: 2, replied: false }).next.action).toBe("wait");
    const sem = await get("Sumido Antigo");
    expect(customerInsight(sem, classify(sem, s(), T), s(), { daysSinceLastMessage: null, replied: false }).next.action).toBe("consent");
    const out = await get("Descadastrado");
    expect(customerInsight(out, classify(out, s(), T), s(), { daysSinceLastMessage: null, replied: false }).next.action).toBe("none");
    const ok = await get("Em Dia");
    expect(customerInsight(ok, classify(ok, s(), T), s(), { daysSinceLastMessage: null, replied: false }).next.action).toBe("none");
  });
});

describe("central de ações e comparação mensal", () => {
  it("lista pendências reais e nada inventado", async () => {
    const items = await withOrg(org.id, (tx) => getActionItems(tx, org.id, resolveSettings(org), T));
    const keys = items.map((i) => i.key);
    expect(keys).toContain("ready"); // Fiel Vip
    expect(items.find((i) => i.key === "ready")!.count).toBe(1);
    expect(items.find((i) => i.key === "consent")!.count).toBe(1); // Sumido Antigo (descadastrado não conta)
    expect(keys).not.toContain("approval");
    await withOrg(org.id, (tx) => tx.insert(campaigns).values({ orgId: org.id, name: "Teste", channel: "whatsapp", status: "pending_approval", createdBy: userId } as typeof campaigns.$inferInsert));
    const after = await withOrg(org.id, (tx) => getActionItems(tx, org.id, resolveSettings(org), T));
    expect(after.find((i) => i.key === "approval")?.count).toBe(1);
  });
  it("compara retornos deste mês com o mesmo período do mês passado", async () => {
    const [c] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.orgId, org.id)).limit(1));
    await withOrg(org.id, (tx) => tx.insert(recoveries).values({ orgId: org.id, customerId: c.id, returnedAt: T, revenueCents: 8000 } as typeof recoveries.$inferInsert));
    const cmp = await withOrg(org.id, (tx) => getMonthComparison(tx, org.id, T));
    expect(cmp.cur).toBe(1);
    expect(cmp.curRev).toBe(8000);
    expect(cmp.prev).toBe(0);
    expect(cmp.rate90).toBeNull(); // nenhuma mensagem enviada ainda
  });
});

describe("agente (modo básico): novas perguntas", () => {
  const ctx = () => ({ org, userId, role: "owner" as const });
  it("responde quem recuperar primeiro, há mais tempo e mais frequentes", async () => {
    expect((await runBasicAgent(ctx(), "Quais clientes devo tentar recuperar primeiro?")).text).toMatch(/maior potencial[\s\S]*Fiel/);
    const longest = (await runBasicAgent(ctx(), "Quais clientes estão há mais tempo sem retornar?")).text;
    expect(longest.indexOf("Sumido")).toBeLessThan(longest.indexOf("Fiel"));
    const freq = await runBasicAgent(ctx(), "Quais clientes costumam comprar com maior frequência?");
    expect(freq.toolsUsed).toContain("find_customers");
    expect(freq.text).toMatch(/mais frequentam/);
    expect(freq.text).not.toMatch(/Outra Empresa/);
  });
  it("diagnostica como melhorar a taxa de recuperação com dados reais", async () => {
    const r = await runBasicAgent(ctx(), "O que posso fazer para melhorar minha taxa de recuperação?");
    expect(r.toolsUsed).toContain("recovery_diagnosis");
    expect(r.text).toMatch(/Aprove as campanhas paradas/);
    expect(r.text).toMatch(/Peça autorização de contato/);
  });
  it("cria campanha para quem não volta há 60 dias e mantém a pergunta de melhor campanha", async () => {
    const r = await runBasicAgent(ctx(), "Crie uma campanha para clientes que não retornam há 60 dias.");
    expect(r.actions[0]?.type).toBe("campaign_created");
    const best = await runBasicAgent(ctx(), "Qual campanha apresentou melhor resultado?");
    expect(best.toolsUsed).toContain("campaign_performance");
  });
});
