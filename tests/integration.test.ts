import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { campaignMessages, customers, organizations, recoveries, auditLogs, visits, type Organization } from "@/db/schema";
import { authenticate, createAccount, createSession, resolveSession } from "@/lib/auth/core";
import { importRows } from "@/lib/import/run";
import { detectMapping } from "@/lib/import/mapping";
import { getOverview, getCampaignStats } from "@/lib/analytics";
import { resolveSettings } from "@/lib/settings";
import { createCampaign, dispatchCampaign, markManuallySent, transitionCampaign, updateCampaignCopy } from "@/lib/campaigns/service";
import { recordVisit, optOutCustomer, customerWhere } from "@/lib/customers";
import { runBasicAgent } from "@/lib/ai/basic-agent";
import { runTool } from "@/lib/ai/tools";
import { deleteCustomerData, exportCustomerData } from "@/lib/lgpd";
import { loadDemoData } from "@/lib/demo";
import { runAutomations } from "@/lib/jobs";
import { addDays, today } from "@/lib/dates";

const T = today();
let orgA: Organization, orgB: Organization, userA: string, userB: string;

const HEAD = ["Nome", "Telefone", "E-mail", "Última visita", "Visitas", "Total gasto", "Serviço", "Barbeiro", "Aceita WhatsApp"];
function row(name: string, phone: string, daysAgo: number, visits: number, total: number, wa: string, email = "") {
  return Object.fromEntries(HEAD.map((h, i) => [h, [name, phone, email, addDays(T, -daysAgo).split("-").reverse().join("/"), visits, total, "Corte", "Rafael", wa][i]]));
}
const ROWS = [
  row("Ativo Um", "(11) 91111-0001", 3, 10, 600, "sim"),
  row("Risco Dois", "(11) 91111-0002", 20, 8, 480, "sim"),
  row("Inativo Tres", "(11) 91111-0003", 40, 12, 960, "sim", "tres@ex.com"),
  row("Muito Inativo Quatro", "(11) 91111-0004", 90, 4, 200, "não"),
  row("Inativo Cinco", "(11) 91111-0005", 45, 2, 100, "sim"),
  row("Duplicado Cinco", "(11) 91111-0005", 45, 2, 100, "sim"),
  row("", "(11) 91111-0006", 45, 2, 100, "sim"),
];

beforeAll(async () => {
  await getDb();
  const a = await createAccount({ name: "Dona A", email: "a@teste.com", password: "senhaSegura123", orgName: "Barbearia A" });
  const b = await createAccount({ name: "Dono B", email: "b@teste.com", password: "senhaSegura123", orgName: "Clínica B" });
  const db = await getDb();
  [orgA] = await db.update(organizations).set({ segment: "barbershop", settings: { useIndividualRhythm: false } }).where(eq(organizations.id, a.org.id)).returning();
  [orgB] = await db.update(organizations).set({ segment: "dental" }).where(eq(organizations.id, b.org.id)).returning();
  userA = a.user.id; userB = b.user.id;
});

describe("autenticação", () => {
  it("login, sessão e e-mail duplicado", async () => {
    expect(await authenticate("A@teste.com", "senhaSegura123")).toBeTruthy();
    expect(await authenticate("a@teste.com", "errada")).toBeNull();
    await expect(createAccount({ name: "x", email: "a@teste.com", password: "senhaSegura123", orgName: "x" })).rejects.toThrow(/Já existe/);
    const { token } = await createSession(userA, orgA.id);
    const ctx = await resolveSession(token);
    expect(ctx?.org.id).toBe(orgA.id);
    expect(ctx?.role).toBe("owner");
    expect(await resolveSession("token-invalido")).toBeNull();
  });
  it("sessão apontando para empresa da qual o usuário não é membro é recusada", async () => {
    const { token } = await createSession(userA, orgB.id);
    expect(await resolveSession(token)).toBeNull();
  });
});

describe("importação e classificação", () => {
  it("importa, valida, deduplica e classifica", async () => {
    const r = await withOrg(orgA.id, (tx) => importRows(tx, orgA, ROWS, { filename: "base.csv", source: "csv", userId: userA, mapping: detectMapping(HEAD) }));
    expect(r.created).toBe(5);
    expect(r.skipped).toBe(2);
    expect(r.errors.some((e) => e.row === 8 && /Nome/.test(e.message))).toBe(true);
    expect(r.errors.some((e) => e.row === 7 && /Duplicado/.test(e.message))).toBe(true);
    const o = await withOrg(orgA.id, (tx) => getOverview(tx, orgA.id, resolveSettings(orgA)));
    expect(o.total).toBe(5);
    expect(o.byStatus).toMatchObject({ active: 1, at_risk: 1, inactive: 2, highly_inactive: 1 });
    expect(o.projectedRecoverableCents).toBeGreaterThan(0);
  });
  it("reimportar atualiza em vez de duplicar", async () => {
    const r = await withOrg(orgA.id, (tx) => importRows(tx, orgA, [ROWS[0]], { filename: "base2.csv", source: "csv", userId: userA, mapping: detectMapping(HEAD) }));
    expect(r).toMatchObject({ created: 0, updated: 1 });
  });
});

describe("isolamento entre empresas", () => {
  it("consultas da empresa B não enxergam clientes da A", async () => {
    const seen = await withOrg(orgB.id, (tx) => tx.select().from(customers).where(customerWhere(orgB.id, {})));
    expect(seen).toHaveLength(0);
    const o = await withOrg(orgB.id, (tx) => getOverview(tx, orgB.id, resolveSettings(orgB)));
    expect(o.total).toBe(0);
  });
  it("RLS do Postgres bloqueia leitura e escrita cruzada mesmo sem filtro na consulta", async () => {
    const db = await getDb();
    await db.execute(sql`do $$ begin if not exists (select 1 from pg_roles where rolname = 'gravita_app_test') then create role gravita_app_test nologin; end if; end $$`);
    await db.execute(sql`grant usage on schema public to gravita_app_test`);
    await db.execute(sql`grant select, insert, update, delete on all tables in schema public to gravita_app_test`);
    const countAs = (org: string) => db.transaction(async (tx) => {
      await tx.execute(sql`set local role gravita_app_test`);
      await tx.execute(sql`select set_config('app.current_org', ${org}, true)`);
      const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers); // sem filtro de org!
      return Number(r.n);
    });
    expect(await countAs(orgA.id)).toBe(5);
    expect(await countAs(orgB.id)).toBe(0);
    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`set local role gravita_app_test`);
      await tx.execute(sql`select set_config('app.current_org', ${orgB.id}, true)`);
      await tx.insert(customers).values({ orgId: orgA.id, name: "Intruso" });
    })).rejects.toThrow();
  });
  it("ferramentas do agente só acessam a empresa do contexto", async () => {
    const out = await runTool("find_customers", { limit: 50 }, { org: orgB, userId: userB, role: "owner" });
    expect((out.data as { total_encontrado: number }).total_encontrado).toBe(0);
  });
});

describe("campanhas", () => {
  let campaignId: string;
  it("cria rascunho com mensagens personalizadas e aplica consentimento", async () => {
    const r = await createCampaign(orgA.id, { name: "Volta", channel: "whatsapp", audience: {}, offer: "barba de cortesia" }, { type: "user", userId: userA });
    campaignId = r.campaign.id;
    expect(r.campaign.status).toBe("draft");
    expect(r.copy?.generatedBy).toBe("template"); // sem chave de IA nos testes
    expect(r.queued).toBe(3); // risco, inativo três, inativo cinco
    expect(r.skipped).toBe(1); // muito inativo sem consentimento
    const msgs = await withOrg(orgA.id, (tx) => tx.select().from(campaignMessages).where(eq(campaignMessages.campaignId, campaignId)));
    const skipped = msgs.find((m) => m.status === "skipped");
    expect(skipped?.skipReason).toBe("no_consent");
    const q = msgs.find((m) => m.status === "queued")!;
    expect(q.body).toMatch(/SAIR/);
    expect(q.body).not.toMatch(/\{\w+\}/);
  });
  it("edição re-renderiza e exige nova aprovação; gestor não aprova", async () => {
    await updateCampaignCopy(orgA.id, campaignId, { variants: ["Oi {nome}, tudo bem? Que tal voltar ao {estabelecimento}?"] }, { type: "user", userId: userA });
    const [m] = await withOrg(orgA.id, (tx) => tx.select().from(campaignMessages).where(and(eq(campaignMessages.campaignId, campaignId), eq(campaignMessages.status, "queued"))).limit(1));
    expect(m.body).toContain("Barbearia A");
    const c = await transitionCampaign(orgA.id, campaignId, "submit", { type: "user", userId: userA });
    expect(c.status).toBe("pending_approval");
    await expect(transitionCampaign(orgA.id, campaignId, "approve", { type: "agent", userId: userA })).rejects.toThrow(/pessoa/);
    expect((await transitionCampaign(orgA.id, campaignId, "approve", { type: "user", userId: userA })).status).toBe("approved");
  });
  it("sem integração configurada não simula envio", async () => {
    const d = await dispatchCampaign(orgA.id, campaignId, { type: "user", userId: userA });
    expect(d.notConfigured).toBe(true);
    const sent = await withOrg(orgA.id, (tx) => tx.select().from(campaignMessages).where(and(eq(campaignMessages.campaignId, campaignId), sql`${campaignMessages.sentAt} is not null`)));
    expect(sent).toHaveLength(0);
  });
  it("envio assistido + retorno atribuído + receita recuperada", async () => {
    const queued = await withOrg(orgA.id, (tx) => tx.select().from(campaignMessages).where(and(eq(campaignMessages.campaignId, campaignId), eq(campaignMessages.status, "queued"))));
    expect(await markManuallySent(orgA.id, campaignId, queued.map((q) => q.id), { type: "user", userId: userA })).toBe(3);
    const target = queued[0].customerId;
    const { recovery } = await withOrg(orgA.id, (tx) => recordVisit(tx, orgA, target, { date: T, amountCents: 7500, source: "manual" }));
    expect(recovery?.revenueCents).toBe(7500);
    const [c] = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(eq(customers.id, target)));
    expect(c.status).toBe("recovered");
    const [stats] = await withOrg(orgA.id, (tx) => getCampaignStats(tx, orgA.id, campaignId));
    expect(stats).toMatchObject({ sent: 3, returned: 1, revenueCents: 7500, status: "completed" });
    // a mesma mensagem não é atribuída duas vezes
    await withOrg(orgA.id, (tx) => recordVisit(tx, orgA, target, { date: T, amountCents: 5000, source: "manual" }));
    const recs = await withOrg(orgA.id, (tx) => tx.select().from(recoveries).where(eq(recoveries.customerId, target)));
    expect(recs).toHaveLength(1);
  });
  it("cliente que fica inativo ao registrar visita antiga já recebe potencial de retorno", async () => {
    const [n] = await withOrg(orgA.id, (tx) => tx.insert(customers).values({
      orgId: orgA.id, name: "Novo Manual", phone: "+5511911110099", consentWhatsapp: true, legalBasis: "consent", source: "manual",
    }).returning());
    await withOrg(orgA.id, (tx) => recordVisit(tx, orgA, n.id, { date: addDays(T, -45), amountCents: 8000, source: "manual" }));
    const [c] = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(eq(customers.id, n.id)));
    expect(c.status).toBe("inactive");
    expect(c.priorityScore).toBeGreaterThan(0);
    await withOrg(orgA.id, async (tx) => { await tx.delete(visits).where(eq(visits.customerId, n.id)); await tx.delete(customers).where(eq(customers.id, n.id)); });
  });
  it("limite de frequência impede nova mensagem logo em seguida", async () => {
    const r = await createCampaign(orgA.id, { name: "Segunda", channel: "whatsapp", audience: { statuses: ["at_risk", "inactive", "highly_inactive", "recovered"] } }, { type: "user", userId: userA });
    const msgs = await withOrg(orgA.id, (tx) => tx.select().from(campaignMessages).where(eq(campaignMessages.campaignId, r.campaign.id)));
    expect(msgs.filter((m) => m.skipReason === "frequency_cap").length).toBe(3);
  });
  it("opt-out remove consentimentos e cancela pendentes", async () => {
    const [c] = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(and(eq(customers.orgId, orgA.id), eq(customers.name, "Risco Dois"))));
    await withOrg(orgA.id, (tx) => optOutCustomer(tx, orgA.id, c.id, "whatsapp", "customer"));
    const [u] = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(eq(customers.id, c.id)));
    expect(u.optedOutAt).not.toBeNull();
    expect(u.consentWhatsapp).toBe(false);
  });
});

describe("agente (modo básico) e LGPD", () => {
  it("responde aos comandos de exemplo com dados reais", async () => {
    const ctx = { org: orgA, userId: userA, role: "owner" as const };
    const r1 = await runBasicAgent(ctx, "Encontre todos os clientes que não aparecem há mais de 30 dias.");
    expect(r1.text).toMatch(/\*\*2\*\* clientes estão há mais de 30 dias/); // um deles já voltou
    const r2 = await runBasicAgent(ctx, "Quanto conseguimos recuperar em receita neste mês?");
    expect(r2.text).toMatch(/R\$\s75,00/);
    const r3 = await runBasicAgent(ctx, "Crie uma campanha para recuperar os clientes inativos deste mês.");
    expect(r3.actions[0]?.type).toBe("campaign_created");
    const r4 = await runBasicAgent(ctx, "Quais campanhas tiveram melhores resultados?");
    expect(r4.text).toMatch(/1 retornos/);
    const viewer = await runBasicAgent({ ...ctx, role: "viewer" }, "Crie uma campanha para os inativos");
    expect(viewer.text).toMatch(/não permite/);
  });
  it("exporta e elimina dados do titular, mantendo bloqueio", async () => {
    const [c] = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(and(eq(customers.orgId, orgA.id), eq(customers.name, "Inativo Tres"))));
    const exp = await withOrg(orgA.id, (tx) => exportCustomerData(tx, orgA.id, c.id));
    expect(exp.titular.id).toBe(c.id);
    await withOrg(orgA.id, (tx) => deleteCustomerData(tx, orgA.id, c.id, userA, true));
    const left = await withOrg(orgA.id, (tx) => tx.select().from(customers).where(eq(customers.id, c.id)));
    expect(left).toHaveLength(0);
    const logs = await withOrg(orgA.id, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, "customer.delete")));
    expect(JSON.stringify(logs)).not.toContain("Inativo Tres"); // auditoria sem dados pessoais
  });
  it("dados de demonstração ficam marcados e nunca são elegíveis para envio", async () => {
    await withOrg(orgB.id, (tx) => loadDemoData(tx, orgB, userB));
    const r = await createCampaign(orgB.id, { name: "Demo", channel: "whatsapp", audience: {} }, { type: "user", userId: userB });
    expect(r.queued).toBe(0);
    expect(r.skipped).toBeGreaterThan(0);
  });
  it("automação do plano Básico não roda (limite 0)", async () => {
    const r = await runAutomations(orgA.id, "basic", [{ customerId: "x", from: "active", to: "at_risk" }]);
    expect(r.created).toBe(0);
  });
});
