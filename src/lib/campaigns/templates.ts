/**
 * Modelos de mensagem sem IA + renderização de variáveis.
 * Variáveis: {nome} {estabelecimento} {oferta} {servico} {profissional}
 * Frases com {servico}/{profissional} são removidas quando o cliente não tem o dado.
 */
import type { CustomerStatus } from "@/db/schema";
import { getSegment } from "@/lib/segments";
import { firstName } from "@/lib/format";

const OPENINGS: Record<"at_risk" | "inactive" | "highly_inactive", string[]> = {
  at_risk: ["Oi, {nome}! Tudo bem?", "Olá, {nome}! Passando para dar um oi.", "{nome}, tudo certo por aí?"],
  inactive: [
    "Oi, {nome}! Faz um tempinho que você não aparece por aqui.",
    "Olá, {nome}! Aqui é a equipe {estabelecimento}, sentimos sua falta.",
    "{nome}, já faz um tempo desde a sua última visita por aqui.",
  ],
  highly_inactive: [
    "Oi, {nome}! Quanto tempo!",
    "Olá, {nome}! Faz bastante tempo que não nos vemos, e a equipe {estabelecimento} lembrou de você.",
    "{nome}, que saudade de receber você por aqui!",
  ],
};
const PERSONAL = [
  "Seu {servico} continua no nosso radar.",
  "Se preferir, reservamos com {profissional}.",
  "Lembramos do seu {servico} de sempre.",
];
const CLOSINGS = ["Quer que a gente reserve um horário?", "Se quiser, é só responder esta mensagem.", "Posso te ajudar a agendar?"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Gera 3 variações de modelo para o grupo, sem IA. */
export function templateVariants(segmentId: string, statuses: CustomerStatus[], offer: string | null): string[] {
  const seg = getSegment(segmentId);
  const dominant = (["highly_inactive", "inactive", "at_risk"] as const).find((s) => statuses.includes(s)) ?? "inactive";
  const safeOffer = seg.restrictions ? null : offer; // setores regulados: sem oferta comercial
  return [0, 1, 2].map((i) => {
    const parts = [OPENINGS[dominant][i], PERSONAL[i], cap(seg.hooks[i % seg.hooks.length])];
    if (safeOffer) parts.push(`Para facilitar sua volta: {oferta}.`);
    parts.push(CLOSINGS[i]);
    return parts.join(" ");
  });
}

export interface RenderVars { name: string; business: string; offer: string | null; service: string | null; staff: string | null }

export function renderMessage(template: string, v: RenderVars): string {
  const values: Record<string, string | null> = {
    nome: firstName(v.name) || "tudo bem",
    estabelecimento: v.business,
    oferta: v.offer,
    servico: v.service,
    profissional: v.staff,
  };
  // Divide em frases preservando a pontuação; remove as que dependem de variável vazia.
  const sentences = template.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [template];
  const kept = sentences.filter((s) => {
    const vars = [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return vars.every((k) => k in values ? Boolean(values[k]) : true);
  });
  return kept.join("")
    .replace(/\{(\w+)\}/g, (_, k: string) => (values[k] ?? ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
