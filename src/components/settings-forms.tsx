"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addMemberAction, blocklistAction, removeMemberAction, saveBusinessAction, saveRulesAction } from "@/app/actions";
import { Badge, Button, Checkbox, Field, Input, Notice, Select } from "@/components/ui";
import type { OrgSettings } from "@/lib/settings";

function useResult() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok = "Salvo.", after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { tone: "success", text: ok } : { tone: "danger", text: r.error ?? "Erro" });
    if (r.ok) after?.();
  });
  return { pending, msg, run };
}

export function BusinessForm({ name, segment, signature, segments }: { name: string; segment: string; signature: string; segments: { id: string; label: string }[] }) {
  const { pending, msg, run } = useResult();
  return (
    <form className="space-y-3" action={(fd) => run(() => saveBusinessAction(fd))}>
      <Field label="Nome do estabelecimento"><Input name="name" defaultValue={name} /></Field>
      <Field label="Segmento" hint="Ao trocar o segmento, os critérios de inatividade voltam ao padrão do novo segmento.">
        <Select name="segment" defaultValue={segment}>{segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
      </Field>
      <Field label="Assinatura das mensagens (opcional)" hint="Adicionada ao final das mensagens. Ex.: — Equipe Barbearia Central"><Input name="signature" defaultValue={signature} maxLength={120} /></Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button disabled={pending}>Salvar</Button>
    </form>
  );
}

export function RulesForm({ s, retentionDays, full = true, onSaved, submitLabel = "Salvar critérios" }: { s: OrgSettings; retentionDays?: number; full?: boolean; onSaved?: () => void; submitLabel?: string }) {
  const { pending, msg, run } = useResult();
  const [t, setT] = useState(s.thresholds);
  return (
    <form className="space-y-4" action={(fd) => run(() => saveRulesAction(fd), "Critérios salvos — base reclassificada.", onSaved)}>
      <div className="grid gap-3 sm:grid-cols-3">
        {([["atRiskDays", "Em risco após", "var(--color-st-risk)"], ["inactiveDays", "Inativo após", "var(--color-st-inactive)"], ["highlyInactiveDays", "Altamente inativo após", "var(--color-st-high)"]] as const).map(([k, l, c]) => (
          <Field key={k} label={l}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full" style={{ background: c }} />
              <Input name={k} type="number" min={1} max={3650} value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} className="pl-7 pr-12" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">dias</span>
            </div>
          </Field>
        ))}
      </div>
      <TimelinePreview t={t} />
      <Checkbox name="useIndividualRhythm" defaultChecked={s.useIndividualRhythm} label="Ajustar ao ritmo de cada cliente"
        hint="Com 3+ visitas, os limites são escalados pelo intervalo médio do próprio cliente (entre 0,5× e 2×). Quem vem toda semana entra em risco antes de quem vem todo mês." />
      {full && (
        <>
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <Field label="Intervalo mínimo entre mensagens" hint="por cliente, em dias"><Input name="frequencyCapDays" type="number" min={1} max={90} defaultValue={s.frequencyCapDays} /></Field>
            <Field label="Máximo de mensagens em 30 dias" hint="por cliente"><Input name="maxMessagesPer30Days" type="number" min={1} max={10} defaultValue={s.maxMessagesPer30Days} /></Field>
            <Field label="Janela de atribuição" hint="retorno até N dias após a mensagem"><Input name="attributionWindowDays" type="number" min={1} max={120} defaultValue={s.attributionWindowDays} /></Field>
          </div>
          <Checkbox name="requireApproval" defaultChecked={s.requireApproval} label="Exigir aprovação de administrador antes de qualquer envio" />
          <Checkbox name="allowLegitimateInterestEmail" defaultChecked={s.allowLegitimateInterestEmail} label="Permitir e-mail com base em legítimo interesse"
            hint="Só para clientes marcados com relação comercial prévia. Exige avaliação de legítimo interesse documentada pelo estabelecimento. WhatsApp e SMS sempre exigem consentimento." />
          <Field label="Retenção de dados de clientes sem atividade" hint="Clientes sem visitas nem atualizações por esse período são excluídos automaticamente (180–3650 dias)."><Input name="retentionDays" type="number" min={180} max={3650} defaultValue={retentionDays} /></Field>
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button disabled={pending}>{pending ? "Salvando…" : submitLabel}</Button>
    </form>
  );
}

function TimelinePreview({ t }: { t: OrgSettings["thresholds"] }) {
  const max = Math.max(t.highlyInactiveDays * 1.25, 1);
  const seg = [
    { from: 0, to: t.atRiskDays, c: "var(--color-st-active)", l: "Ativo" },
    { from: t.atRiskDays, to: t.inactiveDays, c: "var(--color-st-risk)", l: "Em risco" },
    { from: t.inactiveDays, to: t.highlyInactiveDays, c: "var(--color-st-inactive)", l: "Inativo" },
    { from: t.highlyInactiveDays, to: max, c: "var(--color-st-high)", l: "Altamente inativo" },
  ];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {seg.map((s) => <div key={s.l} style={{ width: `${Math.max(0, ((s.to - s.from) / max) * 100)}%`, background: s.c }} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-500"><span>dia 0</span><span>{t.atRiskDays}</span><span>{t.inactiveDays}</span><span>{t.highlyInactiveDays}+ dias sem visita</span></div>
    </div>
  );
}

export function BlocklistForm({ items }: { items: { value: string; reason: string | null }[] }) {
  const { pending, msg, run } = useResult();
  const [v, setV] = useState("");
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => blocklistAction("add", v), "Adicionado.", () => setV("")); }}>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Telefone ou e-mail" />
        <Button variant="secondary" disabled={pending || !v}>Bloquear</Button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <ul className="thin-scroll max-h-48 divide-y divide-line overflow-auto rounded-lg border border-line">
        {items.map((i) => (
          <li key={i.value} className="flex items-center justify-between px-3 py-2 text-[13px]">
            <span><code>{i.value}</code> <span className="text-xs text-ink-400">{i.reason}</span></span>
            <button disabled={pending} onClick={() => run(() => blocklistAction("remove", i.value), "Removido.")} aria-label="Remover"><Trash2 className="size-3.5 text-ink-400 hover:text-st-high" /></button>
          </li>
        ))}
        {!items.length && <li className="px-3 py-2 text-[13px] text-ink-500">Lista vazia.</li>}
      </ul>
    </div>
  );
}

export function MembersForm({ members, me, roleLabels }: { members: { userId: string; name: string; email: string; role: string }[]; me: string; roleLabels: Record<string, string> }) {
  const { pending, msg, run } = useResult();
  const [temp, setTemp] = useState<string>();
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
            <span className="min-w-0"><b>{m.name}</b> <span className="text-ink-500">{m.email}</span></span>
            <span className="flex items-center gap-2"><Badge>{roleLabels[m.role]}</Badge>
              {m.role !== "owner" && m.userId !== me && <button disabled={pending} onClick={() => confirm("Remover acesso?") && run(() => removeMemberAction(m.userId), "Acesso removido.")} aria-label="Remover"><Trash2 className="size-3.5 text-ink-400 hover:text-st-high" /></button>}
            </span>
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" action={(fd) => run(async () => { const r = await addMemberAction(fd); if (r.ok) setTemp(r.data?.tempPassword); return r; }, "Membro adicionado.")}>
        <Input name="email" type="email" placeholder="email@empresa.com" required />
        <Select name="role" defaultValue="manager">
          <option value="admin">Administrador</option><option value="manager">Gestor</option><option value="viewer">Leitura</option>
        </Select>
        <Button variant="secondary" disabled={pending}>Adicionar</Button>
      </form>
      {temp && <Notice tone="warn" title="Senha temporária (mostrada uma única vez)">Compartilhe por um canal seguro: <code>{temp}</code></Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-xs text-ink-500">Gestor: importa clientes, cria e envia campanhas aprovadas, usa o agente. Leitura: apenas consulta. Aprovação de campanhas, integrações e dados pessoais (exportar/excluir) exigem Administrador.</p>
    </div>
  );
}
