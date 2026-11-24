import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { campaigns, customers, recoveries, subscriptions } from "@/db/schema";
import { SANDBOX_ORG_ID, ensureSandbox, isSandboxOrg } from "@/lib/sandbox";
import { runDailyJobs } from "@/lib/jobs";
import { runTool } from "@/lib/ai/tools";
import { BASIC_EXAMPLES, runBasicAgent } from "@/lib/ai/basic-agent";

describe("simulação pública", () => {
  it("monta a Barbearia Exemplo com plano Profissional ativo e dados fictícios", async () => {
    const org = await ensureSandbox();
    expect(org.id).toBe(SANDBOX_ORG_ID);
    expect(org.planId).toBe("pro");
    expect(org.slug).toBeNull(); // sem página pública de agendamento
    const [c] = await withOrg(SANDBOX_ORG_ID, (tx) => tx.select({ n: sql<number>`count(*)::int`, real: sql<number>`count(*) filter (where not ${customers.isDemo})::int` })
      .from(customers).where(eq(customers.orgId, org.id)));
    expect(Number(c.n)).toBeGreaterThan(100);
    expect(Number(c.real)).toBe(0); // todos marcados como demonstração
    const [s] = await withOrg(SANDBOX_ORG_ID, (tx) => tx.select().from(subscriptions).where(eq(subscriptions.orgId, org.id)));
    expect(s.status).toBe("active");
    expect(s.planId).toBe("pro");
    const [r] = await withOrg(SANDBOX_ORG_ID, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(recoveries).where(eq(recoveries.orgId, org.id)));
    expect(Number(r.n)).toBeGreaterThan(5);
    const pending = await withOrg(SANDBOX_ORG_ID, (tx) => tx.select().from(campaigns).where(and(eq(campaigns.orgId, org.id), eq(campaigns.status, "pending_approval"))));
    expect(pending.length).toBe(1);
  });

  it("é idempotente no mesmo dia (não duplica dados)", async () => {
    const a = await ensureSandbox();
    const b = await ensureSandbox();
    expect(b.id).toBe(a.id);
    const list = await withOrg(SANDBOX_ORG_ID, (tx) => tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, SANDBOX_ORG_ID)));
    expect(list.length).toBe(5);
  });

  it("agente não cria campanha na simulação, mas responde perguntas", async () => {
    const org = await ensureSandbox();
    const ctx = { org, userId: "5e5e5e5e-0000-4000-8000-000000000002", role: "owner" as const };
    await expect(runTool("create_campaign_draft", { name: "Teste", channel: "whatsapp" }, ctx)).rejects.toThrow(/simulação/);
    const r = await runBasicAgent(ctx, "Quanto conseguimos recuperar em receita neste mês?");
    expect(r.text.length).toBeGreaterThan(10);
  });

  it("todas as perguntas prontas têm resposta própria (nenhuma cai no 'não entendi')", async () => {
    const org = await ensureSandbox();
    const ctx = { org, userId: "5e5e5e5e-0000-4000-8000-000000000002", role: "owner" as const };
    const answers = new Map<string, string>();
    for (const q of BASIC_EXAMPLES) {
      const r = await runBasicAgent(ctx, q);
      expect(r.text, q).not.toMatch(/Ainda não entendi/);
      expect(r.text, q).not.toMatch(/undefined|NaN|\[object/);
      if (/^Crie/.test(q)) expect(r.text, q).toMatch(/simulação/);
      else expect(r.text, q).not.toMatch(/Não consegui concluir/);
      answers.set(q, r.text);
    }
    // perguntas diferentes levam a respostas diferentes (não é sempre o mesmo texto)
    expect(new Set(answers.values()).size).toBeGreaterThan(BASIC_EXAMPLES.length * 0.8);
    expect(answers.get("Quais clientes que gastavam mais pararam de vir?")).toMatch(/maior valor que estão afastados/);
    expect(answers.get("Clientes entre 30 e 60 dias sem visita.")).toMatch(/entre 30 e 60 dias/);
    expect(answers.get("Tem campanha esperando aprovação?")).toMatch(/Agente: reconquistar/);
    expect((await runBasicAgent(ctx, "oi")).text).toMatch(/agente de retenção/);
  });

  it("rotina diária ignora a simulação", async () => {
    await ensureSandbox();
    const reports = await runDailyJobs();
    expect(reports.some((r) => isSandboxOrg(r.orgId))).toBe(false);
  });
});
