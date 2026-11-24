"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { AccountExistsError, authenticate, createAccount, createSession, deleteSession, validatePassword } from "@/lib/auth/core";
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { requestPasswordReset, resetPassword, sendVerificationEmail } from "@/lib/auth/tokens";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import { eq } from "drizzle-orm";

/** `values` devolve o que a pessoa digitou (nunca a senha) para o formulário não ser apagado após um erro. */
export interface FormState { error?: string; values?: Record<string, string> }

const SignupSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().email("E-mail inválido."),
  password: z.string(),
  orgName: z.string().trim().min(2, "Informe o nome do estabelecimento."),
  terms: z.literal("on", { message: "É preciso aceitar os termos e a política de privacidade." }),
});

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(fd));
  const values = { name: String(fd.get("name") ?? ""), orgName: String(fd.get("orgName") ?? ""), email: String(fd.get("email") ?? ""), terms: String(fd.get("terms") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const pwErr = validatePassword(parsed.data.password);
  if (pwErr) return { error: pwErr, values };
  const ip = await clientIp();
  const rl = rateLimit(`signup:${parsed.data.email.toLowerCase()}`, 5, 3600_000);
  const rlIp = rateLimit(`signup-ip:${ip}`, 10, 3600_000);
  if (!rl.ok || !rlIp.ok) return { error: "Muitas tentativas. Tente mais tarde.", values };
  try {
    const { user, org } = await createAccount(parsed.data);
    const s = await createSession(user.id, org.id);
    await setSessionCookie(s.token, s.expiresAt);
    await sendVerificationEmail(user.id).catch(() => undefined);
  } catch (e) {
    if (e instanceof AccountExistsError) return { error: "Não foi possível criar a conta com este e-mail. Se você já tem cadastro, entre ou use “Esqueci minha senha”.", values };
    return { error: "Não foi possível criar a conta. Tente novamente.", values };
  }
  redirect("/onboarding");
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const values = { email: String(fd.get("email") ?? "").trim() };
  const rl = rateLimit(`login:${email}`, 8, 15 * 60_000);
  const rlIp = rateLimit(`login-ip:${await clientIp()}`, 30, 15 * 60_000);
  if (!rlIp.ok) return { error: `Muitas tentativas deste dispositivo. Aguarde ${Math.ceil(rlIp.retryInSec / 60)} min.`, values };
  if (!rl.ok) return { error: `Muitas tentativas. Aguarde ${Math.ceil(rl.retryInSec / 60)} min.`, values };
  const user = await authenticate(email, password);
  if (!user) return { error: "E-mail ou senha incorretos.", values };
  const db = await getDb();
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
  const s = await createSession(user.id, m?.orgId ?? null);
  await setSessionCookie(s.token, s.expiresAt);
  redirect("/visao-geral");
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  await clearSessionCookie();
  redirect("/login");
}

export interface ResetState { error?: string; done?: boolean }

export async function forgotPasswordAction(_: ResetState, fd: FormData): Promise<ResetState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "E-mail inválido." };
  const ok = rateLimit(`forgot:${email}`, 3, 3600_000).ok && rateLimit(`forgot-ip:${await clientIp()}`, 10, 3600_000).ok;
  if (!ok) return { error: "Muitas solicitações. Tente mais tarde." };
  await requestPasswordReset(email).catch((e) => console.error("[auth] falha ao gerar link de senha", e instanceof Error ? e.message : e));
  return { done: true }; // mesma resposta exista ou não a conta
}

export async function resetPasswordAction(_: ResetState, fd: FormData): Promise<ResetState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  if (!rateLimit(`reset-ip:${await clientIp()}`, 10, 15 * 60_000).ok) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  try { await resetPassword(token, password); } catch (e) { return { error: e instanceof Error ? e.message : "Não foi possível redefinir a senha." }; }
  return { done: true };
}
