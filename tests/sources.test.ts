import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { getDb, withOrg } from "@/db/client";
import { appointments, customers, organizations, type Organization } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { contactFromFilename, guessOwnerNames, parseIcs, parseVcf, parseWhatsAppChat, personFromEvent } from "@/lib/sources/parsers";
import { completeAppointment, ingestAppointments, ingestContacts, quickCheckIn, touchContact } from "@/lib/sources/ingest";
import { mapGoogleEvents } from "@/lib/sources/google";
import { classify } from "@/lib/classification";
import { resolveSettings } from "@/lib/settings";
import { addDays, today } from "@/lib/dates";

const T = today();
const ymd = (d: string) => d.replace(/-/g, "");

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a1@google.com
DTSTART:${ymd(addDays(T, -40))}T130000Z
SUMMARY:Corte - João Silva (11) 98765-4321
END:VEVENT
BEGIN:VEVENT
UID:a2@google.com
DTSTART;TZID=America/Sao_Paulo:${ymd(addDays(T, -10))}T100000
SUMMARY:João Silva | Barba
DESCRIPTION:cliente fiel\\, sempre pontual
END:VEVENT
BEGIN:VEVENT
UID:a3@google.com
DTSTART;VALUE=DATE:${ymd(addDays(T, -5))}
SUMMARY:Almoço
END:VEVENT
BEGIN:VEVENT
UID:a4@google.com
DTSTART:${ymd(addDays(T, 3))}T150000Z
SUMMARY:Maria Oliveira - Escova
END:VEVENT
BEGIN:VEVENT
UID:a5@google.com
DTSTART:${ymd(addDays(T, -2))}T150000Z
SUMMARY:Pedro Santos
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

describe("leitores de fontes", () => {
  it(".ics: eventos, fuso, escape e cancelamento", () => {
    const ev = parseIcs(ICS);
    expect(ev).toHaveLength(5);
    expect(ev[1].description).toBe("cliente fiel, sempre pontual");
    expect(ev[4].cancelled).toBe(true);
    expect(ev[1].start.toISOString()).toBe(`${addDays(T, -10)}T13:00:00.000Z`); // 10h em Brasília
  });
  it("identifica o cliente pelo título do evento", () => {
    expect(personFromEvent({ summary: "Corte - João Silva (11) 98765-4321", description: "", attendees: [] }))
      .toMatchObject({ name: "João Silva", phone: "+5511987654321", service: "Corte" });
    expect(personFromEvent({ summary: "Maria Oliveira - Escova", description: "", attendees: [] })).toMatchObject({ name: "Maria Oliveira", service: "Escova" });
    expect(personFromEvent({ summary: "Almoço", description: "", attendees: [] })).toBeNull();
    expect(personFromEvent({ summary: "Folga", description: "", attendees: [] })).toBeNull();
    expect(personFromEvent({ summary: "Reunião com fornecedor", description: "", attendees: [] })).toBeNull();
    expect(personFromEvent({ summary: "Consulta", description: "", attendees: [{ name: "Ana Lima", email: "ana@x.com" }] }))
      .toMatchObject({ email: "ana@x.com" });
  });
  it("Google: mapeia eventos e ignora o próprio usuário", () => {
    const items = mapGoogleEvents([
      { id: "g1", summary: "Barba - Carlos Souza", start: { dateTime: "2026-10-01T10:00:00-03:00" } },
      { id: "g2", summary: "Bloqueio", start: { dateTime: "2026-10-01T12:00:00-03:00" } },
      { id: "g3", summary: "Atendimento", start: { date: "2026-10-02" }, attendees: [{ email: "eu@negocio.com", self: true }, { email: "bia@x.com", displayName: "Bia Costa" }] },
    ]);
    expect(items.map((i) => i.externalId)).toEqual(["g1", "g3"]);
    expect(items[1].person.email).toBe("bia@x.com");
  });
  it("WhatsApp exportado (Android e iPhone)", () => {
    const android = `10/09/2026 14:02 - As mensagens e chamadas são protegidas com a criptografia de ponta a ponta.
10/09/2026 14:03 - Barbearia Central: Oi João, tudo certo para amanhã?
10/09/2026 14:05 - João Silva: Tudo sim! Até amanhã
02/10/2026 09:10 - João Silva: Tem horário sábado?`;
    const c = parseWhatsAppChat(android, "Conversa do WhatsApp com João Silva.txt");
    expect(c).toMatchObject({ contactName: "João Silva", messageCount: 3 });
    expect(c!.lastContactAt!.toISOString().slice(0, 10)).toBe("2026-10-02");
    const ios = `[15/08/26, 18:20:11] Maria: Oi! Queria marcar
[15/08/26, 18:21:40] Studio Bella: Claro, Maria!`;
    const m = parseWhatsAppChat(ios, "WhatsApp Chat - Maria.zip");
    expect(m).toMatchObject({ contactName: "Maria" });
    expect(m!.lastContactAt!.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(contactFromFilename("WhatsApp Chat with +55 11 98888-7777.txt")).toBe("+55 11 98888-7777");
    const num = parseWhatsAppChat(`01/09/2026 10:00 - +55 11 98888-7777: oi`, "WhatsApp Chat with +55 11 98888-7777.txt");
    expect(num!.phone).toBe("+5511988887777");
  });
  it("descobre o dono do comércio entre várias conversas", () => {
    const a = `01/09/2026 10:00 - Loja X: oi\n01/09/2026 10:01 - Ana: oi`;
    const b = `02/09/2026 10:00 - Loja X: oi\n02/09/2026 10:01 - Bruno: oi`;
    const owners = guessOwnerNames([a, b]);
    expect([...owners]).toEqual(["Loja X"]);
    expect(parseWhatsAppChat(b, "chat.txt", owners)!.contactName).toBe("Bruno");
  });
  it("contatos .vcf (inclui quoted-printable)", () => {
    const vcf = `BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;Jo=C3=A3o;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Silva
TEL;CELL:+55 11 98765-4321
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Sem Telefone
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Ana Lima
TEL;TYPE=HOME:(11) 3333-4444
TEL;TYPE=CELL:(11) 99999-0000
EMAIL:ana@x.com
END:VCARD`;
    expect(parseVcf(vcf)).toEqual([
      { name: "João Silva", phone: "+5511987654321", email: null },
      { name: "Ana Lima", phone: "+5511999990000", email: "ana@x.com" },
    ]);
  });
  it("zip de exportação é lido (fflate)", () => {
    const z = zipSync({ "_chat.txt": strToU8("01/09/2026 10:00 - Ana: oi") });
    expect(z.length).toBeGreaterThan(0);
  });
});

let org: Organization, userId: string;
beforeAll(async () => {
  await getDb();
  const a = await createAccount({ name: "Dono", email: "fontes@teste.com", password: "senhaSegura123", orgName: "Barbearia Fontes" });
  const db = await getDb();
  [org] = await db.update(organizations).set({ segment: "barbershop", settings: { useIndividualRhythm: false } }).where(eq(organizations.id, a.org.id)).returning();
  userId = a.user.id;
});

describe("ingestão sem planilha", () => {
  it("agenda: visitas passadas, futuros, deduplicação e reimportação idempotente", async () => {
    const items = parseIcs(ICS).flatMap((e) => { const p = personFromEvent(e); return p ? [{ externalId: e.id, start: e.start, person: p, service: p.service, cancelled: e.cancelled }] : []; });
    const r = await withOrg(org.id, (tx) => ingestAppointments(tx, org, "ics", items, userId));
    expect(r).toMatchObject({ visits: 2, upcoming: 1, created: 2 });
    const [joao] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.phone, "+5511987654321")));
    expect(joao).toMatchObject({ name: "João Silva", visitCount: 2, lastVisitAt: addDays(T, -10), status: "active", favoriteService: "Corte" });
    const again = await withOrg(org.id, (tx) => ingestAppointments(tx, org, "ics", items, userId));
    expect(again).toMatchObject({ visits: 0, created: 0 });
  });
  it("WhatsApp: última conversa vira atividade e define quem está sumindo", async () => {
    const old = new Date(Date.now() - 50 * 86_400_000);
    await withOrg(org.id, (tx) => ingestContacts(tx, org, "whatsapp_export", [{ person: { name: "Carla Dias", phone: "+5511977776666" }, lastContactAt: old, messageCount: 12 }], userId));
    const [c] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.phone, "+5511977776666")));
    expect(c.status).toBe("inactive"); // 50 dias sem falar → inativo (barbearia: 30)
    expect(classify(c, resolveSettings({ ...org, settings: { countContactAsActivity: false } }), T).status).toBe("unknown");
    // mensagem nova pela API oficial reativa
    await withOrg(org.id, (tx) => touchContact(tx, org, "+5511977776666", null, true));
    const [c2] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.phone, "+5511977776666")));
    expect(c2.contactCount).toBe(13);
  });
  it("WhatsApp oficial cria cliente novo pela primeira mensagem", async () => {
    const id = await withOrg(org.id, (tx) => touchContact(tx, org, "+5521966665555", "Bruno Lima", true));
    const [c] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.id, id!)));
    expect(c).toMatchObject({ name: "Bruno Lima", source: "whatsapp", contactCount: 1 });
  });
  it("atendimento rápido e conclusão de agendamento viram visitas", async () => {
    const r = await withOrg(org.id, (tx) => quickCheckIn(tx, org, { name: "Diego Alves", phone: "+5511955554444", service: "Corte", staff: null, amountCents: 6000, date: T, consentWhatsapp: true }, userId));
    const [d] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.id, r.customerId)));
    expect(d).toMatchObject({ visitCount: 1, totalSpentCents: 6000, consentWhatsapp: true, lastVisitAt: T });
    const [maria] = await withOrg(org.id, (tx) => tx.select().from(appointments).where(eq(appointments.status, "confirmed")));
    await withOrg(org.id, (tx) => completeAppointment(tx, org, maria.id, 9000));
    const [m] = await withOrg(org.id, (tx) => tx.select().from(customers).where(eq(customers.id, maria.customerId!)));
    expect(m).toMatchObject({ visitCount: 1, totalSpentCents: 9000 });
    await expect(withOrg(org.id, (tx) => completeAppointment(tx, org, maria.id, 9000))).rejects.toThrow(/já foi registrado/);
  });
  it("contatos .vcf não duplicam clientes existentes", async () => {
    const r = await withOrg(org.id, (tx) => ingestContacts(tx, org, "vcf", [
      { person: { name: "João Silva", phone: "+5511987654321" }, lastContactAt: null, messageCount: 0 },
      { person: { name: "Nova Pessoa", phone: "+5511944443333" }, lastContactAt: null, messageCount: 0 },
    ], userId));
    expect(r).toMatchObject({ matched: 2, created: 1 });
  });
});
