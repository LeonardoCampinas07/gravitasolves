import Link from "next/link";
import { peekToken } from "@/lib/auth/tokens";
import { Notice } from "@/components/ui";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const valid = await peekToken(token, "password_reset");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Criar nova senha</h1>
      {valid ? <ResetForm token={token} /> : (
        <div className="mt-8 space-y-4">
          <Notice tone="danger">Este link é inválido, expirou ou já foi usado.</Notice>
          <Link href="/recuperar-senha" className="text-sm font-medium underline">Pedir um novo link</Link>
        </div>
      )}
    </>
  );
}
