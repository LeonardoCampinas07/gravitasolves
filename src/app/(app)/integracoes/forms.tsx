"use client";
import { useState, useTransition } from "react";
import { Copy, KeyRound } from "lucide-react";
import { createApiKeyAction, removeIntegrationAction, revokeApiKeyAction, saveIntegrationAction } from "@/app/actions";
import { Badge, Button, Field, Input, Notice } from "@/components/ui";
import type { Provider } from "@/db/schema";

export function ProviderForm({ provider, fields, secretLabel, config, connected }: {
  provider: Provider; fields: { key: string; label: string; placeholder?: string; required?: boolean }[]; secretLabel: string; config: Record<string, string>; connected: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  return (
    <form className="space-y-3" action={(fd) => start(async () => {
      const r = await saveIntegrationAction(provider, fd);
      setMsg(r.ok ? { tone: "success", text: r.data ?? "Conectado." } : { tone: "danger", text: r.error ?? "Erro" });
    })}>
      {fields.map((f) => <Field key={f.key} label={f.label + (f.required ? " *" : "")}><Input name={f.key} defaultValue={config[f.key] ?? ""} placeholder={f.placeholder} /></Field>)}
      <Field label={secretLabel + (connected ? "" : " *")} hint={connected ? "Deixe em branco para manter a credencial atual." : undefined}>
        <Input name="secret" type="password" autoComplete="off" placeholder={connected ? "••••••••" : ""} />
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        <Button disabled={pending}>{pending ? "Testando…" : connected ? "Salvar e testar" : "Conectar"}</Button>
        {connected && <Button type="button" variant="ghost" disabled={pending} onClick={() => confirm("Desconectar este canal?") && start(async () => { await removeIntegrationAction(provider); })}>Desconectar</Button>}
      </div>
    </form>
  );
}

export function ApiKeys({ keys }: { keys: { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }[] }) {
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between"><span className="font-medium">Chaves de API</span>
        <Button variant="secondary" disabled={pending} onClick={() => { const name = prompt("Nome da chave (ex.: Sistema de agenda)"); if (name !== null) start(async () => { const r = await createApiKeyAction(name); if (r.ok) setCreated(r.data); else setError(r.error); }); }}><KeyRound className="size-4" />Nova chave</Button>
      </div>
      {created && (
        <Notice tone="success" title="Copie agora — ela não será exibida de novo">
          <div className="mt-1 flex items-center gap-2"><code className="break-all text-[12px]">{created}</code><button onClick={() => navigator.clipboard.writeText(created)} aria-label="Copiar"><Copy className="size-4" /></button></div>
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span><b>{k.name}</b> <code className="text-ink-500">{k.prefix}…</code></span>
            {k.revokedAt ? <Badge tone="danger">Revogada</Badge> : <button className="text-xs text-st-high hover:underline" disabled={pending} onClick={() => confirm("Revogar esta chave? Integrações que a usam vão parar.") && start(async () => { await revokeApiKeyAction(k.id); })}>Revogar</button>}
          </li>
        ))}
        {!keys.length && <li className="px-3 py-2 text-[13px] text-ink-500">Nenhuma chave criada.</li>}
      </ul>
    </div>
  );
}
