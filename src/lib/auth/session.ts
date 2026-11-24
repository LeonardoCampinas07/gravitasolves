import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolveSession, type AuthContext } from "./core";
import { assertCan, type Permission } from "./permissions";
import { resolveSettings, type OrgSettings } from "@/lib/settings";
import { SANDBOX_USER_ID, SIM_COOKIE, SimulationError, ensureSandbox } from "@/lib/sandbox";

export const SESSION_COOKIE = "gravita_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).delete(SIM_COOKIE); // entrar de verdade encerra a simulação
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(SIM_COOKIE);
}

export const getContext = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  if (jar.get(SIM_COOKIE)?.value === "1") {
    // Simulação: empresa fictícia, só leitura (ver requireCtx).
    const org = await ensureSandbox();
    return { user: { id: SANDBOX_USER_ID, name: "Visitante", email: "visitante@simulacao.gravitasolves.invalid" }, org, role: "owner", sim: true };
  }
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

export type Ctx = AuthContext & { settings: OrgSettings };

/** Para páginas e server actions: exige sessão (e permissão, se informada). */
export async function requireCtx(permission?: Permission): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  // Na simulação nenhuma server action (criar, alterar, enviar, importar, pagar…) é executada.
  if (ctx.sim && (await headers()).get("next-action")) throw new SimulationError();
  if (permission) assertCan(ctx.role, permission);
  return { ...ctx, settings: resolveSettings(ctx.org) };
}
