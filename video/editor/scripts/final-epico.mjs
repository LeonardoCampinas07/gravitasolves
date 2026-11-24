// Vídeo épico final com a narração do ElevenLabs.
// 1) copia video/narracao/narracao-epico.mp3  2) alinha ao roteiro  3) refaz a trilha no tempo da voz  4) renderiza.
// Uso (dentro de video/editor): node scripts/final-epico.mjs
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const src = "../narracao/narracao-epico.mp3";
if (!existsSync(src)) {
  console.error("Não encontrei video/narracao/narracao-epico.mp3. Gere no ElevenLabs e salve com esse nome.");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
// alinhamento local (faster-whisper) no áudio original
run(`python scripts/align-whisper.py ${src} scripts/script-epico.txt src/epico/timeline-orig.json`);
// insere 2 s de pausa logo depois de "GravitaSolves" (a revelação do logo) e desloca os tempos
run("python scripts/pad-reveal.py " + src);
run("python scripts/sfx-epico.py");
run(`npx.cmd remotion render src/index.ts GravitaEpico ../gravitasolves-epico-final.mp4 --codec=h264 --crf=18 --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"`);
console.log("\nPronto: video/gravitasolves-epico-final.mp4");
