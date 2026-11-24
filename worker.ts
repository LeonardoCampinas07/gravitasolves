/**
 * Entrada do Worker na Cloudflare: o app Next (gerado pelo OpenNext) + o gatilho diário (cron),
 * que substitui o cron da Vercel chamando /api/cron/daily com o CRON_SECRET.
 */
// Gerado por `npm run cf:build` (fora do tsc: ver tsconfig.json).
import app from "./.open-next/worker.js";

interface Env { APP_URL?: string; CRON_SECRET?: string }

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const base = env.APP_URL || "https://localhost";
    const req = new Request(`${base}/api/cron/daily`, { headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` } });
    ctx.waitUntil(
      app.fetch(req, env, ctx).then(async (res: Response) => {
        if (!res.ok) console.error(`cron diário falhou: ${res.status} ${await res.text()}`);
      }),
    );
  },
};
