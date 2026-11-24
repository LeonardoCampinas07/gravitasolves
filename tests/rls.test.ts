/**
 * RLS real: simula o papel de produção (gravita_app, sem bypass) e confirma que as políticas
 * do banco bloqueiam leitura e escrita fora da empresa corrente, mesmo sem filtro na consulta.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { customers } from "@/db/schema";
import { createAccount } from "@/lib/auth/core";

let A: string, B: string;

beforeAll(async () => {
  const db = await getDb();
  A = (await createAccount({ name: "Rls A", email: "rls-a@teste.local", password: "senhaDeTeste123", orgName: "RLS A" })).org.id;
  B = (await createAccount({ name: "Rls B", email: "rls-b@teste.local", password: "senhaDeTeste123", orgName: "RLS B" })).org.id;
  await withOrg(A, (tx) => tx.insert(customers).values({ orgId: A, name: "Só da A", phone: "+5511911110000" }));
  await withOrg(B, (tx) => tx.insert(customers).values({ orgId: B, name: "Só da B", phone: "+5511922220000" }));
  for (const stmt of [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravita_app') THEN CREATE ROLE gravita_app NOINHERIT; END IF; END $$`,
    `GRANT USAGE ON SCHEMA public TO gravita_app`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gravita_app`,
  ]) await db.execute(sql.raw(stmt));
});

/** Executa como o papel da aplicação em produção, com a empresa corrente definida. */
async function asApp<T>(org: string | null, fn: (tx: Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0]) => Promise<T>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE gravita_app`);
    if (org) await tx.execute(sql`select set_config('app.current_org', ${org}, true)`);
    return fn(tx);
  });
}

describe("RLS com o papel de produção (sem bypass)", () => {
  it("consulta sem filtro só enxerga a própria empresa", async () => {
    const rows = await asApp(A, (tx) => tx.select({ name: customers.name }).from(customers));
    expect(rows.map((r) => r.name)).toEqual(["Só da A"]);
  });
  it("sem empresa definida não enxerga nada", async () => {
    const rows = await asApp(null, (tx) => tx.select({ id: customers.id }).from(customers));
    expect(rows).toHaveLength(0);
  });
  it("inserir dado em nome de outra empresa é recusado", async () => {
    await expect(asApp(A, (tx) => tx.insert(customers).values({ orgId: B, name: "Intruso" }))).rejects.toThrow();
  });
  it("alterar ou apagar dados de outra empresa não tem efeito", async () => {
    await asApp(A, (tx) => tx.update(customers).set({ name: "Hackeado" }).where(sql`${customers.orgId} = ${B}`));
    await asApp(A, (tx) => tx.delete(customers).where(sql`${customers.orgId} = ${B}`));
    const rows = await asApp(B, (tx) => tx.select({ name: customers.name }).from(customers));
    expect(rows.map((r) => r.name)).toEqual(["Só da B"]);
  });
});
