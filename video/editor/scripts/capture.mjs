// Captura as telas do app em alta resolução (2x) e registra a posição de elementos (para zoom/cursor).
// Uso: node scripts/capture.mjs  (app de demonstração rodando em http://localhost:3100)
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../public/shots");
const BASE = process.env.BASE ?? "http://localhost:3100";
const CHATS_DIR = process.env.CHATS_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1440, H = 810;

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--lang=pt-BR"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
page.setDefaultTimeout(30000);
const meta = {};

async function rect(sel) {
  const h = await page.waitForSelector(sel, { timeout: 8000 }).catch(() => null);
  if (!h) return null;
  const b = await h.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
const t = (s) => `::-p-text(${s})`;
async function settle() { await page.evaluate(() => document.fonts.ready); await sleep(700); }
async function shot(name, targets = {}) {
  await settle();
  const r = {};
  for (const [k, sel] of Object.entries(targets)) r[k] = await rect(sel);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  meta[name] = r;
  console.log("✓", name, Object.entries(r).filter(([, v]) => !v).map(([k]) => `(sem ${k})`).join(" "));
}
async function scrollTo(sel, block = "start", offset = -24) {
  await page.evaluate((s, b, o) => {
    const el = document.querySelector(s);
    if (!el) return;
    el.scrollIntoView({ block: b });
    window.scrollBy(0, o);
  }, sel, block, offset);
  await sleep(400);
}
async function scrollToText(text, offset = -90) {
  const h = await page.waitForSelector(t(text));
  await h.evaluate((e, o) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, o); }, offset);
  await sleep(400);
}

// Página inicial (sem login)
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await shot("landing", { title: "h1", mock: "section .relative.animate-rise" });

// Login
await page.goto(BASE + "/login");
await page.type("input[name=email]", "contato@barbeariacentral.test");
await page.type("input[name=password]", "DemoSegura2026");
await Promise.all([page.waitForNavigation(), page.click("form button")]);

// Conexões
await page.goto(BASE + "/fontes", { waitUntil: "networkidle0" });
await shot("fontes", { chip: t("Marco pelo WhatsApp"), question: t("Como você atende seus clientes hoje?") });
await (await page.waitForSelector(t("Marco pelo WhatsApp"))).click();
await sleep(800);
await shot("fontes_rec", { booking: t("Link de agendamento Gravita"), whatsapp: t("Histórico do WhatsApp"), chip: t("Marco pelo WhatsApp") });

// Histórico do WhatsApp
await (await page.waitForSelector(t("Histórico do WhatsApp"))).click();
await sleep(600);
if (CHATS_DIR) {
  const { readdirSync } = await import("node:fs");
  const input = await page.$("main input[type=file][accept='.txt,.zip']");
  await input.uploadFile(...readdirSync(CHATS_DIR).map((f) => path.join(CHATS_DIR, f)));
  await page.waitForSelector(t("conversas lidas"));
}
await scrollToText("Histórico do WhatsApp", -40);
await shot("whatsapp", { card: t("Histórico do WhatsApp"), steps: t("Exportar conversa"), result: t("conversas lidas"), privacy: t("Privacidade") });

// Clientes com última conversa
await page.goto(BASE + "/clientes?status=highly_inactive", { waitUntil: "networkidle0" });
await shot("clientes", { table: "main table", firstRow: "main tbody tr", activity: t("conversa") });

// Painel
await page.goto(BASE + "/visao-geral", { waitUntil: "networkidle0" });
await scrollTo("main .grid.grid-cols-2", "start", -110);
await shot("painel", { kpis: "main .grid.grid-cols-2", risk: t("Em risco"), inactive: t("Inativos"), opportunity: t("Oportunidade de recuperação"), donut: t("Saúde da base") });

// Inativos
await page.goto(BASE + "/inativos", { waitUntil: "networkidle0" });
await shot("inativos", { groups: "main .grid.md\\:grid-cols-3", risk: t("Passaram do intervalo habitual") });
await scrollToText("Prioridade de contato", -30);
await shot("prioridade", { table: "main table", first: "main tbody tr", score: "main tbody tr td span" });

// Agente
await page.goto(BASE + "/agente", { waitUntil: "networkidle0" });
await (await page.waitForSelector(t("Nova conversa"))).click();
await sleep(500);
await shot("agente_vazio", { suggestion: t("maior potencial de retorno"), input: "main textarea" });
await page.goto(BASE + "/agente", { waitUntil: "networkidle0" });
await page.evaluate(() => { const el = document.querySelector("main .thin-scroll"); if (el) el.scrollTop = el.scrollHeight; });
await sleep(500);
await shot("agente_resposta", { card: t("Rascunho criado"), answer: t("Criei a campanha") });

// Campanha criada pelo agente
await page.goto(BASE + "/campanhas", { waitUntil: "networkidle0" });
const href = await page.$eval("main a[href^='/campanhas/']", (a) => a.getAttribute("href"));
await page.goto(BASE + href, { waitUntil: "networkidle0" });
await scrollToText("Mensagens", -100);
await shot("campanha", { variants: "main textarea", strategy: t("Estratégia"), v1: t("VARIAÇÃO 1") });
await scrollToText("Público e regras de contato", -80);
await shot("lgpd", { rules: t("Público e regras de contato"), skipped: t("Fora do envio ("), approval: t("Regras aplicadas") });
await page.evaluate(() => window.scrollTo(0, 0));
await shot("campanha_topo", { status: "main h1", kpis: "main .grid.grid-cols-2" });

// Link de agendamento (lado do cliente)
await page.goto(BASE + "/agendar/barbearia-central", { waitUntil: "networkidle0" });
await (await page.waitForSelector("form button" + t("Corte + barba"))).click();
await (await page.waitForSelector("form button" + t("Amanhã"))).click();
await (await page.waitForSelector("form button" + t("16:00"))).click();
await page.type("input[name=name]", "Rafael Moura");
await page.type("input[name=phone]", "(11) 97654-3210");
await page.click("input[name=consent]");
await page.evaluate(() => window.scrollTo(0, 260));
await shot("booking", { services: "form", time: "form button" + t("16:00"), submit: "form button[class*='h-11']" });
await (await page.waitForSelector("form button[class*='h-11']")).click();
await page.waitForSelector(t("Pedido enviado!"));
await page.evaluate(() => window.scrollTo(0, 0));
await shot("booking_ok", { ok: t("Pedido enviado!") });

// Agenda
await page.goto(BASE + "/agenda", { waitUntil: "networkidle0" });
await scrollToText("Pedidos de horário (", -30);
await shot("agenda", { requests: t("Pedidos de horário ("), row: "main li", done: "main li button" + t("Atendido") });

// Resultados
await page.goto(BASE + "/resultados", { waitUntil: "networkidle0" });
await shot("resultados", { kpis: "main .grid.grid-cols-2", funnel: t("Funil de recuperação"), chart: t("Recuperados por semana") });
await scrollToText("Comparação de campanhas", -30);
await shot("comparacao", { table: "main table" });

// Cliente recuperado
await page.goto(BASE + "/clientes?status=recovered", { waitUntil: "networkidle0" });
const ch = await page.$eval("main tbody a[href^='/clientes/']", (a) => a.getAttribute("href")).catch(() => null);
if (ch) {
  await page.goto(BASE + ch, { waitUntil: "networkidle0" });
  await shot("recuperado", { name: "main h1", badge: t("Recuperado"), visits: t("Histórico de visitas") });
}

writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ viewport: { w: W, h: H }, shots: meta }, null, 1));
await browser.close();
console.log("pronto:", Object.keys(meta).length, "telas");
