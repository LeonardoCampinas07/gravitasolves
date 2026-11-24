import { getSegment } from "./segments";

/** Configurações por empresa (armazenadas em organizations.settings, mescladas com o padrão do segmento). */
export interface OrgSettings {
  thresholds: { atRiskDays: number; inactiveDays: number; highlyInactiveDays: number };
  /** Ajusta os limites ao ritmo histórico de cada cliente quando há visitas suficientes. */
  useIndividualRhythm: boolean;
  /** Dias em que o cliente permanece com o status "recuperado" após voltar. */
  recoveredHoldDays: number;
  /** Uma visita até N dias depois de uma mensagem é atribuída à campanha. */
  attributionWindowDays: number;
  /** Intervalo mínimo entre duas mensagens para o mesmo cliente. */
  frequencyCapDays: number;
  /** Máximo de mensagens por cliente em 30 dias. */
  maxMessagesPer30Days: number;
  /** Campanhas exigem aprovação de admin/owner antes do envio. */
  requireApproval: boolean;
  /** Permite e-mail com base em legítimo interesse (clientes com relação prévia), sempre com descadastro. */
  allowLegitimateInterestEmail: boolean;
  /** Premissas da projeção de receita recuperável (probabilidade de retorno por status). */
  returnProbability: { at_risk: number; inactive: number; highly_inactive: number };
  signature: string;
  /** Conversa recente (WhatsApp) conta como atividade quando não há visita mais nova. */
  countContactAsActivity: boolean;
  /** Mensagens recebidas no WhatsApp oficial criam/atualizam clientes automaticamente. */
  whatsappAutoCapture: boolean;
  /** Link de agendamento próprio. */
  booking: { enabled: boolean; services: string[]; staff: string[]; intro: string };
  /** Meta mensal de clientes recuperados (0 = sem meta). */
  monthlyGoal: number;
}

export const BASE_SETTINGS: Omit<OrgSettings, "thresholds"> = {
  useIndividualRhythm: true,
  recoveredHoldDays: 30,
  attributionWindowDays: 30,
  frequencyCapDays: 14,
  maxMessagesPer30Days: 2,
  requireApproval: true,
  allowLegitimateInterestEmail: false,
  returnProbability: { at_risk: 0.3, inactive: 0.15, highly_inactive: 0.06 },
  signature: "",
  countContactAsActivity: true,
  whatsappAutoCapture: true,
  booking: { enabled: false, services: [], staff: [], intro: "" },
  monthlyGoal: 0,
};

export function resolveSettings(org: { segment: string; settings: Partial<OrgSettings> | null }): OrgSettings {
  const seg = getSegment(org.segment);
  const s = org.settings ?? {};
  return {
    ...BASE_SETTINGS,
    ...s,
    thresholds: { ...seg.thresholds, ...(s.thresholds ?? {}) },
    returnProbability: { ...BASE_SETTINGS.returnProbability, ...(s.returnProbability ?? {}) },
    booking: { ...BASE_SETTINGS.booking, ...(s.booking ?? {}) },
  };
}

export function validateThresholds(t: OrgSettings["thresholds"]): string | null {
  if (![t.atRiskDays, t.inactiveDays, t.highlyInactiveDays].every((n) => Number.isInteger(n) && n > 0 && n <= 3650))
    return "Os períodos devem ser números inteiros entre 1 e 3650 dias.";
  if (!(t.atRiskDays < t.inactiveDays && t.inactiveDays < t.highlyInactiveDays))
    return "Os períodos devem ser crescentes: em risco < inativo < altamente inativo.";
  return null;
}
