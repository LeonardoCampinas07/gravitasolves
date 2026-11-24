/** Evolução do produto: justificativa da central de recuperação, relatórios por período, insights, CSV e busca da ajuda. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { customers, organizations, recoveries, type Organization } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { resolveSettings } from "@/lib/settings";
import { recoveryReason, type RecoveryCustomer } from "@/lib/recovery";
import { getDashboardInsights, getMonthlyRecoveries, getPeriodComparison, getPeriodTotals, getRecoveryRows } from "@/lib/reports";
import { csvCell, toCsv } from "@/lib/csv";
import { guideIdFor, searchArticles } from "@/lib/knowledge";
import { addDays, today } from "@/lib/dates";

const T = today();
const S = resolveSettings({ segment: "barbershop", settings: null });

const cust = (o: Partial<RecoveryCustomer> = {}): RecoveryCustomer => ({
  lastVisitAt: addDays(T, -40), lastContactAt: null, firstVisitAt: addDays(T, -100), visitCount: 1, recoveredAt: null,
  status: "inactive", avgTicketCents: 5000, optedOutAt: null, phone: "+5511999990000", email: null,
  consentWhatsapp: true, consentEmail: false, consentSms: false, ...o,
});

describe("recoveryReason (justificativa e próximo passo)", () => {
  it("sem ritmo individual: informa dias e o limite de risco", () => {
    const r = recoveryReason(cust(), S, T);
    expect(r.why).toMatch(/Está há 40 dias/);
    expect(r.next.kind).toBe("invite");
  });
  it("cliente fiel com ticket alto aparece no detalhe", () => {
    const r = recoveryReason(cust({ visitCount: 8, avgTicketCents: 20000 }), S, T, 5000);
    expect(r.detail).toContain("cliente fiel (8 visitas)");
    expect(r.detail).toContain("ticket alto");
  });
  it("descadastrado nunca recebe sugestão de contato", () => {
    expect(recoveryReason(cust({ optedOutAt: new Date() }), S, T).next.kind).toBe("blocked");
  });
  it("sem autorização de canal: pedir consentimento", () => {
    expect(recoveryReason(cust({ consentWhatsapp: false }), S, T).next.kind).toBe("consent");
  });
  it("contatado há pouco: respeita o limite de frequência", () => {
    const r = recoveryReason(cust({ lastContactAt: new Date() }), S, T);
    expect(r.next.kind).toBe("wait");
  });
  it("altamente inativo: mensagem de reconquista", () => {
    expect(recoveryReason(cust({ status: "highly_inactive", lastVisitAt: addDays(T, -200) }), S, T).next.kind).toBe("winback");
  });
  it("recuperado: acompanhar", () => {
    expect(recoveryReason(cust({ status: "recovered", recoveredAt: new Date() }), S, T).next.kind).toBe("follow");
  });
});

describe("CSV seguro", () => {
  it("escapa aspas e separador", () => {
    expect(csvCell('Ana "Bia"; Silva')).toBe('"Ana ""Bia""; Silva"');
  });
  it("neutraliza injeção de fórmula", () => {
    expect(csvCell("=HYPERLINK(\"x\")").startsWith("\"'=")).toBe(true);
    expect(csvCell("+5511")).toBe("'+5511");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("gera BOM e usa ; e CRLF", () => {
    const out = toCsv([["a", "b"], [1, null]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe("a;b\r\n1;");
  });
});

describe("relatórios por período e isolamento entre empresas", () => {
  let A: Organization, B: Organization;
  beforeAll(async () => {
    const a = await createAccount({ name: "Rel A", email: "rel-a@teste.local", password: "senhaDeTeste123", orgName: "Relatórios A" });
    const b = await createAccount({ name: "Rel B", email: "rel-b@teste.local", password: "senhaDeTeste123", orgName: "Relatórios B" });
    const db = await getDb();
    [A] = await db.select().from(organizations).where(eq(organizations.id, a.org.id));
    [B] = await db.select().from(organizations).where(eq(organizations.id, b.org.id));
    const ids = await withOrg(A.id, (tx) => tx.insert(customers).values([
      { orgId: A.id, name: "Volta Recente", phone: "+5511900000001", lastVisitAt: addDays(T, -2), visitCount: 3, status: "recovered", favoriteService: "Corte" },
      { orgId: A.id, name: "Volta Antiga", phone: "+5511900000002", lastVisitAt: addDays(T, -50), visitCount: 3, status: "recovered", favoriteService: "Barba" },
      { orgId: A.id, name: "Mensal Sumido", phone: "+5511900000003", firstVisitAt: addDays(T, -300), lastVisitAt: addDays(T, -60), visitCount: 12, status: "inactive", consentWhatsapp: true },
    ]).returning({ id: customers.id }));
    await withOrg(A.id, (tx) => tx.insert(recoveries).values([
      { orgId: A.id, customerId: ids[0].id, returnedAt: addDays(T, -2), revenueCents: 8000 },
      { orgId: A.id, customerId: ids[1].id, returnedAt: addDays(T, -50), revenueCents: 0 },
    ]));
  });

  it("totais do período contam só o que caiu no intervalo", async () => {
    const t = await withOrg(A.id, (tx) => getPeriodTotals(tx, A.id, addDays(T, -29), T));
    expect(t.recovered).toBe(1);
    expect(t.revenueCents).toBe(8000);
    expect(t.recoveriesWithRevenue).toBe(1);
  });
  it("comparação traz o período anterior de mesmo tamanho", async () => {
    const c = await withOrg(A.id, (tx) => getPeriodComparison(tx, A.id, 30, T));
    expect(c.cur.recovered).toBe(1);
    expect(c.prev.recovered).toBe(1);
    expect(c.prev.revenueCents).toBe(0);
  });
  it("evolução mensal soma os retornos", async () => {
    const m = await withOrg(A.id, (tx) => getMonthlyRecoveries(tx, A.id, 6, T));
    expect(m.reduce((s, x) => s + x.recovered, 0)).toBe(2);
  });
  it("linhas do CSV de recuperados", async () => {
    const r = await withOrg(A.id, (tx) => getRecoveryRows(tx, A.id, addDays(T, -89), T));
    expect(r.map((x) => x.customer).sort()).toEqual(["Volta Antiga", "Volta Recente"]);
  });
  it("outra empresa não enxerga nada da empresa A", async () => {
    const t = await withOrg(B.id, (tx) => getPeriodTotals(tx, B.id, addDays(T, -364), T));
    expect(t.recovered).toBe(0);
    expect(await withOrg(B.id, (tx) => getRecoveryRows(tx, B.id, addDays(T, -364), T))).toHaveLength(0);
    expect(await withOrg(B.id, (tx) => getDashboardInsights(tx, B.id, S, T))).toHaveLength(0);
  });
  it("insights usam números reais da própria base", async () => {
    const ins = await withOrg(A.id, (tx) => getDashboardInsights(tx, A.id, S, T));
    for (const i of ins) expect(i.href.startsWith("/")).toBe(true);
    expect(ins.some((i) => /\d/.test(i.text))).toBe(true);
  });
});

describe("base de conhecimento do Assistente Gravita", () => {
  it("reconhece a tela atual", () => {
    expect(guideIdFor("/inativos")).toBe("inativos");
    expect(guideIdFor("/campanhas/123e4567-e89b-12d3-a456-426614174000")).toBe("campanha");
    expect(guideIdFor("/nao-existe")).toBeNull();
  });
  it("busca sem acento e leva para a tela certa", () => {
    expect(searchArticles("importar planilha")[0].href).toBe("/clientes/importar");
    expect(searchArticles("relatorio exportar")[0].href).toBe("/resultados");
    expect(searchArticles("xyzabc")).toHaveLength(0);
  });
});
