// npm run cf:build — gera o Worker da Cloudflare (.open-next) sem o PGlite.
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["opennextjs-cloudflare", "build"], { stdio: "inherit", shell: true, env: { ...process.env, GRAVITA_CF_BUILD: "1" } });
process.exit(r.status ?? 1);
