"use client";
import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/app/actions";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="border-b border-line bg-paper px-4 py-2 text-[13px] text-ink-700 sm:px-8" role="status">
      Confirme seu e-mail (<b>{email}</b>) para poder recuperar a senha se precisar.{" "}
      {sent ? <span className="text-ink-500">Link enviado — confira a caixa de entrada.</span>
        : <button className="font-medium underline disabled:opacity-50" disabled={pending} onClick={() => start(async () => { await resendVerificationAction(); setSent(true); })}>Reenviar link</button>}
    </div>
  );
}
