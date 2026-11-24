/** Job diário. Proteja com CRON_SECRET (Vercel Cron envia "Authorization: Bearer <CRON_SECRET>"). */
import { runDailyJobs } from "@/lib/jobs";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET não configurado", { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const reports = await runDailyJobs();
  return Response.json({ ok: true, organizations: reports.length, reports });
}
