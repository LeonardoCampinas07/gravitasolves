/**
 * Classificação de clientes e score de potencial de retorno. Funções puras e determinísticas —
 * a mesma regra roda na importação, no job diário e nos testes.
 */
import type { CustomerStatus } from "@/db/schema";
import type { OrgSettings } from "./settings";
import { daysBetween, dayOf } from "./dates";

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: "Ativo",
  at_risk: "Em risco",
  inactive: "Inativo",
  highly_inactive: "Altamente inativo",
  recovered: "Recuperado",
  unknown: "Sem dados",
};

export const LAPSED: CustomerStatus[] = ["at_risk", "inactive", "highly_inactive"];

export interface ClassifiableCustomer {
  lastVisitAt: string | null;
  /** Último contato (ex.: conversa no WhatsApp). Usado como atividade se a empresa permitir. */
  lastContactAt?: Date | null;
  firstVisitAt: string | null;
  visitCount: number;
  recoveredAt: Date | null;
}

export interface Classification {
  status: CustomerStatus;
  daysSince: number | null;
  thresholds: OrgSettings["thresholds"];
  /** Intervalo médio histórico entre visitas (dias), quando calculável. */
  personalInterval: number | null;
}

export function personalInterval(c: ClassifiableCustomer): number | null {
  if (!c.firstVisitAt || !c.lastVisitAt || c.visitCount < 3) return null;
  const span = daysBetween(c.firstVisitAt, c.lastVisitAt);
  if (span <= 0) return null;
  return span / (c.visitCount - 1);
}

/** Limites efetivos: os do segmento, ou escalados pelo ritmo do cliente (entre 0,5× e 2×). */
export function effectiveThresholds(c: ClassifiableCustomer, s: OrgSettings) {
  const base = s.thresholds;
  const interval = s.useIndividualRhythm ? personalInterval(c) : null;
  if (!interval) return { thresholds: base, interval };
  const factor = Math.min(2, Math.max(0.5, (interval * 1.5) / base.atRiskDays));
  const atRiskDays = Math.max(1, Math.round(base.atRiskDays * factor));
  const inactiveDays = Math.max(atRiskDays + 1, Math.round(base.inactiveDays * factor));
  const highlyInactiveDays = Math.max(inactiveDays + 1, Math.round(base.highlyInactiveDays * factor));
  return { thresholds: { atRiskDays, inactiveDays, highlyInactiveDays }, interval };
}

/** Data da última atividade: visita, ou contato mais recente quando a empresa considera conversas. */
export function lastActivity(c: ClassifiableCustomer, s: Pick<OrgSettings, "countContactAsActivity">): string | null {
  const contact = s.countContactAsActivity && c.lastContactAt ? dayOf(c.lastContactAt) : null;
  if (!c.lastVisitAt) return contact;
  if (!contact) return c.lastVisitAt;
  return contact > c.lastVisitAt ? contact : c.lastVisitAt;
}

export function classify(c: ClassifiableCustomer, s: OrgSettings, todayStr: string): Classification {
  const { thresholds, interval } = effectiveThresholds(c, s);
  const activity = lastActivity(c, s);
  if (!activity) return { status: "unknown", daysSince: null, thresholds, personalInterval: interval };
  const days = Math.max(0, daysBetween(activity, todayStr));
  let status: CustomerStatus;
  if (days >= thresholds.highlyInactiveDays) status = "highly_inactive";
  else if (days >= thresholds.inactiveDays) status = "inactive";
  else if (days >= thresholds.atRiskDays) status = "at_risk";
  else status = "active";
  if (status === "active" && c.recoveredAt && daysBetween(dayOf(c.recoveredAt), todayStr) <= s.recoveredHoldDays) {
    status = "recovered";
  }
  return { status, daysSince: days, thresholds, personalInterval: interval };
}

export interface ScoreInput {
  status: CustomerStatus;
  daysSince: number | null;
  avgTicketCents: number;
  visitCount: number;
  contactable: boolean;
  thresholds: OrgSettings["thresholds"];
}

/**
 * Potencial de retorno (0–100). Pesos:
 * 35% valor (ticket vs. mediana da base) · 25% fidelidade (nº de visitas, escala log)
 * 30% recência (quanto mais recente o afastamento, maior a chance) · 10% contato autorizado.
 * Clientes ativos, recuperados ou sem dados recebem 0 (não são alvo de reativação).
 */
export function priorityScore(i: ScoreInput, medianTicketCents: number): number {
  if (!LAPSED.includes(i.status) || i.daysSince === null) return 0;
  const monetary = medianTicketCents > 0 ? Math.min(1, i.avgTicketCents / (2 * medianTicketCents)) : 0.5;
  const loyalty = Math.min(1, Math.log1p(Math.max(0, i.visitCount)) / Math.log1p(20));
  const span = Math.max(1, i.thresholds.highlyInactiveDays * 2 - i.thresholds.atRiskDays);
  const recency = 1 - Math.min(1, Math.max(0, (i.daysSince - i.thresholds.atRiskDays) / span));
  const contact = i.contactable ? 1 : 0;
  return Math.round(100 * (0.35 * monetary + 0.25 * loyalty + 0.3 * recency + 0.1 * contact));
}

export function median(values: number[]): number {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}
