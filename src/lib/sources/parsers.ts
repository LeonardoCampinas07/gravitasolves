/**
 * Leitores de fontes de dados sem credenciais: agenda (.ics), conversas exportadas do WhatsApp (.txt/.zip)
 * e contatos do celular (.vcf). Funções puras — testadas em tests/sources.test.ts.
 */
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/import/normalize";

// ───────────────────────── Agenda (.ics) ─────────────────────────
export interface CalendarEvent {
  id: string;
  start: Date;
  summary: string;
  description: string;
  attendees: { name: string | null; email: string | null }[];
  cancelled: boolean;
  recurring: boolean;
}

function unfoldIcs(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}
function icsUnescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** Converte DTSTART do iCalendar em Date. Sem fuso → horário de Brasília. */
export function parseIcsDate(params: string, value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "12", mi = "00", s = "00", z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // TZID qualquer ou horário flutuante: assume horário de Brasília (UTC−3).
  void params;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h + 3, +mi, +s));
}

export function parseIcs(text: string): CalendarEvent[] {
  const lines = unfoldIcs(text).split("\n");
  const events: CalendarEvent[] = [];
  let cur: Partial<CalendarEvent> & { attendees: CalendarEvent["attendees"] } | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") { cur = { attendees: [], description: "", summary: "", cancelled: false, recurring: false }; continue; }
    if (line === "END:VEVENT") {
      if (cur?.start && cur.id) events.push(cur as CalendarEvent);
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx), value = line.slice(idx + 1);
    const [name, ...params] = head.split(";");
    switch (name.toUpperCase()) {
      case "UID": cur.id = value; break;
      case "DTSTART": cur.start = parseIcsDate(params.join(";"), value) ?? undefined; break;
      case "SUMMARY": cur.summary = icsUnescape(value).trim(); break;
      case "DESCRIPTION": cur.description = icsUnescape(value).trim(); break;
      case "STATUS": cur.cancelled = value.toUpperCase() === "CANCELLED"; break;
      case "RRULE": cur.recurring = true; break;
      case "ATTENDEE": {
        const cn = params.find((p) => p.toUpperCase().startsWith("CN="))?.slice(3).replace(/^"|"$/g, "") ?? null;
        const email = value.toLowerCase().startsWith("mailto:") ? value.slice(7) : null;
        cur.attendees.push({ name: cn, email });
        break;
      }
    }
  }
  return events;
}

// Títulos que não são atendimentos.
const NOT_CLIENT = /(^|\s)(almo[cç]o|folga|bloque|pausa|f[eé]rias|feriado|intervalo|reuni|fechad|indispon|lembrete|anivers|m[eé]dico|pessoal|particular|teste|livre|ocupad|busy|out of office)/i;
const PHONE_RE = /(?:\+?55\s*)?\(?\b\d{2}\)?\s*9?\s*\d{4}[\s.-]?\d{4}\b/;

export interface PersonGuess { name: string | null; phone: string | null; email: string | null; service: string | null }

/**
 * Descobre o cliente a partir de um evento de agenda. Aceita títulos como
 * "João Silva", "Corte - João Silva", "João Silva | Barba", "Maria (11) 98888-7777".
 */
export function personFromEvent(ev: Pick<CalendarEvent, "summary" | "description" | "attendees">, organizerEmail?: string | null): PersonGuess | null {
  const text = `${ev.summary}\n${ev.description}`;
  if (!ev.summary || NOT_CLIENT.test(ev.summary)) return null;
  const phoneMatch = text.match(PHONE_RE);
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
  const attendee = ev.attendees.find((a) => a.email && a.email !== organizerEmail);
  const email = attendee?.email ? normalizeEmail(attendee.email) : null;
  const cleaned = ev.summary.replace(PHONE_RE, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/\s*[-–—|:/•]\s*|\s+com\s+|\s+c\/\s*/i).map((p) => p.trim()).filter(Boolean);
  const looksName = (p: string) => /^[A-Za-zÀ-ÿ'´ ]{3,}$/.test(p) && p.split(" ").length <= 5;
  const nameIdx = parts.findIndex((p) => looksName(p) && p.split(" ").length >= 2);
  const idx = nameIdx >= 0 ? nameIdx : parts.findIndex(looksName);
  let name = idx >= 0 ? parts[idx] : null;
  if (!name && attendee?.name) name = attendee.name;
  const service = parts.filter((_, i) => i !== idx).join(" - ") || null;
  if (!name && !phone && !email) return null;
  // Título de um único termo sem telefone (ex.: "Corte") não identifica ninguém.
  if (!phone && !email && name && name.split(" ").length === 1 && parts.length === 1 && name.length < 4) return null;
  return { name: normalizeName(name) ?? (phone ? `Cliente ${phone.slice(-4)}` : null), phone, email, service: service?.slice(0, 80) ?? null };
}

// ───────────────────────── WhatsApp (conversa exportada) ─────────────────────────
export interface ChatSummary {
  contactName: string;
  phone: string | null;
  lastContactAt: Date | null;     // última mensagem do cliente
  lastAnyAt: Date | null;         // última mensagem de qualquer lado
  firstAt: Date | null;
  messageCount: number;
}

const ANDROID = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\s+-\s+([^:]+?):\s/i;
const IOS = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]\s+([^:]+?):\s/;

function chatDate(d: string, m: string, y: string, h: string, mi: string) {
  let year = +y;
  if (y.length === 2) year += 2000;
  return new Date(Date.UTC(year, +m - 1, +d, +h + 3, +mi));
}

/** Nome do contato a partir do nome do arquivo exportado. */
export function contactFromFilename(filename: string): string | null {
  const base = filename.replace(/\.(txt|zip)$/i, "").replace(/^.*[\\/]/, "");
  const m = base.match(/(?:Conversa do WhatsApp com|WhatsApp Chat with|WhatsApp Chat -|Chat de WhatsApp con)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function parseWhatsAppChat(text: string, filename: string, ownerNames: Set<string> = new Set()): ChatSummary | null {
  const bySender = new Map<string, { last: Date; count: number }>();
  let first: Date | null = null, lastAny: Date | null = null, total = 0;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const m = line.match(IOS) ?? line.match(ANDROID);
    if (!m) continue;
    const date = chatDate(m[1], m[2], m[3], m[4], m[5]);
    if (Number.isNaN(date.getTime())) continue;
    const sender = m[6].replace(/‎/g, "").trim();
    total++;
    first ??= date;
    lastAny = date;
    const s = bySender.get(sender) ?? { last: date, count: 0 };
    s.last = date; s.count++;
    bySender.set(sender, s);
  }
  if (!total) return null;
  const fromFile = contactFromFilename(filename);
  // Cliente = nome do arquivo; senão, quem mais escreveu entre os que não são o dono.
  const candidates = [...bySender.entries()].filter(([s]) => !ownerNames.has(s)).sort((a, b) => b[1].count - a[1].count);
  const contact = fromFile ?? candidates[0]?.[0] ?? [...bySender.keys()][0];
  const stats = bySender.get(contact);
  const phone = normalizePhone(contact) ?? normalizePhone(fromFile ?? "");
  const name = phone && /^[+\d\s()-]+$/.test(contact) ? `Contato ${phone.slice(-4)}` : contact;
  return {
    contactName: normalizeName(name) ?? name,
    phone,
    lastContactAt: stats?.last ?? null,
    lastAnyAt: lastAny,
    firstAt: first,
    messageCount: total,
  };
}

/** Em vários arquivos, o dono do comércio é quem aparece como remetente em quase todos. */
export function guessOwnerNames(texts: string[]): Set<string> {
  const freq = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const line of t.replace(/\r/g, "").split("\n")) {
      const m = line.match(IOS) ?? line.match(ANDROID);
      if (m) seen.add(m[6].replace(/‎/g, "").trim());
    }
    seen.forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1));
  }
  const owners = new Set<string>();
  if (texts.length >= 2) for (const [s, n] of freq) if (n >= Math.max(2, texts.length * 0.6)) owners.add(s);
  return owners;
}

// ───────────────────────── Contatos (.vcf) ─────────────────────────
export interface VCardContact { name: string; phone: string | null; email: string | null }

function decodeQP(v: string) {
  const bytes: number[] = [];
  const s = v.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

export function parseVcf(text: string): VCardContact[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/=\n/g, "").replace(/\n[ \t]/g, "");
  const out: VCardContact[] = [];
  for (const block of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    let name: string | null = null, n: string | null = null, email: string | null = null;
    const phones: { v: string; mobile: boolean }[] = [];
    for (const line of block.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const head = line.slice(0, idx).toUpperCase(), raw = line.slice(idx + 1).trim();
      const value = head.includes("QUOTED-PRINTABLE") ? decodeQP(raw) : raw;
      if (head.startsWith("FN")) name = value;
      else if (head === "N" || head.startsWith("N;")) n = value.split(";").filter(Boolean).reverse().join(" ");
      else if (head.startsWith("TEL")) phones.push({ v: value, mobile: /CELL|MOBILE/.test(head) });
      else if (head.startsWith("EMAIL") && !email) email = value;
    }
    const best = phones.find((p) => p.mobile && normalizePhone(p.v)) ?? phones.find((p) => normalizePhone(p.v));
    const phone = best ? normalizePhone(best.v) : null;
    const finalName = normalizeName(name || n);
    if (!finalName || (!phone && !email)) continue;
    out.push({ name: finalName, phone, email: email ? normalizeEmail(email) : null });
  }
  return out;
}
