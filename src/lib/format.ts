const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");

export const money = (cents: number) => brl.format((cents ?? 0) / 100);
export const num = (n: number) => int.format(n ?? 0);
export const pct = (v: number, digits = 1) => `${((Number.isFinite(v) ? v : 0) * 100).toFixed(digits).replace(".", ",")}%`;

export function dateBR(d: string | Date | null | undefined) {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(d));
}

export function dateTimeBR(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(d));
}

export function relativeBR(d: Date | string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

export const firstName = (name: string) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** Nome reduzido (primeiro nome + inicial) — usado ao enviar dados ao modelo de IA. */
export function shortName(name: string) {
  const parts = (name ?? "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export function maskPhone(p: string | null | undefined) {
  if (!p) return null;
  return p.slice(0, 5) + "•••••" + p.slice(-2);
}
export function maskEmail(e: string | null | undefined) {
  if (!e) return null;
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}•••@${d}`;
}
