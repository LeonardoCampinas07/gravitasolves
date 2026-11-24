/** Exportação LGPD (portabilidade): /api/export/org e /api/export/customer/<id>. Requer sessão com permissão data:export. */
import { withOrg } from "@/db/client";
import { getContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { exportCustomerData, exportOrgData } from "@/lib/lgpd";
import { audit } from "@/lib/audit";
import { addDays, today } from "@/lib/dates";
import { getCampaignStats } from "@/lib/analytics";
import { getRecoveryRows } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id?: string[] }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  if (!can(ctx.role, "data:export")) return new Response("Sem permissão", { status: 403 });
  if (ctx.sim) return new Response("Exportação indisponível na simulação (somente leitura).", { status: 403 });
  const { kind, id } = await params;
  const customerId = id?.[0];
  if (kind === "customer" && customerId && /^[0-9a-f-]{36}$/i.test(customerId)) {
    try {
      const data = await withOrg(ctx.org.id, async (tx) => {
        const d = await exportCustomerData(tx, ctx.org.id, customerId);
        await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "customer.export", entity: "customer", entityId: customerId });
        return d;
      });
      return download(data, `titular-${customerId}.json`);
    } catch { return new Response("Não encontrado", { status: 404 }); }
  }
  if (kind === "org") {
    const data = await withOrg(ctx.org.id, async (tx) => {
      const d = await exportOrgData(tx, ctx.org.id);
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "org.export" });
      return d;
    });
    return download(data, `gravitasolves-base-${today()}.json`);
  }
  if (kind === "recuperados" || kind === "campanhas") {
    const days = [30, 90, 365].includes(Number(new URL(req.url).searchParams.get("dias"))) ? Number(new URL(req.url).searchParams.get("dias")) : 90;
    const to = today(), from = addDays(to, -(days - 1));
    const rows = await withOrg(ctx.org.id, async (tx) => {
      await audit(tx, { orgId: ctx.org.id, actorType: "user", actorId: ctx.user.id, action: "report.export", summary: `Relatório ${kind} (${days} dias)` });
      if (kind === "recuperados") {
        const r = await getRecoveryRows(tx, ctx.org.id, from, to);
        return [["Data do retorno", "Cliente", "Telefone", "Serviço preferido", "Campanha", "Receita registrada (R$)"],
          ...r.map((x) => [x.returnedAt, x.customer, (x.phone ?? "").replace(/^\+/, ""), x.service ?? "", x.campaign ?? "", (Number(x.revenueCents) / 100).toFixed(2).replace(".", ",")])];
      }
      const s = await getCampaignStats(tx, ctx.org.id);
      return [["Campanha", "Canal", "Status", "Criada em", "Público", "Fora do envio", "Enviadas", "Entregues", "Respostas", "Falhas", "Retornos", "Receita (R$)", "Taxa de recuperação"],
        ...s.map((x) => [x.name, x.channel, x.status, today(x.createdAt), x.audience, x.skipped, x.sent, x.delivered, x.replied, x.failed, x.returned,
          (x.revenueCents / 100).toFixed(2).replace(".", ","), x.sent ? `${Math.round(x.recoveryRate * 1000) / 10}%`.replace(".", ",") : ""])];
    });
    return new Response(toCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gravitasolves-${kind}-${to}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return new Response("Não encontrado", { status: 404 });
}


function download(data: unknown, filename: string) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
