/**
 * Agenda por link (iCalendar público): iPhone/iCloud ("Calendário público"), Outlook ("Publicar calendário"),
 * Samsung/Google (endereço secreto .ics) e qualquer sistema que gere um link .ics/webcal.
 * O link é tratado como segredo (dá acesso de leitura à agenda) e fica criptografado em data_sources.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { dataSources, organizations } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ingestAppointments, type AppointmentInput, type IngestResult } from "./ingest";
import { parseIcs, personFromEvent, type CalendarEvent } from "./parsers";

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

/** Eventos de agenda → atendimentos (mesmo critério do upload de .ics, para não duplicar). */
export function mapIcsEvents(events: CalendarEvent[]): AppointmentInput[] {
  return events.flatMap((e) => {
    const person = personFromEvent(e);
    return person && !e.recurring ? [{ externalId: e.id + "@" + e.start.toISOString(), start: e.start, person, service: person.service, cancelled: e.cancelled }] : [];
  });
}

/** Aceita webcal://, webcals://, http(s)://. Rejeita outros esquemas, credenciais na URL e hosts locais. */
export function normalizeIcsUrl(raw: string): URL {
  const s = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try { u = new URL(s); } catch { throw new Error("Link inválido. Cole o link completo da agenda (começa com webcal:// ou https://)."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Use um link webcal:// ou https://.");
  if (u.username || u.password) throw new Error("O link não pode conter usuário e senha.");
  if (isBlockedHost(u.hostname)) throw new Error("Esse endereço não é permitido.");
  return u;
}

/** Bloqueia localhost, redes privadas, link-local e metadados de nuvem (SSRF). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    if (h === "::" || h === "::1") return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedHost(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(h);
  }
  return false;
}

async function assertPublicHost(u: URL) {
  if (isBlockedHost(u.hostname)) throw new Error("Esse endereço não é permitido.");
  if (isIP(u.hostname.replace(/^\[|\]$/g, ""))) return;
  const addrs = await lookup(u.hostname, { all: true }).catch(() => { throw new Error("Não encontramos o servidor desse link."); });
  if (!addrs.length || addrs.some((a) => isBlockedHost(a.address))) throw new Error("Esse endereço não é permitido.");
}

/** Baixa o .ics seguindo até 3 redirecionamentos, cada um validado, com tempo e tamanho limitados. */
export async function fetchIcs(raw: string): Promise<string> {
  let u = normalizeIcsUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(u);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/calendar, */*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = normalizeIcsUrl(new URL(res.headers.get("location")!, u).toString());
      continue;
    }
    if (res.status === 404 || res.status === 403 || res.status === 401) throw new Error("O link não está acessível. Confira se a agenda continua pública/compartilhada.");
    if (!res.ok || !res.body) throw new Error(`O servidor da agenda respondeu com erro (${res.status}).`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("A agenda é grande demais (mais de 10 MB)."); }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    const text = new TextDecoder("utf-8").decode(buf);
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Esse link não é de uma agenda (.ics). Copie o link de compartilhamento público da agenda.");
    return text;
  }
  throw new Error("O link redirecionou vezes demais.");
}

/** Mostra só o servidor do link (o caminho é o segredo). */
export function maskIcsUrl(u: URL) {
  return u.hostname;
}

/** Valida, baixa uma vez para conferir e guarda o link criptografado. Depois sincroniza. */
export async function connectIcsUrl(orgId: string, raw: string, actorId: string | null): Promise<IngestResult> {
  const u = normalizeIcsUrl(raw);
  await fetchIcs(u.toString());
  const config = { host: maskIcsUrl(u) };
  await withOrg(orgId, (tx) => tx.insert(dataSources).values({
    orgId, kind: "ics_url", status: "active", config, secretEncrypted: encryptSecret(u.toString()),
  }).onConflictDoUpdate({ target: [dataSources.orgId, dataSources.kind], set: { status: "active", config, secretEncrypted: encryptSecret(u.toString()) } }));
  return syncIcsUrl(orgId, actorId);
}

export async function syncIcsUrl(orgId: string, actorId: string | null): Promise<IngestResult> {
  const { src, org } = await withOrg(orgId, async (tx) => ({
    src: (await tx.select().from(dataSources).where(and(eq(dataSources.orgId, orgId), eq(dataSources.kind, "ics_url"))))[0],
    org: (await tx.select().from(organizations).where(eq(organizations.id, orgId)))[0],
  }));
  if (!src?.secretEncrypted) throw new Error("Nenhum link de agenda conectado.");
  try {
    const events = parseIcs(await fetchIcs(decryptSecret(src.secretEncrypted)));
    const items = mapIcsEvents(events);
    return await withOrg(orgId, async (tx) => {
      const r = await ingestAppointments(tx, org, "ics", items, actorId);
      await tx.update(dataSources).set({ lastSyncAt: new Date(), status: "active", lastResult: { ...r, ignored: events.length - items.length } }).where(eq(dataSources.id, src.id));
      return r;
    });
  } catch (e) {
    await withOrg(orgId, (tx) => tx.update(dataSources).set({ status: "error", lastResult: { error: e instanceof Error ? e.message : String(e) } }).where(eq(dataSources.id, src.id)));
    throw e;
  }
}
