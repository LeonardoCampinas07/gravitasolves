import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authTokens, sessions, users } from "@/db/schema";
import { AccountExistsError, authenticate, createAccount, createSession, resolveSession } from "@/lib/auth/core";
import { consumeToken, issueToken, peekToken, requestPasswordReset, resetPassword, sendVerificationEmail, verifyEmail } from "@/lib/auth/tokens";
import { sha256 } from "@/lib/crypto";

let userId: string;
const mails: string[] = [];

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation((m: string) => { mails.push(String(m)); });
  const a = await createAccount({ name: "Dono Token", email: "token@teste.com", password: "senhaSegura123", orgName: "Studio T" });
  userId = a.user.id;
});

describe("recuperação de senha", () => {
  it("e-mail inexistente não gera token nem erro (não revela contas)", async () => {
    await expect(requestPasswordReset("ninguem@teste.com")).resolves.toBeUndefined();
  });

  it("guarda só o hash; token é de uso único e derruba as sessões", async () => {
    const s = await createSession(userId, null);
    const token = await issueToken(userId, "password_reset");
    const db = await getDb();
    const rows = await db.select().from(authTokens).where(eq(authTokens.userId, userId));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect(rows.some((r) => r.tokenHash === sha256(token))).toBe(true);
    expect(await peekToken(token, "password_reset")).toBe(true);
    expect(await peekToken(token, "email_verify")).toBe(false);

    await expect(resetPassword(token, "curta")).rejects.toThrow(/10 caracteres/);
    await resetPassword(token, "novaSenhaForte9");
    expect(await authenticate("token@teste.com", "novaSenhaForte9")).not.toBeNull();
    expect(await authenticate("token@teste.com", "senhaSegura123")).toBeNull();
    expect(await resolveSession(s.token)).toBeNull();
    expect((await db.select().from(sessions).where(eq(sessions.userId, userId))).length).toBe(0);
    await expect(resetPassword(token, "outraSenha123")).rejects.toThrow(/inválido ou expirado/);
  });

  it("novo link invalida o anterior; token expirado é recusado", async () => {
    const t1 = await issueToken(userId, "password_reset");
    const t2 = await issueToken(userId, "password_reset");
    expect(await consumeToken(t1, "password_reset")).toBeNull();
    const db = await getDb();
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.tokenHash, sha256(t2)));
    expect(await consumeToken(t2, "password_reset")).toBeNull();
    expect(await consumeToken("lixo", "password_reset")).toBeNull();
  });
});

describe("verificação de e-mail", () => {
  it("link de verificação confirma o e-mail uma única vez", async () => {
    const db = await getDb();
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, userId));
    mails.length = 0;
    await sendVerificationEmail(userId);
    const link = mails.join("\n").match(/verificar-email\?token=([A-Za-z0-9_-]+)/);
    expect(link).not.toBeNull();
    expect(await verifyEmail(link![1])).toBe(true);
    expect(await verifyEmail(link![1])).toBe(false);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.emailVerifiedAt).not.toBeNull();
  });
});

describe("cadastro", () => {
  it("e-mail repetido gera erro tipado (a interface mostra mensagem genérica)", async () => {
    await expect(createAccount({ name: "X", email: "TOKEN@teste.com", password: "senhaSegura123", orgName: "Y" })).rejects.toBeInstanceOf(AccountExistsError);
  });
});
