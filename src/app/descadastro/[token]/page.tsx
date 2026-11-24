import { eq } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { customers, organizations } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/crypto";
import { optOutCustomer } from "@/lib/customers";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui";

export const metadata = { title: "Descadastro", robots: { index: false } };

/** Página pública de descadastro (link presente em todo e-mail). Confirmação explícita evita descadastros por pré-carregamento de links. */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const parsed = verifyUnsubscribeToken(decodeURIComponent(token));
  let orgName = "";
  let done = false;
  if (parsed) {
    const db = await getDb();
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, parsed.orgId));
    orgName = org?.name ?? "";
    const c = org ? await withOrg(parsed.orgId, (tx) => tx.select({ optedOutAt: customers.optedOutAt }).from(customers).where(eq(customers.id, parsed.customerId))) : [];
    done = !!c[0]?.optedOutAt || sp.ok === "1";
  }

  async function confirm() {
    "use server";
    if (!parsed) return;
    await withOrg(parsed.orgId, (tx) => optOutCustomer(tx, parsed.orgId, parsed.customerId, "Link de descadastro", "customer"));
    const { redirect } = await import("next/navigation");
    redirect(`/descadastro/${encodeURIComponent(token)}?ok=1`);
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm text-center animate-rise">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-950"><LogoMark size={26} tone="light" /></div>
        {!parsed ? (
          <><h1 className="mt-5 text-xl font-semibold">Link inválido</h1><p className="mt-2 text-sm text-ink-500">Responda à mensagem com SAIR ou fale com o estabelecimento.</p></>
        ) : done ? (
          <><h1 className="mt-5 text-xl font-semibold">Pronto, você foi descadastrado.</h1><p className="mt-2 text-sm text-ink-500">Você não receberá mais mensagens de {orgName || "este estabelecimento"} por meio do GravitaSolves.</p></>
        ) : (
          <>
            <h1 className="mt-5 text-xl font-semibold">Não quer mais receber mensagens?</h1>
            <p className="mt-2 text-sm text-ink-500">Confirme para parar de receber mensagens de {orgName || "este estabelecimento"} por WhatsApp, e-mail e SMS.</p>
            <form action={confirm} className="mt-6"><Button className="w-full">Confirmar descadastro</Button></form>
          </>
        )}
      </div>
    </div>
  );
}
