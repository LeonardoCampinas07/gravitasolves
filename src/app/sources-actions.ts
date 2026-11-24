"use server";
/** Ações das fontes de dados ("Conexões") e da agenda. */
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { getDb, withOrg } from "@/db/client";
import { appointments, dataSources, organizations } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { decodeText } from "@/lib/import/parse";
import { normalizeName, normalizePhone, parseDate, parseMoneyCents, cleanText } from "@/lib/import/normalize";
import { guessOwnerNames, parseIcs, parseVcf, parseWhatsAppChat } from "@/lib/sources/parsers";
import { completeAppointment, ingestAppointments, ingestContacts, quickCheckIn, setAppointmentStatus, upsertPerson, capacityFor } from "@/lib/sources/ingest";
import { syncGoogle } from "@/lib/sources/google";
import { connectIcsUrl, mapIcsEvents, syncIcsUrl } from "@/lib/sources/ics-url";
import { setConsent } from "@/lib/customers";
import { today } from "@/lib/dates";
import type { ActionResult } from "./actions";

const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: e instanceof Error ? e.message : "Erro inesperado." });
const MAX = 25 * 1024 * 1024;

export interface SourceSummary { lines: string[] }

async function readFiles(fd: FormData) {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Selecione pelo menos um arquivo.");
  if (files.reduce((a, f) => a + f.size, 0) > MAX) throw new Error("Arquivos somam mais de 25 MB.");
  const out: { name: string; text: string }[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.name.toLowerCase().endsWith(".zip")) {
      let total = 0, count = 0; // proteção contra "zip bomb": limita tamanho descompactado e número de arquivos
      const entries = unzipSync(new Uint8Array(buf), { filter: (e) => {
        if (!/\.(txt|ics|vcf)$/i.test(e.name) || e.originalSize >= 20 * 1024 * 1024) return false;
        total += e.originalSize; count++;
        if (total > 60 * 1024 * 1024 || count > 500) throw new Error("O .zip descompactado é grande demais. Envie as conversas em partes.");
        return true;
      } });
      for (const [name, data] of Object.entries(entries)) {
        // WhatsApp no iPhone exporta "_chat.txt" dentro de "WhatsApp Chat - Nome.zip": usa o nome do zip.
        out.push({ name: /_chat\.txt$/i.test(name) ? f.name : name, text: strFromU8(data) });
      }
    } else out.push({ name: f.name, text: decodeText(buf) });
  }
  return out;
}

/** Upload de agenda (.ics), conversas do WhatsApp (.txt/.zip) ou contatos (.vcf). */
export async function uploadSourceAction(kind: "ics" | "whatsapp" | "vcf", fd: FormData): Promise<ActionResult<SourceSummary>> {
  try {
    const ctx = await requireCtx("import");
    if (kind !== "ics" && kind !== "whatsapp" && kind !== "vcf") throw new Error("Tipo de arquivo inválido.");
    const files = await readFiles(fd);
    let lines: string[] = [];
    if (kind === "ics") {
      const events = files.flatMap((f) => parseIcs(f.text));
      if (!events.length) throw new Error("Não encontramos eventos. Exporte a agenda no formato .ics (iCalendar).");
      const items = mapIcsEvents(events);
      const r = await withOrg(ctx.org.id, (tx) => ingestAppointments(tx, ctx.org, "ics", items, ctx.user.id));
      lines = [
        `${events.length} eventos lidos; ${items.length} identificados como atendimento de cliente.`,
        `${r.visits} visitas registradas e ${r.upcoming} agendamentos futuros.`,
        `${r.created} clientes novos; ${r.skipped} eventos ignorados (já importados, cancelados ou sem cliente).`,
        ...(r.limitReached ? ["Limite de clientes do plano atingido — parte dos eventos não foi importada."] : []),
      ];
    } else if (kind === "whatsapp") {
      const txts = files.filter((f) => f.name.toLowerCase().endsWith(".txt") || f.name.toLowerCase().endsWith(".zip"));
      const owners = guessOwnerNames(txts.map((f) => f.text));
      const chats = txts.map((f) => parseWhatsAppChat(f.text, f.name, owners)).filter((c): c is NonNullable<typeof c> => !!c);
      if (!chats.length) throw new Error("Não reconhecemos o formato. No WhatsApp: abra a conversa → ⋮ → Mais → Exportar conversa → Sem mídia.");
      const r = await withOrg(ctx.org.id, (tx) => ingestContacts(tx, ctx.org, "whatsapp_export", chats.map((c) => ({
        person: { name: c.contactName, phone: c.phone }, lastContactAt: c.lastContactAt ?? c.lastAnyAt, messageCount: c.messageCount,
      })), ctx.user.id));
      lines = [`${chats.length} conversas lidas.`, `${r.created} clientes novos e ${r.matched - r.created} atualizados com a data da última conversa.`,
        ...(r.limitReached ? ["Limite de clientes do plano atingido."] : [])];
    } else {
      const contacts = files.flatMap((f) => parseVcf(f.text));
      if (!contacts.length) throw new Error("Nenhum contato com telefone ou e-mail encontrado no arquivo .vcf.");
      const r = await withOrg(ctx.org.id, (tx) => ingestContacts(tx, ctx.org, "vcf", contacts.map((c) => ({ person: c, lastContactAt: null, messageCount: 0 })), ctx.user.id));
      lines = [`${contacts.length} contatos lidos.`, `${r.created} clientes novos; ${r.matched - r.created} já existiam.`,
        "Contatos não trazem datas de visita: conecte a agenda ou o WhatsApp para o GravitaSolves saber quem está sumindo.",
        ...(r.limitReached ? ["Limite de clientes do plano atingido."] : [])];
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { lines } };
  } catch (e) { return fail(e); }
}

export async function syncGoogleAction(): Promise<ActionResult<SourceSummary>> {
  try {
    const ctx = await requireCtx("integrations:write");
    const r = await syncGoogle(ctx.org.id, ctx.user.id);
    revalidatePath("/", "layout");
    return { ok: true, data: { lines: [`${r.visits} visitas novas, ${r.upcoming} agendamentos futuros, ${r.created} clientes novos.`] } };
  } catch (e) { return fail(e); }
}

const syncLines = (r: { visits: number; upcoming: number; created: number; limitReached: boolean }) => [
  `${r.visits} visitas novas, ${r.upcoming} agendamentos futuros, ${r.created} clientes novos.`,
  ...(r.limitReached ? ["Limite de clientes do plano atingido — parte dos eventos não foi importada."] : []),
];

/** Conecta a agenda por link público (.ics / webcal — iPhone, Outlook, Samsung…). */
export async function connectIcsUrlAction(url: string): Promise<ActionResult<SourceSummary>> {
  try {
    const ctx = await requireCtx("integrations:write");
    if (!rateLimit(`ics-url:${ctx.org.id}`, 10, 60 * 60_000).ok) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    const r = await connectIcsUrl(ctx.org.id, String(url ?? "").slice(0, 2000), ctx.user.id);
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "source.connect", entityId: "ics_url" }));
    revalidatePath("/", "layout");
    return { ok: true, data: { lines: syncLines(r) } };
  } catch (e) { return fail(e); }
}

export async function syncIcsUrlAction(): Promise<ActionResult<SourceSummary>> {
  try {
    const ctx = await requireCtx("integrations:write");
    if (!rateLimit(`ics-sync:${ctx.org.id}`, 20, 60 * 60_000).ok) throw new Error("Muitas sincronizações seguidas. Aguarde alguns minutos.");
    const r = await syncIcsUrl(ctx.org.id, ctx.user.id);
    revalidatePath("/", "layout");
    return { ok: true, data: { lines: syncLines(r) } };
  } catch (e) { return fail(e); }
}

export async function disconnectSourceAction(kind: "google_calendar" | "ics_url"): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("integrations:write");
    if (kind !== "google_calendar" && kind !== "ics_url") throw new Error("Fonte inválida.");
    await withOrg(ctx.org.id, async (tx) => {
      await tx.delete(dataSources).where(and(eq(dataSources.orgId, ctx.org.id), eq(dataSources.kind, kind)));
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "source.disconnect", entityId: kind });
    });
    revalidatePath("/fontes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setSourcePrefAction(key: "whatsappAutoCapture" | "countContactAsActivity", value: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireCtx("settings:write");
    if (key !== "whatsappAutoCapture" && key !== "countContactAsActivity") throw new Error("Preferência inválida.");
    await withOrg(ctx.org.id, (tx) => tx.update(organizations).set({ settings: { ...ctx.org.settings, [key]: value === true } }).where(eq(organizations.id, ctx.org.id)));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agenda";
}

/** Liga/configura o link de agendamento próprio. */
export async function saveBookingAction(fd: FormData): Promise<ActionResult<string>> {
  try {
    const ctx = await requireCtx("settings:write");
    const db = await getDb();
    let slug = slugify(String(fd.get("slug") || ctx.org.slug || ctx.org.name));
    if (["api", "login", "cadastro", "admin", "agenda"].includes(slug)) slug += "-1";
    for (let i = 2; ; i++) {
      const [taken] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.slug, slug), ne(organizations.id, ctx.org.id)));
      if (!taken) break;
      slug = `${slugify(String(fd.get("slug") || ctx.org.name))}-${i}`;
    }
    const list = (k: string) => String(fd.get(k) ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const booking = { enabled: fd.get("enabled") !== "off", services: list("services"), staff: list("staff"), intro: String(fd.get("intro") ?? "").slice(0, 280) };
    await db.update(organizations).set({ slug, settings: { ...ctx.org.settings, booking } }).where(eq(organizations.id, ctx.org.id));
    await withOrg(ctx.org.id, (tx) => audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "source.booking", summary: booking.enabled ? "Link de agendamento ativo" : "Link desativado" }));
    revalidatePath("/fontes");
    revalidatePath("/agenda");
    return { ok: true, data: slug };
  } catch (e) { return fail(e); }
}

export async function partnerRequestAction(system: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    const name = cleanText(system, 60);
    if (!name) throw new Error("Informe o nome do sistema.");
    await withOrg(ctx.org.id, async (tx) => {
      await tx.insert(dataSources).values({ orgId: ctx.org.id, kind: "partner_request", status: "requested", config: { system: name } })
        .onConflictDoUpdate({ target: [dataSources.orgId, dataSources.kind], set: { config: { system: name }, status: "requested" } });
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "source.partner_request", summary: name });
    });
    revalidatePath("/fontes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Agenda ─────────────────────────
export async function quickCheckInAction(fd: FormData): Promise<ActionResult<{ recovered: boolean }>> {
  try {
    const ctx = await requireCtx("customers:write");
    const name = normalizeName(fd.get("name"));
    const rawPhone = String(fd.get("phone") ?? "").trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (!name) throw new Error("Informe o nome do cliente.");
    if (rawPhone && !phone) throw new Error("Telefone inválido. Use DDD + número.");
    const date = parseDate(String(fd.get("date") || today())) ?? today();
    const r = await withOrg(ctx.org.id, (tx) => quickCheckIn(tx, ctx.org, {
      name, phone, service: cleanText(fd.get("service"), 80), staff: cleanText(fd.get("staff"), 60),
      amountCents: parseMoneyCents(fd.get("amount")) ?? 0, date, consentWhatsapp: fd.get("consent") === "on",
    }, ctx.user.id));
    revalidatePath("/", "layout");
    return { ok: true, data: { recovered: r.recovered } };
  } catch (e) { return fail(e); }
}

export async function appointmentAction(id: string, op: "confirm" | "done" | "no_show" | "cancel", amount?: string): Promise<ActionResult<{ recovered: boolean }>> {
  try {
    const ctx = await requireCtx("customers:write");
    if (!["confirm", "done", "no_show", "cancel"].includes(op)) throw new Error("Operação inválida.");
    let recovered = false;
    await withOrg(ctx.org.id, async (tx) => {
      if (op === "done") recovered = (await completeAppointment(tx, ctx.org, id, parseMoneyCents(amount ?? "") ?? 0)).recovered;
      else await setAppointmentStatus(tx, ctx.org.id, [id], op === "confirm" ? "confirmed" : op === "no_show" ? "no_show" : "cancelled");
    });
    revalidatePath("/agenda");
    revalidatePath("/visao-geral");
    return { ok: true, data: { recovered } };
  } catch (e) { return fail(e); }
}

/** Formulário público do link de agendamento (sem login). */
export async function requestBookingAction(slug: string, fd: FormData): Promise<ActionResult> {
  try {
    const db = await getDb();
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    const booking = (org?.settings as { booking?: { enabled?: boolean } } | undefined)?.booking;
    if (!org || !booking?.enabled) throw new Error("Agenda indisponível.");
    if (String(fd.get("website") ?? "")) return { ok: true }; // campo-isca contra robôs
    // Limites contra abuso: por IP e por estabelecimento/dia (evita encher a base com pedidos falsos variando o telefone).
    if (!rateLimit(`booking-ip:${await clientIp()}`, 10, 3600_000).ok || !rateLimit(`booking-org:${org.id}`, 60, 86_400_000).ok)
      throw new Error("Muitos pedidos em pouco tempo. Tente novamente mais tarde ou fale direto com o estabelecimento.");
    const name = normalizeName(fd.get("name"));
    const phone = normalizePhone(fd.get("phone"));
    if (!name) throw new Error("Informe seu nome.");
    if (!phone) throw new Error("Informe um WhatsApp válido com DDD.");
    const rl = rateLimit(`booking:${org.id}:${phone}`, 3, 3600_000);
    if (!rl.ok) throw new Error("Você já enviou pedidos recentemente. Aguarde o contato do estabelecimento.");
    const date = String(fd.get("date") ?? ""), time = String(fd.get("time") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Escolha data e horário.");
    const when = new Date(`${date}T${time}:00-03:00`);
    if (when.getTime() < Date.now() - 3600_000 || when.getTime() > Date.now() + 120 * 86_400_000) throw new Error("Escolha uma data a partir de hoje (até 4 meses).");
    await withOrg(org.id, async (tx) => {
      const cap = await capacityFor(tx, org);
      const customerId = await upsertPerson(tx, org, { name, phone }, "booking", { capacity: cap });
      if (customerId && fd.get("consent") === "on")
        await setConsent(tx, org.id, customerId, "whatsapp", true, { source: "Link de agendamento (marcado pelo cliente)", actor: "customer" });
      await tx.insert(appointments).values({
        orgId: org.id, customerId, scheduledFor: when, service: cleanText(fd.get("service"), 80), staff: cleanText(fd.get("staff"), 60),
        status: "requested", source: "booking_page", contactName: name, contactPhone: phone, notes: cleanText(fd.get("notes"), 300),
      });
      await audit(tx, { orgId: org.id, actorType: "system", action: "booking.request", summary: "Pedido de horário pelo link" });
    });
    return { ok: true };
  } catch (e) { return fail(e); }
}

