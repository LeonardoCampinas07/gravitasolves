/** Autenticação da API pública (/api/v1) por chave Bearer. Guarda só o SHA-256 da chave. */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { apiKeys, organizations } from "@/db/schema";
import { sha256 } from "./crypto";
import { getPlan } from "./plans";
import { rateLimit } from "./rate-limit";

export async function authenticateApi(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!key.startsWith("gv_")) return { error: json({ error: "Chave de API ausente ou inválida" }, 401) };
  const rl = rateLimit(`api:${key.slice(0, 12)}`, 120, 60_000);
  if (!rl.ok) return { error: json({ error: "Limite de requisições excedido" }, 429) };
  const db = await getDb();
  const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, sha256(key)), isNull(apiKeys.revokedAt)));
  if (!k) return { error: json({ error: "Chave de API inválida" }, 401) };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, k.orgId));
  const plan = await withOrg(org.id, (tx) => getPlan(tx, org.planId));
  if (!plan.limits.apiAccess) return { error: json({ error: "Plano sem acesso à API" }, 403) };
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id));
  return { org };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
