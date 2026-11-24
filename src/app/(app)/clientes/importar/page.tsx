import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { imports } from "@/db/schema";
import { requireCtx } from "@/lib/auth/session";
import { dateTimeBR, num } from "@/lib/format";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";

export const metadata = { title: "Importar clientes" };

export default async function ImportPage() {
  const ctx = await requireCtx("import");
  const history = await withOrg(ctx.org.id, (tx) => tx.select().from(imports).where(eq(imports.orgId, ctx.org.id)).orderBy(desc(imports.createdAt)).limit(10));
  return (
    <>
      <PageHeader title="Importar clientes" description={<>Reimportar a mesma base é seguro: clientes são reconhecidos por telefone, e-mail ou ID e atualizados. <Link href="/clientes" className="underline">Voltar para clientes</Link></>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ImportWizard allowDemo />
        <Card className="self-start">
          <CardHeader title="Importações anteriores" />
          {history.length ? (
            <Table>
              <thead><tr><Th>Arquivo</Th><Th className="text-right">Novos</Th><Th className="text-right">Atual.</Th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id}><Td><div className="max-w-[160px] truncate text-[13px]">{h.filename}</div><div className="text-[11px] text-ink-400">{dateTimeBR(h.createdAt)}</div></Td>
                  <Td className="num text-right">{num(h.created)}</Td><Td className="num text-right">{num(h.updated)}</Td></tr>
              ))}</tbody>
            </Table>
          ) : <p className="px-5 py-6 text-sm text-ink-500">Nenhuma importação ainda.</p>}
        </Card>
      </div>
    </>
  );
}
