import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { googleAuthUrl, googleConfigured } from "@/lib/sources/google";

export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (ctx.sim) return NextResponse.redirect(new URL("/fontes?google=simulacao", req.url)); // simulação: só leitura
  if (!can(ctx.role, "integrations:write")) return new Response("Sem permissão", { status: 403 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/fontes?google=nao-configurado", req.url));
  return NextResponse.redirect(googleAuthUrl(ctx.org.id, ctx.user.id));
}
