import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { normalizePhone, normalizeEmail, parseDate, parseMoneyCents, parseBool, normalizeName, parseCount } from "@/lib/import/normalize";
import { detectMapping } from "@/lib/import/mapping";
import { parseCsv, parseSpreadsheet, decodeText } from "@/lib/import/parse";
import { cleanRow } from "@/lib/import/run";
import { classify, priorityScore, median, effectiveThresholds } from "@/lib/classification";
import { resolveSettings, validateThresholds } from "@/lib/settings";
import { checkEligibility, isOptOutMessage, lintMessage } from "@/lib/campaigns/compliance";
import { renderMessage, templateVariants } from "@/lib/campaigns/templates";
import { can } from "@/lib/auth/permissions";
import { encryptSecret, decryptSecret, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/crypto";
import { daysBetween, addDays } from "@/lib/dates";

const REF = "2026-11-10";

describe("normalização", () => {
  it("telefones brasileiros → E.164", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("11987654321")).toBe("+5511987654321");
    expect(normalizePhone("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("5511987654321")).toBe("+5511987654321");
    expect(normalizePhone("011987654321")).toBe("+5511987654321");
    expect(normalizePhone("0 21 11 98765-4321")).toBe("+5511987654321"); // operadora
    expect(normalizePhone("(11) 3333-4444")).toBe("+551133334444");
    expect(normalizePhone("1187654321")).toBeNull(); // celular sem 9 / fixo inválido
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });
  it("e-mail", () => {
    expect(normalizeEmail(" Joao@Email.COM ")).toBe("joao@email.com");
    expect(normalizeEmail("joao@")).toBeNull();
  });
  it("datas em vários formatos", () => {
    expect(parseDate("05/03/2026", REF)).toBe("2026-03-05");
    expect(parseDate("5/3/26", REF)).toBe("2026-03-05");
    expect(parseDate("2026-03-05", REF)).toBe("2026-03-05");
    expect(parseDate("2026-03-05T10:00:00Z", REF)).toBe("2026-03-05");
    expect(parseDate(46086, REF)).toBe("2026-03-05"); // serial do Excel
    expect(parseDate(new Date(Date.UTC(2026, 2, 5)), REF)).toBe("2026-03-05");
    expect(parseDate("31/02/2026", REF)).toBeNull();
    expect(parseDate("01/12/2026", REF)).toBeNull(); // futura
    expect(parseDate("ontem", REF)).toBeNull();
  });
  it("valores em reais", () => {
    expect(parseMoneyCents("R$ 1.234,56")).toBe(123456);
    expect(parseMoneyCents("1234,5")).toBe(123450);
    expect(parseMoneyCents("1,234.56")).toBe(123456);
    expect(parseMoneyCents("1.234")).toBe(123400);
    expect(parseMoneyCents("45.9")).toBe(4590);
    expect(parseMoneyCents(80)).toBe(8000);
    expect(parseMoneyCents("-10")).toBeNull();
    expect(parseCount("1.200")).toBe(1200);
  });
  it("booleanos e nomes", () => {
    expect(parseBool("Sim")).toBe(true);
    expect(parseBool("não")).toBe(false);
    expect(parseBool("talvez")).toBeNull();
    expect(normalizeName("JOÃO DA SILVA")).toBe("João da Silva");
    expect(normalizeName("Maria McDonald")).toBe("Maria McDonald");
  });
});

describe("mapeamento de colunas", () => {
  it("detecta cabeçalhos em português, com acentos e variações", () => {
    const m = detectMapping(["Nome do Cliente", "Celular/WhatsApp", "E-mail", "Data da Última Visita", "Qtd. Visitas", "Ticket Médio (R$)", "Serviço mais utilizado", "Barbeiro", "Obs"]);
    expect(m).toMatchObject({
      name: "Nome do Cliente", phone: "Celular/WhatsApp", email: "E-mail", lastVisit: "Data da Última Visita",
      visitCount: "Qtd. Visitas", avgTicket: "Ticket Médio (R$)", favoriteService: "Serviço mais utilizado", preferredStaff: "Barbeiro", notes: "Obs",
    });
  });
  it("cada coluna atende só um campo", () => {
    const m = detectMapping(["nome", "telefone"]);
    expect(Object.values(m).length).toBe(new Set(Object.values(m)).size);
  });
});

describe("leitura de planilhas", () => {
  it("CSV com ponto e vírgula e acentos em Windows-1252", () => {
    const latin1 = Buffer.from("Nome;Telefone;Última visita\nJoão;11987654321;01/10/2026\n", "latin1");
    const text = decodeText(latin1);
    const p = parseCsv(text);
    expect(p.headers).toEqual(["Nome", "Telefone", "Última visita"]);
    expect(p.rows[0]["Nome"]).toBe("João");
  });
  it("XLSX com datas reais e fórmulas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Nome", "Telefone", "Última visita", "Total gasto", "Visitas"]);
    ws.addRow(["Ana Lima", "(21) 99999-0000", new Date(Date.UTC(2026, 8, 1)), 300, 3]);
    ws.addRow(["Bruno", "21988887777", "15/10/2026", { formula: "2*50", result: 100 }, 2]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const p = await parseSpreadsheet(buf, "clientes.xlsx");
    expect(p.rows).toHaveLength(2);
    const m = detectMapping(p.headers);
    const r1 = cleanRow(p.rows[0], m, 2, REF);
    const r2 = cleanRow(p.rows[1], m, 3, REF);
    expect(r1.ok && r1.value).toMatchObject({ name: "Ana Lima", phone: "+5521999990000", lastVisitAt: "2026-09-01", totalSpentCents: 30000, avgTicketCents: 10000 });
    expect(r2.ok && r2.value).toMatchObject({ totalSpentCents: 10000, avgTicketCents: 5000, lastVisitAt: "2026-10-15" });
  });
  it("rejeita formatos não suportados", async () => {
    await expect(parseSpreadsheet(Buffer.from(""), "a.xls")).rejects.toThrow(/xls/);
    await expect(parseSpreadsheet(Buffer.from(""), "a.pdf")).rejects.toThrow();
  });
  it("linha sem nome vira erro com número da linha", () => {
    const r = cleanRow({ Nome: "  ", Telefone: "11987654321" }, { name: "Nome", phone: "Telefone" }, 7, REF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.row).toBe(7);
  });
});

describe("classificação", () => {
  const s = resolveSettings({ segment: "barbershop", settings: { useIndividualRhythm: false } });
  const base = { firstVisitAt: null, visitCount: 1, recoveredAt: null };
  it("usa os limites do segmento", () => {
    expect(s.thresholds).toEqual({ atRiskDays: 15, inactiveDays: 30, highlyInactiveDays: 60 });
    expect(classify({ ...base, lastVisitAt: addDays(REF, -5) }, s, REF).status).toBe("active");
    expect(classify({ ...base, lastVisitAt: addDays(REF, -15) }, s, REF).status).toBe("at_risk");
    expect(classify({ ...base, lastVisitAt: addDays(REF, -30) }, s, REF).status).toBe("inactive");
    expect(classify({ ...base, lastVisitAt: addDays(REF, -61) }, s, REF).status).toBe("highly_inactive");
    expect(classify({ ...base, lastVisitAt: null }, s, REF).status).toBe("unknown");
  });
  it("respeita personalização da empresa", () => {
    const custom = resolveSettings({ segment: "barbershop", settings: { thresholds: { atRiskDays: 20, inactiveDays: 40, highlyInactiveDays: 90 }, useIndividualRhythm: false } });
    expect(classify({ ...base, lastVisitAt: addDays(REF, -30) }, custom, REF).status).toBe("at_risk");
  });
  it("ritmo individual: cliente semanal entra em risco antes", () => {
    const rs = resolveSettings({ segment: "barbershop", settings: {} });
    const weekly = { firstVisitAt: addDays(REF, -12 - 7 * 9), lastVisitAt: addDays(REF, -12), visitCount: 10, recoveredAt: null };
    const t = effectiveThresholds(weekly, rs).thresholds;
    expect(t.atRiskDays).toBeLessThan(15);
    expect(classify(weekly, rs, REF).status).toBe("at_risk");
  });
  it("cliente que voltou após campanha aparece como recuperado", () => {
    const c = { ...base, lastVisitAt: addDays(REF, -2), recoveredAt: new Date(`${addDays(REF, -2)}T12:00:00-03:00`) };
    expect(classify(c, s, REF).status).toBe("recovered");
    const old = { ...c, recoveredAt: new Date(`${addDays(REF, -60)}T12:00:00-03:00`) };
    expect(classify(old, s, REF).status).toBe("active");
  });
  it("valida limites crescentes", () => {
    expect(validateThresholds({ atRiskDays: 30, inactiveDays: 20, highlyInactiveDays: 90 })).toMatch(/crescentes/);
    expect(validateThresholds({ atRiskDays: 10, inactiveDays: 20, highlyInactiveDays: 30 })).toBeNull();
  });
  it("score de potencial de retorno", () => {
    const t = s.thresholds;
    const hi = priorityScore({ status: "at_risk", daysSince: 16, avgTicketCents: 20000, visitCount: 20, contactable: true, thresholds: t }, 10000);
    const lo = priorityScore({ status: "highly_inactive", daysSince: 200, avgTicketCents: 3000, visitCount: 1, contactable: false, thresholds: t }, 10000);
    expect(hi).toBeGreaterThan(80);
    expect(lo).toBeLessThan(25);
    expect(priorityScore({ status: "active", daysSince: 2, avgTicketCents: 20000, visitCount: 20, contactable: true, thresholds: t }, 10000)).toBe(0);
    expect(median([0, 10, 30, 20])).toBe(20);
  });
});

describe("compliance", () => {
  const s = resolveSettings({ segment: "barbershop", settings: {} });
  const c = { phone: "+5511987654321", email: "a@b.com", consentWhatsapp: true, consentEmail: false, consentSms: false, legalBasis: "consent" as const, optedOutAt: null, isDemo: false };
  const none = { lastSentAt: null, sentLast30Days: 0 };
  it("elegível com consentimento", () => expect(checkEligibility(c, "whatsapp", s, new Set(), none, REF)).toEqual({ ok: true }));
  it("bloqueia sem consentimento do canal", () => expect(checkEligibility(c, "email", s, new Set(), none, REF)).toEqual({ ok: false, reason: "no_consent" }));
  it("legítimo interesse só vale para e-mail quando habilitado", () => {
    const li = { ...c, legalBasis: "legitimate_interest" as const };
    expect(checkEligibility(li, "email", s, new Set(), none, REF)).toEqual({ ok: false, reason: "no_consent" });
    expect(checkEligibility(li, "email", { ...s, allowLegitimateInterestEmail: true }, new Set(), none, REF)).toEqual({ ok: true });
    expect(checkEligibility({ ...li, consentWhatsapp: false }, "whatsapp", { ...s, allowLegitimateInterestEmail: true }, new Set(), none, REF)).toEqual({ ok: false, reason: "no_consent" });
  });
  it("opt-out, bloqueio, demo e frequência", () => {
    expect(checkEligibility({ ...c, optedOutAt: new Date() }, "whatsapp", s, new Set(), none, REF)).toMatchObject({ reason: "opted_out" });
    expect(checkEligibility(c, "whatsapp", s, new Set([c.phone]), none, REF)).toMatchObject({ reason: "blocked" });
    expect(checkEligibility({ ...c, isDemo: true }, "whatsapp", s, new Set(), none, REF)).toMatchObject({ reason: "demo" });
    expect(checkEligibility(c, "whatsapp", s, new Set(), { lastSentAt: new Date(`${REF}T12:00:00Z`), sentLast30Days: 1 }, REF)).toMatchObject({ reason: "frequency_cap" });
    expect(checkEligibility(c, "whatsapp", s, new Set(), { lastSentAt: new Date(new Date(`${REF}T12:00:00Z`).getTime() - 20 * 864e5), sentLast30Days: 2 }, REF)).toMatchObject({ reason: "monthly_cap" });
    expect(checkEligibility({ ...c, phone: null }, "whatsapp", s, new Set(), none, REF)).toMatchObject({ reason: "no_contact" });
  });
  it("reconhece pedidos de descadastro", () => {
    for (const m of ["SAIR", "sair", "Parar", "stop", "Não quero", "quero sair"].slice(0, 5)) expect(isOptOutMessage(m)).toBe(true);
    expect(isOptOutMessage("Quero agendar sábado")).toBe(false);
  });
  it("alerta ofertas em clínica odontológica", () => {
    expect(lintMessage("Ganhe 20% de desconto na limpeza", "whatsapp", "dental").length).toBeGreaterThan(0);
    expect(lintMessage("Podemos organizar sua revisão?", "whatsapp", "dental")).toEqual([]);
  });
});

describe("mensagens", () => {
  it("remove frases com variáveis ausentes e preenche o resto", () => {
    const t = "Oi, {nome}! Seu {servico} está te esperando. Se preferir, reservamos com {profissional}. Até logo!";
    expect(renderMessage(t, { name: "João Pedro Silva", business: "Barbearia X", offer: null, service: "corte", staff: null }))
      .toBe("Oi, João! Seu corte está te esperando. Até logo!");
  });
  it("modelos por segmento produzem 3 variações distintas e sem oferta em setor regulado", () => {
    const v = templateVariants("barbershop", ["inactive"], "barba de cortesia");
    expect(new Set(v).size).toBe(3);
    expect(v[0]).toContain("{oferta}");
    expect(templateVariants("dental", ["inactive"], "20% off").join(" ")).not.toContain("{oferta}");
  });
});

describe("segurança", () => {
  it("matriz de permissões", () => {
    expect(can("viewer", "campaigns:write")).toBe(false);
    expect(can("manager", "campaigns:approve")).toBe(false);
    expect(can("admin", "campaigns:approve")).toBe(true);
    expect(can("admin", "org:delete")).toBe(false);
    expect(can("owner", "org:delete")).toBe(true);
  });
  it("criptografia de segredos e token de descadastro", () => {
    const enc = encryptSecret("token-super-secreto");
    expect(enc).not.toContain("secreto");
    expect(decryptSecret(enc)).toBe("token-super-secreto");
    const tk = unsubscribeToken("org-1", "cust-1");
    expect(verifyUnsubscribeToken(tk)).toEqual({ orgId: "org-1", customerId: "cust-1" });
    expect(verifyUnsubscribeToken(tk.replace("cust-1", "cust-2"))).toBeNull();
  });
  it("datas", () => {
    expect(daysBetween("2026-10-31", "2026-11-10")).toBe(10);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
});
