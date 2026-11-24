/**
 * Limitador simples em memória (janela deslizante). Suficiente para uma instância;
 * com várias instâncias, troque por Redis/Upstash mantendo a mesma interface.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return { ok: false, retryInSec: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryInSec: 0 };
}
