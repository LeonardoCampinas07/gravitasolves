/**
 * Autenticação sem dependência do Next (testável):
 * - senha: scrypt (N=16384, r=8, p=1) com sal aleatório
 * - sessão: token aleatório no cookie; no banco fica só o SHA-256 do token
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberships, organizations, sessions, users, type Role } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, "base64"), 64);
  const expected = Buffer.from(hash, "base64");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export class AccountExistsError extends Error {}

export async function createAccount(input: { name: string; email: string; password: string; orgName: string }) {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length) throw new AccountExistsError("Já existe uma conta com este e-mail.");
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ name: input.name.trim(), email, passwordHash }).returning();
    const [org] = await tx.insert(organizations).values({ name: input.orgName.trim() }).returning();
    await tx.insert(memberships).values({ userId: user.id, orgId: org.id, role: "owner" });
    return { user, org };
  });
}

export async function authenticate(email: string, password: string) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  // Sempre executa o hash para não revelar, pelo tempo de resposta, se o e-mail existe.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$AAAA$AAAA");
  return ok && user ? user : null;
}

export async function createSession(userId: string, orgId: string | null) {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, orgId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export interface AuthContext {
  user: { id: string; name: string; email: string };
  org: typeof organizations.$inferSelect;
  role: Role;
  /** true quando é a simulação pública (empresa fictícia, somente leitura). */
  sim?: boolean;
}

/** Resolve um token de sessão para usuário + empresa + papel (verificando a associação). */
export async function resolveSession(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const db = await getDb();
  const [s] = await db.select().from(sessions)
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!s) return null;
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, s.userId));
  if (!user) return null;
  let orgId = s.orgId;
  if (!orgId) {
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    orgId = m?.orgId ?? null;
  }
  if (!orgId) return null;
  const [m] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)));
  if (!m) return null; // associação removida → sessão perde acesso imediatamente
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return null;
  return { user, org, role: m.role };
}
