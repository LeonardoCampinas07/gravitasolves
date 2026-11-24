/**
 * Cliente da Claude API. Sem credencial configurada, o GravitaSolves funciona em "modo básico"
 * (modelos por segmento + interpretador de comandos por regras) e informa isso na interface.
 */
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

/**
 * Fallback no servidor: se o modelo principal recusar a solicitação por política,
 * a própria API reexecuta em um modelo alternativo adequado.
 */
export const FALLBACK_PARAMS = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function getAnthropic() {
  if (!aiEnabled()) throw new Error("IA não configurada (defina ANTHROPIC_API_KEY).");
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Mensagem amigável para erros da API (sem expor detalhes internos). */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "O assistente está temporariamente indisponível. Tente novamente mais tarde.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da IA atingido no momento. Tente novamente em instantes.";
  if (e instanceof Anthropic.APIConnectionError) return "Não foi possível conectar ao serviço de IA.";
  if (e instanceof Anthropic.APIError) return `Serviço de IA indisponível (${e.status ?? "erro"}).`;
  return e instanceof Error ? e.message : "Erro inesperado na IA.";
}
