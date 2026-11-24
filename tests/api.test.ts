/** API pública /api/v1: autenticação por chave, plano, cadastro de clientes e registro de visitas. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { apiKeys, customers, organizations } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";
import { sha256 } from "@/lib/crypto";
import { addDays, today } from "@/lib/dates";
import { POST as postCustomers } from "@/app/api/v1/customers/route";
import { POST as postVisits } from "@/app/api/v1/visits/route";

const KEY = "gv_testeapi_0123456789abcdef0123456789";
let orgId: string;
const st = async (p: Promise<Response | undefined>) => (await p)!.status;

const req = (body: unknown, key = KEY) => new Request("http://localhost/api/v1", {
  method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeAll(async () => {
  const a = await createAccount({ name: "Dona API", email: "api@teste.com", password: "senhaSegura123", orgName: "Barbearia API" });
  orgId = a.org.id;
  const db = await getDb();
  await db.update(organizations).set({ segment: "barbershop", planId: "basic" }).where(eq(organizations.id, orgId));
  await db.insert(apiKeys).values({ orgId, name: "Teste", prefix: KEY.slice(0, 9), keyHash: sha256(KEY) });
});

describe("API pública v1", () => {
  it("recusa chave ausente, inválida e plano sem API", async () => {
    expect(await st(postCustomers(req({ customers: [] }, "x")))).toBe(401);
    expect(await st(postCustomers(req({ customers: [] }, "gv_inexistente")))).toBe(401);
    expect(await st(postCustomers(req({ customers: [{ name: "A" }] })))).toBe(403);
    const db = await getDb();
    await db.update(organizations).set({ planId: "pro" }).where(eq(organizations.id, orgId));
  });
  it("valida o corpo", async () => {
    expect(await st(postCustomers(req({ customers: [] })))).toBe(400);
    expect(await st(postVisits(req({ customer: {}, date: today() })))).toBe(400);
  });
  it("cadastra clientes e registra visita (cliente reclassificado)", async () => {
    const r = await postCustomers(req({ customers: [
      { name: "Cliente API", phone: "(11) 98888-0001", last_visit: addDays(today(), -50), visit_count: 3, total_spent: 240, consent_whatsapp: true },
    ] }));
    expect(r!.status).toBeLessThan(300);
    const [c] = await withOrg(orgId, (tx) => tx.select().from(customers).where(eq(customers.orgId, orgId)));
    expect(c.status).toBe("inactive");
    expect(c.priorityScore).toBeGreaterThan(0);
    const v = await postVisits(req({ customer: { phone: "+5511988880001" }, date: today(), amount: 80 }));
    expect(v!.status).toBe(201);
    const [u] = await withOrg(orgId, (tx) => tx.select().from(customers).where(eq(customers.id, c.id)));
    expect(u.status).toBe("active");
    expect(await st(postVisits(req({ customer: { phone: "+5511900000000" }, date: today() })))).toBe(404);
  });
  it("chave revogada deixa de funcionar", async () => {
    const db = await getDb();
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.orgId, orgId));
    expect(await st(postVisits(req({ customer: { phone: "+5511988880001" }, date: today() })))).toBe(401);
  });
});
