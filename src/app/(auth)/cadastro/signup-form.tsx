"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { signupAction, type FormState } from "../actions";
import { Button, Checkbox, Field, Input, Notice } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { emailTypoFix } from "@/lib/email-typo";

export function SignupForm({ trialDays }: { trialDays: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});
  const v = state.values ?? {};
  const [email, setEmail] = useState(v.email ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const fix = emailTouched ? emailTypoFix(email) : null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Crie sua conta</h1>
      <p className="mt-1 text-sm text-ink-500">Em poucos minutos você vê quem sumiu e quanto isso representa.</p>
      <form action={action} className="mt-8 space-y-4">
        <Field label="Seu nome"><Input name="name" autoComplete="name" required minLength={2} defaultValue={v.name} placeholder="Como devemos te chamar" /></Field>
        <Field label="Nome do estabelecimento"><Input name="orgName" autoComplete="organization" required minLength={2} defaultValue={v.orgName} placeholder="Ex.: Barbearia Central" /></Field>
        <Field
          label="E-mail de trabalho"
          hint={fix ? (
            <span className="text-ink-700">
              Você quis dizer{" "}
              <button type="button" className="font-medium text-brand-600 underline underline-offset-2" onClick={() => setEmail(fix)}>{fix}</button>?
            </span>
          ) : undefined}
        >
          <Input name="email" type="email" inputMode="email" autoComplete="email" required placeholder="voce@exemplo.com"
            value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} />
        </Field>
        <Field label="Senha">
          <PasswordInput name="password" autoComplete="new-password" required minLength={10} rules />
        </Field>
        <Checkbox name="terms" required defaultChecked={v.terms === "on"} label={<>Li e aceito os <Link className="underline" href="/termos" target="_blank">termos de uso</Link> e a <Link className="underline" href="/privacidade" target="_blank">política de privacidade</Link>.</>} />
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button className="w-full" disabled={pending}>
          {pending ? <><Loader2 className="size-4 animate-spin" />Criando sua conta…</> : "Criar conta"}
        </Button>
        <p className="flex items-start justify-center gap-1.5 text-center text-xs text-ink-500">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-600" />
          {trialDays > 0 ? `${trialDays} dias grátis para testar. Não pedimos cartão.` : "Seus dados ficam protegidos e só a sua equipe tem acesso."}
        </p>
      </form>
      <p className="mt-6 text-sm text-ink-500">Já tem conta? <Link href="/login" className="font-medium text-ink-950 underline-offset-4 hover:underline">Entrar</Link></p>
    </>
  );
}
