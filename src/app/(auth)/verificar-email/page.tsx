import Link from "next/link";
import { verifyEmail } from "@/lib/auth/tokens";
import { Notice } from "@/components/ui";

export const metadata = { title: "Confirmar e-mail" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const ok = await verifyEmail((await searchParams).token ?? "");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Confirmação de e-mail</h1>
      <div className="mt-8 space-y-4">
        {ok ? <Notice tone="success">E-mail confirmado. Obrigado!</Notice> : <Notice tone="danger">Link inválido, expirado ou já usado. Você pode pedir outro no aviso dentro do aplicativo.</Notice>}
        <Link href="/visao-geral" className="text-sm font-medium underline">Ir para o GravitaSolves</Link>
      </div>
    </>
  );
}
