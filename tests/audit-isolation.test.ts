/** Auditoria pré-lançamento: uma empresa não consegue ler nem alterar dados de outra passando IDs alheios. */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { appointments, campaigns, consentEvents, customers, organizations, type Organization } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { importRows } from "@/lib/import/run";
import { detectMapping } from "@/lib/import/mapping";
import { createCampaign, markManuallySent, transitionCampaign, updateCampaignCopy } from "@/lib/campaigns/service";
import { optOutCustomer, recordVisit, setConsent } from "@/lib/customers";
import { completeAppointment, setAppointmentStatus } from "@/lib/sources/ingest";
import { deleteCustomerData, exportCustomerData } from "@/lib/lgpd";
import { addDays, today } from "@/lib/dates";

let A: Organization, B: Organization, uA: string, uB: string, custA: string, campA: string, apptA: string;

beforeAll(async () => {
  const db = await getDb();
  const a = await createAccount({ name: "Teste A", email: "audit-a@teste.local", password: "senhaDeTeste123", orgName: "Empresa Teste A" });
  const b = await createAccount({ name: "Teste B", email: "audit-b@teste.local", password: "senhaDeTeste123", orgName: "Empresa Teste B" });
  [A] = await db.select().from(organizations).where(eq(organizations.id, a.org.id));
  [B] = await db.select().from(organizations).where(eq(organizations.id, b.org.id));
  uA = a.user.id; uB = b.user.id;
  const rows = [{ Nome: "Cliente Sintético", Telefone: "(11) 98888-0001", "Última visita": addDays(today(), -60).split("-").reverse().join("/"), "Aceita WhatsApp": "sim" }];
  await withOrg(A.id, (tx) => importRows(tx, A, rows, { filename: "t.csv", source: "csv", userId: uA, mapping: detectMapping(Object.keys(rows[0])) }));
  [{ id: custA }] = await withOrg(A.id, (tx) => tx.select({ id: customers.id }).from(customers).where(eq(customers.orgId, A.id)));
  campA = (await createCampaign(A.id, { name: "Camp A", channel: "whatsapp", audience: {} }, { type: "user", userId: uA })).campaign.id;
  [{ id: apptA }] = await withOrg(A.id, (tx) => tx.insert(appointments).values({ orgId: A.id, customerId: custA, scheduledFor: new Date(), status: "requested", source: "booking_page", contactName: "Cliente Sintético" }).returning({ id: appointments.id }));
});

describe("isolamento entre empresas (IDs de outra empresa)", () => {
  const actorB = () => ({ type: "user" as const, userId: uB });
  it("campanha alheia: editar, aprovar, cancelar e marcar envio falham", async () => {
    await expect(updateCampaignCopy(B.id, campA, { variants: ["oi {nome}"] }, actorB())).rejects.toThrow();
    await expect(transitionCampaign(B.id, campA, "cancel", actorB())).rejects.toThrow();
    await expect(markManuallySent(B.id, campA, [], actorB())).rejects.toThrow();
    const [c] = await withOrg(A.id, (tx) => tx.select().from(campaigns).where(eq(campaigns.id, campA)));
    expect(c.status).not.toBe("cancelled");
  });
  it("cliente alheio: visita, opt-out, consentimento, exportação e exclusão falham sem efeito", async () => {
    await expect(withOrg(B.id, (tx) => recordVisit(tx, B, custA, { date: today(), amountCents: 100, source: "manual" }))).rejects.toThrow();
    expect(await withOrg(B.id, (tx) => optOutCustomer(tx, B.id, custA, "teste", "user"))).toBe(false);
    await expect(withOrg(B.id, (tx) => setConsent(tx, B.id, custA, "whatsapp", false, { source: "x", actor: "x" }))).rejects.toThrow();
    await expect(withOrg(B.id, (tx) => exportCustomerData(tx, B.id, custA))).rejects.toThrow();
    await expect(withOrg(B.id, (tx) => deleteCustomerData(tx, B.id, custA, uB, false))).rejects.toThrow();
    const [c] = await withOrg(A.id, (tx) => tx.select().from(customers).where(eq(customers.id, custA)));
    expect(c.optedOutAt).toBeNull();
    expect(c.consentWhatsapp).toBe(true);
    const ev = await withOrg(B.id, (tx) => tx.select().from(consentEvents).where(and(eq(consentEvents.orgId, B.id), eq(consentEvents.customerId, custA))));
    expect(ev).toHaveLength(0);
  });
  it("agendamento alheio: concluir e mudar status não têm efeito", async () => {
    await expect(withOrg(B.id, (tx) => completeAppointment(tx, B, apptA, 5000))).rejects.toThrow();
    await withOrg(B.id, (tx) => setAppointmentStatus(tx, B.id, [apptA], "cancelled"));
    const [a] = await withOrg(A.id, (tx) => tx.select().from(appointments).where(eq(appointments.id, apptA)));
    expect(a.status).toBe("requested");
  });
  it("canal de consentimento inválido é recusado", async () => {
    await expect(withOrg(A.id, (tx) => setConsent(tx, A.id, custA, "telegram" as never, true, { source: "x", actor: "x" }))).rejects.toThrow("Canal inválido");
  });
});

describe("importação: entradas difíceis (dados sintéticos)", () => {
  const imp = (rows: Record<string, unknown>[]) => withOrg(B.id, (tx) => importRows(tx, B, rows, { filename: "t.csv", source: "csv", userId: uB, mapping: detectMapping(Object.keys(rows[0])) }));
  it("datas inválidas, telefone ruim, nome vazio, emoji e fórmula não quebram a importação", async () => {
    const r = await imp([
      { Nome: "😀 Emoji da Silva", Telefone: "11 97777-0001", "Última visita": "31/02/2024" },
      { Nome: "", Telefone: "11 97777-0002", "Última visita": "01/01/2024" },
      { Nome: "=HYPERLINK(\"http://x\")", Telefone: "abc", "Última visita": "ontem" },
      { Nome: "A".repeat(5000), Telefone: "11 97777-0004", "Última visita": "2099-01-01" },
    ]);
    expect(r.created + r.skipped + r.errors.length).toBeGreaterThan(0);
    const all = await withOrg(B.id, (tx) => tx.select().from(customers).where(eq(customers.orgId, B.id)));
    for (const c of all) expect(c.name.length).toBeLessThanOrEqual(200);
  });
  it("5.000 linhas em tempo razoável e sem duplicar ao reimportar", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ Nome: `Pessoa ${i}`, Telefone: `(21) 9${String(70000000 + i)}`, "Última visita": addDays(today(), -(i % 200)).split("-").reverse().join("/") }));
    const t0 = Date.now(); const r1 = await imp(rows); const ms = Date.now() - t0;
    const r2 = await imp(rows);
    console.log(`[auditoria] import 5000 linhas: ${ms} ms; 1ª: ${r1.created} criados/${r1.skipped} ignorados; 2ª: ${r2.created} criados/${r2.updated} atualizados`);
    expect(r2.created).toBe(0);
  }, 180_000);
});
