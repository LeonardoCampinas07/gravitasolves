"use client";
import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "../actions";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== pw;
  if (state.done) return (
    <div className="mt-8 space-y-4">
      <Notice tone="success">Senha alterada. Por segurança, todos os dispositivos foram desconectados.</Notice>
      <Link href="/login" className="text-sm font-medium underline">Entrar com a nova senha</Link>
    </div>
  );
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha"><PasswordInput name="password" autoComplete="new-password" required minLength={10} rules onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="Repita a nova senha" hint={mismatch ? <span className="text-st-high">As senhas ainda não são iguais.</span> : confirm && !mismatch ? <span className="text-brand-600">As senhas conferem.</span> : undefined}>
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={10} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Button className="w-full" disabled={pending || mismatch}>{pending ? <><Loader2 className="size-4 animate-spin" />Salvando…</> : "Salvar nova senha"}</Button>
    </form>
  );
}
