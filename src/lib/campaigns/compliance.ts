/**
 * Regras de elegibilidade de contato (LGPD + políticas das plataformas). Funções puras.
 * Aplicadas na criação da campanha e novamente no momento do envio.
 */
import type { Channel, Customer } from "@/db/schema";
import type { OrgSettings } from "@/lib/settings";
import { daysBetween, dayOf } from "@/lib/dates";
import { getSegment } from "@/lib/segments";

export type SkipReason =
  | "opted_out" | "blocked" | "no_contact" | "no_consent" | "frequency_cap" | "monthly_cap" | "demo";

export const SKIP_LABEL: Record<SkipReason, string> = {
  opted_out: "Cliente pediu para não receber mensagens",
  blocked: "Contato na lista de bloqueio",
  no_contact: "Sem telefone/e-mail válido para este canal",
  no_consent: "Sem autorização registrada para este canal",
  frequency_cap: "Recebeu mensagem recentemente (limite de frequência)",
  monthly_cap: "Atingiu o máximo de mensagens em 30 dias",
  demo: "Cliente de demonstração — não recebe mensagens reais",
};

export interface ContactHistory { lastSentAt: Date | null; sentLast30Days: number }

export function contactAddress(c: Pick<Customer, "phone" | "email">, channel: Channel) {
  return channel === "email" ? c.email : c.phone;
}

export function hasChannelPermission(
  c: Pick<Customer, "consentWhatsapp" | "consentEmail" | "consentSms" | "legalBasis">,
  channel: Channel,
  s: Pick<OrgSettings, "allowLegitimateInterestEmail">,
) {
  if (channel === "whatsapp") return c.consentWhatsapp; // a Meta exige opt-in para mensagens iniciadas pela empresa
  if (channel === "sms") return c.consentSms;
  return c.consentEmail || (s.allowLegitimateInterestEmail && c.legalBasis === "legitimate_interest");
}

export function checkEligibility(
  c: Pick<Customer, "phone" | "email" | "consentWhatsapp" | "consentEmail" | "consentSms" | "legalBasis" | "optedOutAt" | "isDemo">,
  channel: Channel,
  s: OrgSettings,
  blocked: Set<string>,
  history: ContactHistory,
  todayStr: string,
): { ok: true } | { ok: false; reason: SkipReason } {
  if (c.isDemo) return { ok: false, reason: "demo" };
  if (c.optedOutAt) return { ok: false, reason: "opted_out" };
  if ((c.phone && blocked.has(c.phone)) || (c.email && blocked.has(c.email))) return { ok: false, reason: "blocked" };
  if (!contactAddress(c, channel)) return { ok: false, reason: "no_contact" };
  if (!hasChannelPermission(c, channel, s)) return { ok: false, reason: "no_consent" };
  if (history.lastSentAt && daysBetween(dayOf(history.lastSentAt), todayStr) < s.frequencyCapDays)
    return { ok: false, reason: "frequency_cap" };
  if (history.sentLast30Days >= s.maxMessagesPer30Days) return { ok: false, reason: "monthly_cap" };
  return { ok: true };
}

/** Avisos de conteúdo (não bloqueiam, orientam a revisão humana). */
export function lintMessage(text: string, channel: Channel, segmentId: string): string[] {
  const w: string[] = [];
  const seg = getSegment(segmentId);
  if (seg.id === "dental" && /(desconto|promo|grátis|gratis|%|r\$\s?\d|oferta)/i.test(text))
    w.push("Clínicas odontológicas não podem anunciar descontos, preços ou promoções (Código de Ética do CFO).");
  if (seg.id === "aesthetics" && /(garant|result(ado)? (certo|garantido)|100%)/i.test(text))
    w.push("Evite prometer resultados em procedimentos estéticos.");
  if (channel === "sms" && text.length > 300) w.push("Mensagem longa para SMS (mais de 2 segmentos). Considere encurtar.");
  if (text.length > 700) w.push("Mensagem muito longa; mensagens curtas têm mais resposta.");
  const letters = text.replace(/[^A-Za-zÀ-ú]/g, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) w.push("Evite escrever tudo em maiúsculas.");
  if ((text.match(/!/g) ?? []).length > 3) w.push("Excesso de exclamações pode soar como spam.");
  return w;
}

/** Rodapé de opt-out acrescentado automaticamente (nunca depende do texto gerado). */
export function optOutFooter(channel: Channel) {
  if (channel === "email") return ""; // e-mail leva link de descadastro no rodapé HTML/texto
  return "\n\nPara não receber mais mensagens, responda SAIR.";
}

export const OPT_OUT_KEYWORDS = ["sair", "parar", "pare", "stop", "cancelar", "descadastrar", "remover", "nao quero", "não quero"];
export function isOptOutMessage(body: string | null | undefined) {
  if (!body) return false;
  const s = body.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s]/g, "");
  return OPT_OUT_KEYWORDS.some((k) => s === k.normalize("NFD").replace(/[̀-ͯ]/g, "") || s.startsWith(k + " "));
}
