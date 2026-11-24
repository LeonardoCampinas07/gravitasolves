/**
 * npm run db:demo — cria uma conta de DEMONSTRAÇÃO com clientes fictícios (marcados como demonstração).
 * Credenciais da conta demo: definidas por DEMO_EMAIL / DEMO_PASSWORD ou geradas e impressas no terminal.
 */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, withOrg } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { createAccount } from "../src/lib/auth/core";
import { loadDemoData } from "../src/lib/demo";

async function main() {
  const email = process.env.DEMO_EMAIL ?? "demo@gravita.local";
  const password = process.env.DEMO_PASSWORD ?? `Demo${randomBytes(6).toString("hex")}1`;
  const segment = process.env.DEMO_SEGMENT ?? "barbershop";
  const { user, org } = await createAccount({ name: "Conta Demonstração", email, password, orgName: "Barbearia Demonstração" });
  const db = await getDb();
  const [o] = await db.update(organizations).set({ segment, onboardingDone: true, onboardingStep: 7, planId: "pro" }).where(eq(organizations.id, org.id)).returning();
  const r = await withOrg(o.id, (tx) => loadDemoData(tx, o, user.id));
  console.log(`Conta demo criada: ${email} / ${password}`);
  console.log(`${r.created} clientes fictícios importados (marcados como demonstração).`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
