// Gera o vídeo final com a narração do ElevenLabs.
// 1) copia video/narracao/narracao.mp3 para o editor  2) alinha ao roteiro  3) renderiza.
// Uso (dentro de video/editor): node scripts/final.mjs
import { copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const src = "../narracao/narracao.mp3";
if (!existsSync(src)) {
  console.error("Não encontrei video/narracao/narracao.mp3. Gere no ElevenLabs e salve com esse nome.");
  process.exit(1);
}
copyFileSync(src, "public/audio/narracao.mp3");
const run = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
run("python scripts/align.py public/audio/narracao.mp3");
run(`npx remotion render src/index.ts GravitaDemo ../gravita-demo-final.mp4 --codec=h264 --crf=18 --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"`);
console.log("\nPronto: video/gravita-demo-final.mp4");
