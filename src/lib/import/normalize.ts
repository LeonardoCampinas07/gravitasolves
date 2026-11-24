/** Normalização de valores vindos de planilhas brasileiras. Funções puras. */
import { today } from "@/lib/dates";

/** Converte para E.164. Assume Brasil (+55) quando não há código de país. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const hasPlus = str.startsWith("+");
  let d = str.replace(/\D/g, "");
  if (!d) return null;
  if (hasPlus) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  d = d.replace(/^0+/, ""); // 0xx (operadora / DDD com zero)
  if (d.length === 12 || d.length === 13) {
    if (d.startsWith("55")) return validBR(d.slice(2)) ? `+${d}` : null;
    // 0 + operadora (2 dígitos) + DDD + número → remove operadora
    const noCarrier = d.slice(2);
    return validBR(noCarrier) ? `+55${noCarrier}` : null;
  }
  if (d.length === 10 || d.length === 11) return validBR(d) ? `+55${d}` : null;
  return null;
}

function validBR(n: string) {
  const ddd = Number(n.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (n.length === 11) return n[2] === "9"; // celular
  return n.length === 10 && /[2-5]/.test(n[2]); // fixo
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function normalizeEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const e = String(raw).trim().toLowerCase().replace(/^mailto:/, "");
  return EMAIL_RE.test(e) ? e : null;
}

/** Aceita Date, serial do Excel, dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd e ISO. Retorna 'AAAA-MM-DD'. */
export function parseDate(raw: unknown, ref = today()): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let y: number, m: number, d: number;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    y = raw.getUTCFullYear(); m = raw.getUTCMonth() + 1; d = raw.getUTCDate();
  } else if (typeof raw === "number") {
    if (raw < 20000 || raw > 80000) return null; // serial do Excel (≈1954–2119)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86_400_000);
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else {
    const s = String(raw).trim();
    let mt: RegExpMatchArray | null;
    if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
    else if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
      d = +mt[1]; m = +mt[2]; y = +mt[3];
      if (mt[3].length === 2) y += y > 50 ? 1900 : 2000;
    } else if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s), ref);
    else return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (check.getUTCDate() !== d) return null; // 31/02 etc.
  if (iso > ref) return null; // datas futuras não são visitas válidas
  return iso;
}

/** "R$ 1.234,56" → 123456 (centavos). Último separador é o decimal; "1.234" = mil. */
export function parseMoneyCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null;
  let s = String(raw).replace(/[R$\s]/gi, "").replace(/[^\d.,-]/g, "");
  if (!s || s.startsWith("-")) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = s.split(".").join("").replace(",", ".");
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    if (after === 3) s = s.split(".").join(""); // separador de milhar
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function parseCount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const TRUE = new Set(["sim", "s", "yes", "y", "true", "1", "x", "ok", "autorizado", "autoriza", "aceito", "aceita", "opt-in", "optin"]);
const FALSE = new Set(["nao", "não", "n", "no", "false", "0", "recusado", "opt-out", "optout"]);
export function parseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return null;
}

export function cleanText(raw: unknown, max = 500): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** "JOÃO DA SILVA" → "João da Silva" (só quando o nome veio todo em maiúsculas ou minúsculas). */
export function normalizeName(raw: unknown): string | null {
  const s = cleanText(raw, 120);
  if (!s) return null;
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  const small = new Set(["da", "de", "do", "das", "dos", "e"]);
  return s.toLowerCase().split(" ").map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
