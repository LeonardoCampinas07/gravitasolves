"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { Loader2 } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Entrar</h1>
      <p className="mt-1 text-sm text-ink-500">Bem-vindo de volta.</p>
      <form action={action} className="mt-8 space-y-4">
        <Field label="E-mail"><Input name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state.values?.email} placeholder="voce@exemplo.com" /></Field>
        <Field label="Senha"><PasswordInput name="password" autoComplete="current-password" required /></Field>
        <div className="-mt-2 text-right"><Link href="/recuperar-senha" className="text-xs text-ink-500 underline-offset-4 hover:text-ink-950 hover:underline">Esqueci minha senha</Link></div>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button className="w-full" disabled={pending}>{pending ? <><Loader2 className="size-4 animate-spin" />Entrando…</> : "Entrar"}</Button>
      </form>
      <p className="mt-6 text-sm text-ink-500">Ainda não tem conta? <Link href="/cadastro" className="font-medium text-ink-950 underline-offset-4 hover:underline">Criar conta</Link></p>
    </>
  );
}
