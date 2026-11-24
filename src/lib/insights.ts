/**
 * Explicações em linguagem simples, calculadas só com dados reais do cliente:
 * por que ele merece (ou não) atenção agora e qual o próximo passo sugerido.
 */
import type { Classification } from "./classification";
import type { OrgSettings } from "./settings";
import { money } from "./format";

export interface InsightCustomer {
  status: string; visitCount: number; avgTicketCents: number; totalSpentCents: number; priorityScore: number;
  optedOutAt: Date | null; phone: string | null; email: string | null;
  consentWhatsapp: boolean; consentEmail: boolean; consentSms: boolean;
}

export type NextAction = "campaign" | "consent" | "wait" | "none";
export interface CustomerInsight { reasons: string[]; next: { action: NextAction; text: string } }

export function customerInsight(c: InsightCustomer, cl: Classification, s: OrgSettings, opts: { daysSinceLastMessage: number | null; replied: boolean }): CustomerInsight {
  const reasons: string[] = [];
  const late = ["at_risk", "inactive", "highly_inactive"].includes(c.status);
  if (cl.daysSince !== null) {
    if (late && cl.personalInterval) reasons.push(`Está há ${cl.daysSince} dias sem vir — o normal dele é voltar a cada ~${Math.round(cl.personalInterval)} dias.`);
    else if (late) reasons.push(`Está há ${cl.daysSince} dias sem vir (o limite de "em risco" é ${cl.thresholds.atRiskDays} dias).`);
  } else reasons.push("Não há data de última visita registrada.");
  if (c.visitCount >= 3) reasons.push(`Cliente fiel: já veio ${c.visitCount} vezes.`);
  if (c.totalSpentCents > 0) reasons.push(`Já gastou ${money(c.totalSpentCents)} no total (ticket médio ${money(c.avgTicketCents)}).`);
  if (opts.replied) reasons.push("Respondeu a uma mensagem de campanha.");

  const hasChannel = (c.consentWhatsapp && !!c.phone) || (c.consentSms && !!c.phone) || (c.consentEmail && !!c.email)
    || (s.allowLegitimateInterestEmail && !!c.email);

  if (c.optedOutAt) return { reasons: [...reasons, "Pediu para não receber mensagens."], next: { action: "none", text: "Não envie mensagens — respeite o pedido de descadastro." } };
  if (!late) return { reasons, next: { action: "none", text: c.status === "recovered" ? "Voltou recentemente. Nenhuma ação agora — só acompanhe." : "Está em dia. Nenhuma ação necessária agora." } };
  if (!hasChannel) return { reasons: [...reasons, "Ainda não autorizou receber mensagens."], next: { action: "consent", text: "Antes de chamar, registre a autorização de contato (WhatsApp, e-mail ou SMS) ao lado." } };
  if (opts.daysSinceLastMessage !== null && opts.daysSinceLastMessage < s.frequencyCapDays) {
    return { reasons: [...reasons, `Recebeu mensagem há ${opts.daysSinceLastMessage} dia(s).`], next: { action: "wait", text: `Aguarde: o intervalo mínimo entre mensagens é de ${s.frequencyCapDays} dias.` } };
  }
  return { reasons, next: { action: "campaign", text: c.status === "highly_inactive" ? "Mande uma mensagem de reconquista com uma oferta especial." : "Mande uma mensagem convidando para voltar." } };
}
