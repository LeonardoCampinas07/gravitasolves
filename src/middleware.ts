import { NextResponse, type NextRequest } from "next/server";

/** Barreira leve: sem cookie de sessão → login. A validação real da sessão ocorre no servidor (requireCtx). */
const PROTECTED = ["/visao-geral", "/agenda", "/fontes", "/clientes", "/inativos", "/agente", "/campanhas", "/automacoes", "/resultados", "/integracoes", "/configuracoes", "/ajuda", "/onboarding"];

/**
 * Modo de teste privado: com PREVIEW_ACCESS_KEY definido, o site inteiro só abre para quem chegou pelo link
 * `?acesso=<chave>` (que grava um cookie). Quem não tem o link recebe 404. Sem a variável, nada muda.
 * /api/cron/ fica de fora porque já exige o CRON_SECRET.
 */
const GATE_COOKIE = "gravita_preview";

function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function previewGate(req: NextRequest): NextResponse | null {
  const key = process.env.PREVIEW_ACCESS_KEY?.trim();
  if (!key || req.nextUrl.pathname.startsWith("/api/cron/")) return null;
  const given = req.nextUrl.searchParams.get("acesso");
  if (given && sameKey(given, key)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("acesso");
    const res = NextResponse.redirect(url);
    res.cookies.set(GATE_COOKIE, key, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  if (sameKey(req.cookies.get(GATE_COOKIE)?.value ?? "", key)) return null;
  return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" } });
}

export function middleware(req: NextRequest) {
  const blocked = previewGate(req);
  if (blocked) return blocked;
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("gravita_session") && req.cookies.get("gravita_sim")?.value !== "1") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (process.env.PREVIEW_ACCESS_KEY) res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/((?!_next|icon.svg|favicon.ico).*)"] };
