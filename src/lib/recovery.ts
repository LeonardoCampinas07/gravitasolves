/**
 * Central de recuperação: justificativa em linguagem simples e próximo passo para cada cliente,
 * calculados só com os dados reais dele (sem IA, custo zero). Funções puras — testáveis.
 */
import { classify, type ClassifiableCustomer } from "./classification";
import type { OrgSettings } from "./settings";
import { daysBetween, dayOf } from "./dates";
import { money } from "./format";

export interface RecoveryCustomer extends ClassifiableCustomer {
  status: string;
  avgTicketCents: number;
  optedOutAt: Date | null;
  phone: string | null;
  email: string | null;
  consentWhatsapp: boolean;
  consentEmail: boolean;
  consentSms: boolean;
}

export type NextStepKind = "invite" | "winback" | "consent" | "wait" | "blocked" | "follow";
export interface RecoveryReason { why: string; detail: string | null; next: { kind: NextStepKind; text: string } }

export const PRIORITY_MIN_SCORE = 70;

export function hasContactChannel(c: RecoveryCustomer, s: Pick<OrgSettings, "allowLegitimateInterestEmail">) {
  return (c.consentWhatsapp && !!c.phone) || (c.consentSms && !!c.phone) || (c.consentEmail && !!c.email)
    || (s.allowLegitimateInterestEmail && !!c.email);
}

export function recoveryReason(c: RecoveryCustomer, s: OrgSettings, todayStr: string, medianTicketCents = 0): RecoveryReason {
  const cl = classify(c, s, todayStr);
  let why: string;
  if (c.status === "recovered") why = "Voltou depois de receber uma mensagem de campanha.";
  else if (cl.daysSince === null) why = "Sem data de visita registrada.";
  else if (cl.personalInterval) {
    const every = Math.max(1, Math.round(cl.personalInterval));
    const ratio = cl.daysSince / every;
    why = `Voltava a cada ~${every} dias; está há ${cl.daysSince}${ratio >= 1.5 ? ` (${ratio.toFixed(1).replace(".", ",")}× o normal)` : ""}.`;
  } else why = `Está há ${cl.daysSince} dias sem vir (em risco a partir de ${cl.thresholds.atRiskDays}).`;

  const extras: string[] = [];
  if (c.visitCount >= 5) extras.push(`cliente fiel (${c.visitCount} visitas)`);
  if (medianTicketCents > 0 && c.avgTicketCents >= medianTicketCents * 1.5) extras.push(`ticket alto (${money(c.avgTicketCents)})`);
  const detail = extras.length ? extras.join(" · ") : null;

  if (c.status === "recovered") return { why, detail, next: { kind: "follow", text: "Acompanhar — já voltou" } };
  if (c.optedOutAt) return { why, detail, next: { kind: "blocked", text: "Não contatar (pediu para sair)" } };
  if (!hasContactChannel(c, s)) return { why, detail, next: { kind: "consent", text: "Pedir autorização de contato" } };
  if (c.lastContactAt) {
    const since = daysBetween(dayOf(c.lastContactAt), todayStr);
    if (since < s.frequencyCapDays) return { why, detail, next: { kind: "wait", text: `Aguardar ${s.frequencyCapDays - since} dia(s) — contatado há pouco` } };
  }
  if (c.status === "highly_inactive") return { why, detail, next: { kind: "winback", text: "Mensagem de reconquista com oferta" } };
  return { why, detail, next: { kind: "invite", text: "Convite para voltar" } };
}
