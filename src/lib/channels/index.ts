/**
 * Adaptadores de canal. Cada um usa a API oficial do provedor com as credenciais que a empresa
 * cadastrou em Integrações (segredo cifrado no banco). Sem credencial → canal indisponível;
 * o sistema nunca simula um envio.
 */
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { integrations, type Channel, type Provider } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

export interface OutgoingMessage {
  to: string;              // E.164 ou e-mail
  body: string;
  subject?: string | null;
  firstName: string;
  unsubscribeUrl: string;
  businessName: string;
}
export interface SendResult { providerMessageId: string }

export interface ChannelAdapter {
  provider: Provider;
  send(msg: OutgoingMessage): Promise<SendResult>;
  test(): Promise<string>;
}

export const CHANNEL_PROVIDER: Record<Channel, Provider> = { whatsapp: "whatsapp_cloud", email: "resend", sms: "twilio" };
export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", email: "E-mail", sms: "SMS" };

export class ChannelError extends Error {}

async function readJson(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

/** WhatsApp Business Platform (Cloud API, Meta). Mensagens iniciadas pela empresa exigem template aprovado. */
export function whatsappAdapter(config: Record<string, string>, accessToken: string): ChannelAdapter {
  const version = config.apiVersion || "v21.0";
  const base = `https://graph.facebook.com/${version}/${config.phoneNumberId}`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  return {
    provider: "whatsapp_cloud",
    async send(msg) {
      // Parâmetros de template não aceitam quebras de linha/tabulações nem 4+ espaços seguidos.
      const text = msg.body.replace(/\s*\n+\s*/g, " ").replace(/\s{4,}/g, " ").slice(0, 1000);
      const res = await fetch(`${base}/messages`, {
        method: "POST", headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage || "pt_BR" },
            components: [{ type: "body", parameters: [{ type: "text", text: msg.firstName || "cliente" }, { type: "text", text }] }],
          },
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.error?.message ?? `WhatsApp HTTP ${res.status}`);
      return { providerMessageId: data.messages?.[0]?.id ?? "" };
    },
    async test() {
      const res = await fetch(`${base}?fields=display_phone_number,verified_name`, { headers });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.error?.message ?? `HTTP ${res.status}`);
      return `Conectado: ${data.verified_name ?? ""} ${data.display_phone_number ?? ""}`.trim();
    },
  };
}

/** E-mail via Resend (https://resend.com). */
export function resendAdapter(config: Record<string, string>, apiKey: string): ChannelAdapter {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    provider: "resend",
    async send(msg) {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1f1c">${esc(msg.body).replace(/\n/g, "<br>")}
<hr style="border:none;border-top:1px solid #e4e7e1;margin:24px 0">
<p style="font-size:12px;color:#6b726e">Você recebeu este e-mail por ser cliente de ${esc(msg.businessName)}.
<a href="${msg.unsubscribeUrl}" style="color:#6b726e">Não quero mais receber</a>.</p></div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers,
        body: JSON.stringify({
          from: config.from, to: [msg.to], subject: msg.subject || `Uma mensagem de ${msg.businessName}`,
          text: `${msg.body}\n\n—\nPara não receber mais: ${msg.unsubscribeUrl}`, html,
          reply_to: config.replyTo || undefined,
          headers: { "List-Unsubscribe": `<${msg.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.message ?? `Resend HTTP ${res.status}`);
      return { providerMessageId: data.id ?? "" };
    },
    async test() {
      const res = await fetch("https://api.resend.com/domains", { headers });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.message ?? `HTTP ${res.status}`);
      return `Conectado: ${(data.data ?? []).length} domínio(s) cadastrado(s)`;
    },
  };
}

/** SMS via Twilio Programmable Messaging. */
export function twilioAdapter(config: Record<string, string>, authToken: string, statusCallback?: string): ChannelAdapter {
  const auth = "Basic " + Buffer.from(`${config.accountSid}:${authToken}`).toString("base64");
  const base = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
  return {
    provider: "twilio",
    async send(msg) {
      const form = new URLSearchParams({ To: msg.to, Body: msg.body });
      if (config.from?.startsWith("MG")) form.set("MessagingServiceSid", config.from); else form.set("From", config.from);
      if (statusCallback) form.set("StatusCallback", statusCallback);
      const res = await fetch(`${base}/Messages.json`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.message ?? `Twilio HTTP ${res.status}`);
      return { providerMessageId: data.sid ?? "" };
    },
    async test() {
      const res = await fetch(`${base}.json`, { headers: { Authorization: auth } });
      const data = await readJson(res);
      if (!res.ok) throw new ChannelError(data?.message ?? `HTTP ${res.status}`);
      return `Conectado: ${data.friendly_name ?? config.accountSid}`;
    },
  };
}

export const PROVIDER_FIELDS: Record<Provider, { label: string; channel: Channel; fields: { key: string; label: string; placeholder?: string; required?: boolean }[]; secretLabel: string; docs: string }> = {
  whatsapp_cloud: {
    label: "WhatsApp oficial (Meta)", channel: "whatsapp", secretLabel: "Token de acesso permanente",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    fields: [
      { key: "phoneNumberId", label: "ID do número de telefone (Phone Number ID)", required: true },
      { key: "wabaId", label: "ID da conta do WhatsApp Business (opcional)" },
      { key: "templateName", label: "Nome do modelo de mensagem aprovado", placeholder: "reativacao_cliente", required: true },
      { key: "templateLanguage", label: "Idioma do modelo", placeholder: "pt_BR" },
    ],
  },
  resend: {
    label: "E-mail (Resend)", channel: "email", secretLabel: "API key do Resend", docs: "https://resend.com/docs",
    fields: [
      { key: "from", label: "Remetente", placeholder: "Barbearia X <contato@seudominio.com.br>", required: true },
      { key: "replyTo", label: "Responder para", placeholder: "contato@seudominio.com.br" },
    ],
  },
  twilio: {
    label: "SMS (Twilio)", channel: "sms", secretLabel: "Auth Token", docs: "https://www.twilio.com/docs/messaging",
    fields: [
      { key: "accountSid", label: "Account SID", required: true },
      { key: "from", label: "Número remetente (+55…) ou Messaging Service SID (MG…)", required: true },
    ],
  },
};

export async function getAdapter(tx: Tx, orgId: string, channel: Channel): Promise<ChannelAdapter | null> {
  const provider = CHANNEL_PROVIDER[channel];
  const [row] = await tx.select().from(integrations).where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
  if (!row || !row.secretEncrypted || row.status === "disabled") return null;
  return buildAdapter(provider, row.config, decryptSecret(row.secretEncrypted), orgId);
}

export function buildAdapter(provider: Provider, config: Record<string, string>, secret: string, orgId: string): ChannelAdapter {
  if (provider === "whatsapp_cloud") return whatsappAdapter(config, secret);
  if (provider === "resend") return resendAdapter(config, secret);
  const appUrl = process.env.APP_URL;
  return twilioAdapter(config, secret, appUrl?.startsWith("https://") ? `${appUrl}/api/webhooks/twilio?org=${orgId}` : undefined);
}
