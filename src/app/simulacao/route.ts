import { NextResponse } from "next/server";
import { SIM_COOKIE, ensureSandbox } from "@/lib/sandbox";
import { rateLimit } from "@/lib/rate-limit";

/** Entrada da simulação pública: liga o modo "somente leitura" com a empresa fictícia e abre o painel. */
export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("cf-connecting-ip") || "local").trim();
  if (!rateLimit(`sim-enter:${ip}`, 30, 60_000).ok) return new Response("Muitas tentativas. Aguarde um minuto.", { status: 429 });
  await ensureSandbox();
  const res = NextResponse.redirect(new URL("/visao-geral?tour=1", req.url));
  res.cookies.set(SIM_COOKIE, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
