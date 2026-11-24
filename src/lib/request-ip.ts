import { headers } from "next/headers";

/** IP do cliente atrás de proxy (Vercel/Cloudflare). Usado só para limitar tentativas; nunca é gravado. */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || h.get("cf-connecting-ip") || "local").trim().slice(0, 64);
}
