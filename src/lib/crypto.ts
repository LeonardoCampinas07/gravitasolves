import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY deve ter 32 bytes em base64");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY é obrigatório em produção");
  // Desenvolvimento: chave derivada fixa (NUNCA usar em produção).
  return createHash("sha256").update("gravita-dev-only-key").digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Formato de segredo desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

function appSecret() {
  const s = process.env.APP_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("APP_SECRET é obrigatório em produção");
  return s ?? "gravita-dev-only-secret";
}

export function sign(value: string) {
  return createHmac("sha256", appSecret()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Token de descadastro: <orgId>.<customerId>.<assinatura>. Não expira (o opt-out precisa funcionar sempre). */
export function unsubscribeToken(orgId: string, customerId: string) {
  const v = `${orgId}.${customerId}`;
  return `${v}.${sign(v)}`;
}
export function verifyUnsubscribeToken(token: string): { orgId: string; customerId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [orgId, customerId, sig] = parts;
  return safeEqual(sig, sign(`${orgId}.${customerId}`)) ? { orgId, customerId } : null;
}
