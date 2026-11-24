/**
 * Log estruturado (uma linha JSON por evento) para coletores como Vercel/Datadog/Logtail.
 * Nunca registre e-mail, telefone, nome, CPF/CNPJ, tokens ou chaves — use ids.
 */
type Level = "info" | "warn" | "error";
const SENSITIVE = /(email|phone|telefone|cpf|cnpj|document|password|senha|token|secret|key|authorization)/i;

function clean(meta: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, SENSITIVE.test(k) ? "[omitido]" : v instanceof Error ? v.message : v]));
}

export function log(level: Level, event: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean(meta) });
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.info(line);
}
