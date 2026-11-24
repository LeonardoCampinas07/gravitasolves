import Link from "next/link";
import { Megaphone, Sparkles } from "lucide-react";
import { withOrg } from "@/db/client";
import { requireCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCampaignStats } from "@/lib/analytics";
import { getSegment } from "@/lib/segments";
import { getPlan } from "@/lib/plans";
import { CHANNEL_LABEL } from "@/lib/channels";
import { dateBR, num, pct } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { NewCampaign } from "./new-campaign";
import { CAMPAIGN_STATUS } from "@/lib/campaigns/labels";

export const metadata = { title: "Campanhas" };


export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ nova?: string; status?: string }> }) {
  const ctx = await requireCtx("customers:read");
  const sp = await searchParams;
  const seg = getSegment(ctx.org.segment);
  const { stats, plan } = await withOrg(ctx.org.id, async (tx) => ({ stats: await getCampaignStats(tx, ctx.org.id), plan: await getPlan(tx, ctx.org.planId) }));
  const canWrite = can(ctx.role, "campaigns:write");

  return (
    <>
      <PageHeader guide="campanhas" title="Campanhas" description="Cada campanha passa por regras de consentimento, bloqueio e frequência, e só é enviada depois de aprovada."
        actions={canWrite && <NewCampaign defaultOpen={sp.nova === "1"} defaultStatus={sp.status} defaultTone={seg.defaultTone} offerIdeas={seg.restrictions ? [] : seg.offerIdeas} restriction={seg.restrictions} channels={plan.limits.channels} />} />
      <Card>
        {stats.length ? (
          <Table>
            <thead><tr><Th>Campanha</Th><Th>Status</Th><Th className="text-right">Público</Th><Th className="text-right">Enviadas</Th><Th className="text-right">Respostas</Th><Th className="text-right">Retornos</Th><Th className="text-right">Taxa</Th></tr></thead>
            <tbody>
              {stats.map((c) => (
                <tr key={c.id} className="hover:bg-paper/60">
                  <Td>
                    <Link href={`/campanhas/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                      {CHANNEL_LABEL[c.channel as "whatsapp"]} · {dateBR(c.createdAt)}
                      {c.generatedBy === "ai" && <Badge tone="dark"><Sparkles className="size-2.5" />IA</Badge>}
                    </div>
                  </Td>
                  <Td><Badge tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Badge></Td>
                  <Td className="num text-right">{num(c.audience - c.skipped)}<span className="text-ink-400">/{num(c.audience)}</span></Td>
                  <Td className="num text-right">{num(c.sent)}</Td>
                  <Td className="num text-right">{num(c.replied)}</Td>
                  <Td className="num text-right">{num(c.returned)}</Td>
                  <Td className="num text-right">{c.sent ? pct(c.recoveryRate) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Megaphone className="size-5" />} title="Nenhuma campanha ainda"
            description="Crie uma campanha aqui ou peça ao agente: “crie uma campanha para os clientes inativos”." />
        )}
      </Card>
    </>
  );
}
