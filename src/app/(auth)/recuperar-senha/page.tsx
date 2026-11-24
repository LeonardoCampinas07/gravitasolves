"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ResetState } from "../actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ResetState, FormData>(forgotPasswordAction, {});
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Esqueci minha senha</h1>
      <p className="mt-1 text-sm text-ink-500">Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.</p>
      {state.done ? (
        <div className="mt-8"><Notice tone="success" title="Verifique seu e-mail">Se houver uma conta com esse e-mail, você vai receber o link em alguns minutos. Ele vale por 1 hora. Confira também a caixa de spam.</Notice></div>
      ) : (
        <form action={action} className="mt-8 space-y-4">
          <Field label="E-mail"><Input name="email" type="email" autoComplete="email" required /></Field>
          {state.error && <Notice tone="danger">{state.error}</Notice>}
          <Button className="w-full" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</Button>
        </form>
      )}
      <p className="mt-6 text-sm text-ink-500"><Link href="/login" className="font-medium text-ink-950 underline-offset-4 hover:underline">Voltar para o login</Link></p>
    </>
  );
}
