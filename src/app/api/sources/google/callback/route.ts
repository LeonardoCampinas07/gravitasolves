import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/session";
import { connectGoogle, syncGoogle, verifyState } from "@/lib/sources/google";

/** Retorno do OAuth do Google: confere o estado assinado e a sessão, guarda o token cifrado e sincroniza. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/fontes?${q}`, req.url));
  if (u.searchParams.get("error")) return back("google=cancelado");
  const st = verifyState(u.searchParams.get("state") ?? "");
  const ctx = await getContext();
  if (!st || !ctx || ctx.sim || ctx.org.id !== st.orgId || ctx.user.id !== st.userId) return back("google=invalido");
  try {
    await connectGoogle(st.orgId, u.searchParams.get("code") ?? "");
    await syncGoogle(st.orgId, st.userId);
    return back("google=conectado");
  } catch (e) {
    return back(`google=erro&msg=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 120) : "erro")}`);
  }
}
