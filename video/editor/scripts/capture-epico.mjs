// Captura as telas da versão atual (tema escuro) para o vídeo épico, pela simulação pública
// (Barbearia Exemplo, dados fictícios, plano Profissional). Uso: node scripts/capture-epico.mjs
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../public/shots-epico");
const BASE = process.env.BASE ?? "http://localhost:3100";
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
const t = (s) => `::-p-text(${s})`;

async function rect(sel) {
  const h = await page.waitForSelector(sel, { timeout: 4000 }).catch(() => null);
  if (!h) return null;
  const b = await h.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
async function shot(name, targets = {}) {
  await page.evaluate(() => document.fonts.ready); await sleep(900);
  const r = {};
  for (const [k, sel] of Object.entries(targets)) r[k] = typeof sel === "function" ? await sel() : await rect(sel);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  meta[name] = r;
  console.log("✓", name, Object.entries(r).filter(([, v]) => !v).map(([k]) => `(sem ${k})`).join(" "));
}
async function scrollToText(text, offset = -90) {
  const h = await page.waitForSelector(t(text), { timeout: 5000 }).catch(() => null);
  if (!h) return console.log("  (não achei", text, ")");
  await h.evaluate((e, o) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, o); }, offset);
  await sleep(400);
}
// Caixa do cartão que contém o texto (sobe até ter largura mínima)
const card = (text, minW = 260) => () => page.evaluate((text, minW) => {
  const all = [...document.querySelectorAll("main *, body > * *")].filter((e) => e.innerText && e.innerText.includes(text));
  let el = all.sort((a, b) => a.innerText.length - b.innerText.length)[0];
  while (el && el.getBoundingClientRect().width < minW) el = el.parentElement;
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(Math.min(b.height, 810 - b.y)) };
}, text, minW);
const hideTours = () => page.evaluate(() => document.querySelectorAll("[role=dialog]").forEach((d) => d.remove()));
async function go(p) { await page.goto(BASE + p, { waitUntil: "networkidle0" }); await sleep(500); await hideTours(); }

// Landing
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await shot("landing", { title: "h1", cta: card("Testar a simulação", 150) });

// Entrada da simulação (painel + tour)
await page.goto(BASE + "/simulacao", { waitUntil: "networkidle0" });
await sleep(1800);
await shot("simulacao", { bar: card("Sair da simulação", 900), tour: "[role=dialog]", revenue: card("Receita recuperável") });

await go("/visao-geral");
await shot("painel", { revenue: card("Receita recuperável"), top: card("Maior potencial de retorno"), back: card("Clientes que voltaram") });

await go("/inativos");
await shot("inativos", { groups: "main .grid", risk: card("Passaram do intervalo"), service: card("Taxa de afastamento por serviço") });
await scrollToText("Prioridade de contato", -30);
await shot("prioridade", { table: "main table", first: "main tbody tr" });

await go("/agente");
await shot("agente_vazio", { tabs: "[role=tablist]", suggestion: t("Quanto dinheiro está parado"), input: "main textarea" });
await (await page.waitForSelector(t("Quanto dinheiro está parado"))).click();
await page.waitForSelector("[aria-label='Mais perguntas prontas']", { timeout: 60000 });
await sleep(900);
await shot("agente_resposta", { answer: card("Clientes afastados hoje", 600), chips: "[aria-label='Mais perguntas prontas']" });

await go("/campanhas");
await shot("campanhas", { list: "main a[href^='/campanhas/']" });
const href = await page.$eval("main a[href^='/campanhas/']", (a) => a.getAttribute("href")).catch(() => null);
if (href) {
  await go(href);
  await shot("campanha_topo", { status: "main h1", kpis: "main .grid", approve: card("Aprovar", 60) });
  await scrollToText("Mensagens", -100);
  await shot("campanha", { variants: "main textarea", strategy: card("Estratégia:", 400), messages: card("Edite as variações", 500) });
  await scrollToText("Público e regras de contato", -80);
  await shot("lgpd", { rules: card("Público e regras de contato", 400) });
}

await go("/agenda");
await shot("agenda_topo", { quick: card("Registro rápido"), requests: card("Pedidos de horário", 400) });
await scrollToText("Pedidos de horário", -30);
await shot("agenda", { requests: card("Pedidos de horário", 400), next: card("Próximos atendimentos", 400) });

await go("/resultados");
await shot("resultados", { kpis: "main .grid", funnel: card("Funil de recuperação", 400), chart: card("Recuperados por semana", 400) });

writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ viewport: { w: W, h: H }, shots: meta }, null, 1));
await browser.close();
console.log("pronto:", Object.keys(meta).length, "telas");
