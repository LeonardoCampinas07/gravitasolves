/**
 * Google Agenda (OAuth 2.0, escopo somente leitura). Requer GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
 * (Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth, tipo "Aplicativo da Web").
 * URI de redirecionamento autorizado: <APP_URL>/api/sources/google/callback
 */
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { dataSources, organizations } from "@/db/schema";
import { decryptSecret, encryptSecret, randomToken, safeEqual, sign } from "@/lib/crypto";
import { ingestAppointments, type AppointmentInput, type IngestResult } from "./ingest";
import { personFromEvent } from "./parsers";

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/sources/google/callback`;

export function googleAuthUrl(orgId: string, userId: string) {
  const payload = `${orgId}.${userId}.${Date.now()}.${randomToken(8)}`;
  const state = `${payload}.${sign(payload)}`;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  return u.toString();
}

export function verifyState(state: string): { orgId: string; userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 5) return null;
  const payload = parts.slice(0, 4).join(".");
  if (!safeEqual(parts[4], sign(payload))) return null;
  if (Date.now() - Number(parts[2]) > 15 * 60_000) return null; // expira em 15 min
  return { orgId: parts[0], userId: parts[1] };
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Google HTTP ${res.status}`);
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function connectGoogle(orgId: string, code: string) {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!tok.refresh_token) throw new Error("O Google não devolveu acesso permanente. Remova o acesso do GravitaSolves na sua conta Google e conecte de novo.");
  const me = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
  await withOrg(orgId, (tx) => tx.insert(dataSources).values({
    orgId, kind: "google_calendar", status: "active", config: { calendarId: "primary", account: me.id ?? null }, secretEncrypted: encryptSecret(tok.refresh_token!),
  }).onConflictDoUpdate({ target: [dataSources.orgId, dataSources.kind], set: { status: "active", config: { calendarId: "primary", account: me.id ?? null }, secretEncrypted: encryptSecret(tok.refresh_token!) } }));
}

interface GEvent { id: string; status?: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; attendees?: { email?: string; displayName?: string; organizer?: boolean; self?: boolean }[]; organizer?: { email?: string } }

export async function fetchGoogleEvents(accessToken: string, calendarId: string, from: Date, to: Date) {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    u.search = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", maxResults: "2500", orderBy: "startTime", ...(pageToken ? { pageToken } : {}) }).toString();
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? `Google HTTP ${res.status}`);
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && out.length < 20000);
  return out;
}

export function mapGoogleEvents(items: GEvent[]): AppointmentInput[] {
  const res: AppointmentInput[] = [];
  for (const e of items) {
    const startStr = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T12:00:00-03:00` : null);
    if (!startStr) continue;
    const person = personFromEvent({
      summary: e.summary ?? "", description: e.description ?? "",
      attendees: (e.attendees ?? []).filter((a) => !a.self && !a.organizer).map((a) => ({ name: a.displayName ?? null, email: a.email ?? null })),
    }, e.organizer?.email);
    if (!person) continue;
    res.push({ externalId: e.id, start: new Date(startStr), person, service: person.service, cancelled: e.status === "cancelled" });
  }
  return res;
}

/** Sincroniza os últimos 12 meses e os próximos 60 dias. */
export async function syncGoogle(orgId: string, actorId: string | null): Promise<IngestResult> {
  const { src, org } = await withOrg(orgId, async (tx) => ({
    src: (await tx.select().from(dataSources).where(and(eq(dataSources.orgId, orgId), eq(dataSources.kind, "google_calendar"))))[0],
    org: (await tx.select().from(organizations).where(eq(organizations.id, orgId)))[0],
  }));
  if (!src?.secretEncrypted) throw new Error("Google Agenda não conectado.");
  try {
    const tok = await tokenRequest({ refresh_token: decryptSecret(src.secretEncrypted), grant_type: "refresh_token" });
    const from = new Date(Date.now() - 365 * 86_400_000), to = new Date(Date.now() + 60 * 86_400_000);
    const events = await fetchGoogleEvents(tok.access_token, String(src.config.calendarId ?? "primary"), from, to);
    const items = mapGoogleEvents(events);
    return await withOrg(orgId, async (tx) => {
      const r = await ingestAppointments(tx, org, "google_calendar", items, actorId);
      await tx.update(dataSources).set({ lastSyncAt: new Date(), status: "active", lastResult: { ...r, ignored: events.length - items.length } }).where(eq(dataSources.id, src.id));
      return r;
    });
  } catch (e) {
    await withOrg(orgId, (tx) => tx.update(dataSources).set({ status: "error", lastResult: { error: e instanceof Error ? e.message : String(e) } }).where(eq(dataSources.id, src.id)));
    throw e;
  }
}
