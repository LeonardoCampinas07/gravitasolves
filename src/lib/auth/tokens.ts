/**
 * Tokens de uso único (recuperação de senha e verificação de e-mail).
 * No banco fica só o SHA-256 do token; o token em si só existe no link enviado por e-mail.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authTokens, sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl, sendMail } from "@/lib/email";
import { hashPassword, normalizeEmail, validatePassword } from "./core";

type Purpose = "password_reset" | "email_verify";
const TTL: Record<Purpose, number> = { password_reset: 60 * 60_000, email_verify: 3 * 86_400_000 };

export async function issueToken(userId: string, purpose: Purpose) {
  const db = await getDb();
  // Um link válido por vez: invalida os anteriores do mesmo tipo.
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const token = randomToken(32);
  await db.insert(authTokens).values({ tokenHash: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + TTL[purpose]) });
  return token;
}

/** Marca o token como usado e devolve o usuário; null se inválido, expirado ou já usado. */
export async function consumeToken(token: string, purpose: Purpose): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}

export async function peekToken(token: string, purpose: Purpose) {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return false;
  const db = await getDb();
  const [row] = await db.select({ u: authTokens.userId }).from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  return Boolean(row);
}

/** Sempre "sucesso" para quem chama — não revela se o e-mail tem conta. */
export async function requestPasswordReset(email: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, normalizeEmail(email)));
  if (!u) return;
  const token = await issueToken(u.id, "password_reset");
  const link = `${appUrl()}/redefinir-senha?token=${token}`;
  await sendMail({
    to: u.email, subject: "Redefinir sua senha — GravitaSolves",
    text: `Olá, ${u.name.split(" ")[0]}.\n\nPara criar uma nova senha, abra o link abaixo (vale por 1 hora e só pode ser usado uma vez):\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.`,
  });
}

export async function resetPassword(token: string, password: string) {
  const err = validatePassword(password);
  if (err) throw new Error(err);
  const userId = await consumeToken(token, "password_reset");
  if (!userId) throw new Error("Link inválido ou expirado. Peça um novo.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Clicar no link prova a posse do e-mail.
    await tx.update(users).set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId)); // desconecta todos os dispositivos
  });
  return userId;
}

export async function sendVerificationEmail(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.emailVerifiedAt) return;
  const token = await issueToken(u.id, "email_verify");
  await sendMail({
    to: u.email, subject: "Confirme seu e-mail — GravitaSolves",
    text: `Olá, ${u.name.split(" ")[0]}.\n\nConfirme seu e-mail para proteger sua conta e poder recuperar a senha:\n${appUrl()}/verificar-email?token=${token}\n\nO link vale por 3 dias.`,
  });
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "email_verify");
  if (!userId) return false;
  const db = await getDb();
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return true;
}
