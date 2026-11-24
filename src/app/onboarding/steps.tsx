"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Scissors, Sparkles, Stethoscope, Flower2, Dumbbell, UtensilsCrossed, Shirt, Wrench, PawPrint, Store, type LucideIcon } from "lucide-react";

const SEGMENT_ICONS: Record<string, LucideIcon> = { Scissors, Sparkles, Stethoscope, Flower2, Dumbbell, UtensilsCrossed, Shirt, Wrench, PawPrint, Store };
import { createCampaignAction, onboardingStepAction } from "@/app/actions";
import { SourcePicker, type SourceState } from "@/components/source-picker";
import { RulesForm } from "@/components/settings-forms";
import { Button, Field, Input, Notice, cx } from "@/components/ui";
import type { OrgSettings } from "@/lib/settings";

function useStep(step: number) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const advance = (fd = new FormData(), to?: string) => start(async () => {
    const r = await onboardingStepAction(step, fd);
    if (!r.ok) return setError(r.error);
    router.push(to ?? (step >= 7 ? "/visao-geral" : `/onboarding?step=${step + 1}`));
    router.refresh();
  });
  return { pending, error, advance };
}

const H = ({ title, sub }: { title: string; sub: string }) => (<><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">{title}</h1><p className="mt-1 text-sm text-ink-500">{sub}</p></>);

export function StepName({ name }: { name: string }) {
  const { pending, error, advance } = useStep(1);
  return (
    <form action={advance} className="mt-0">
      <H title="Como se chama o seu negócio?" sub="Usamos o nome nas mensagens enviadas aos seus clientes." />
      <div className="mt-8 max-w-md space-y-4">
        <Field label="Nome do estabelecimento"><Input name="name" defaultValue={name} required autoFocus /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button disabled={pending}>Continuar</Button>
      </div>
    </form>
  );
}

export function StepSegment({ current, segments }: { current: string; segments: { id: string; label: string; icon: string; hint: string }[] }) {
  const { pending, error, advance } = useStep(2);
  const [sel, setSel] = useState(current === "generic" ? "" : current);
  return (
    <div>
      <H title="Qual é o seu segmento?" sub="O agente adapta critérios de inatividade, linguagem e ofertas ao seu tipo de negócio." />
      <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {segments.map((s) => {
          const Icon = SEGMENT_ICONS[s.icon] ?? Store;
          return (
            <button key={s.id} type="button" onClick={() => setSel(s.id)}
              className={cx("rounded-xl border bg-surface p-4 text-left transition", sel === s.id ? "border-ink-950 ring-2 ring-ink-950/10" : "border-line hover:border-ink-300")}>
              <Icon className={cx("size-5", sel === s.id ? "text-brand-600" : "text-ink-500")} strokeWidth={1.75} />
              <div className="mt-3 text-sm font-medium">{s.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-400">{s.hint}</div>
            </button>
          );
        })}
      </div>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      <Button className="mt-6" disabled={pending || !sel} onClick={() => { const fd = new FormData(); fd.set("segment", sel); advance(fd); }}>Continuar</Button>
    </div>
  );
}

const SIZES = [["ate-200", "Até 200 clientes"], ["200-1000", "200 a 1.000"], ["1000-5000", "1.000 a 5.000"], ["5000+", "Mais de 5.000"]];
export function StepSize({ current }: { current: string | null }) {
  const { pending, advance } = useStep(3);
  const [sel, setSel] = useState(current ?? "");
  return (
    <div>
      <H title="Quantos clientes você tem, aproximadamente?" sub="Ajuda a recomendar o plano e o ritmo de campanhas." />
      <div className="mt-8 grid max-w-lg gap-2 sm:grid-cols-2">
        {SIZES.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSel(v)} className={cx("rounded-xl border bg-surface px-4 py-3.5 text-left text-sm", sel === v ? "border-ink-950 ring-2 ring-ink-950/10" : "border-line hover:border-ink-300")}>{l}</button>
        ))}
      </div>
      <Button className="mt-6" disabled={pending || !sel} onClick={() => { const fd = new FormData(); fd.set("baseSize", sel); advance(fd); }}>Continuar</Button>
    </div>
  );
}

export function StepConnect({ state }: { state: SourceState }) {
  const { pending, advance } = useStep(4);
  const router = useRouter();
  const has = Object.values(state.counts).some((n) => n > 0);
  const [done, setDone] = useState(has);
  return (
    <div>
      <H title="Como você atende seus clientes?" sub="Sem planilha: conecte o jeito que você já trabalha e o GravitaSolves monta sua base sozinho. Pode escolher mais de um." />
      <div className="mt-8"><SourcePicker state={state} compact onAnySuccess={() => { setDone(true); router.refresh(); }} /></div>
      <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-line bg-paper/90 py-4 backdrop-blur">
        <Button disabled={pending || !done} onClick={() => advance()}>Continuar</Button>
        <span className="text-[13px] text-ink-500">{done ? "Clientes conectados. Você pode adicionar outras fontes depois em Conexões." : "Conecte ao menos uma fonte (ou carregue a demonstração) para continuar."}</span>
      </div>
    </div>
  );
}

export function StepRules({ s, segmentLabel }: { s: OrgSettings; segmentLabel: string }) {
  const { advance } = useStep(5);
  return (
    <div>
      <H title="Quando um cliente está sumindo?" sub={`Sugerimos períodos típicos de ${segmentLabel.toLowerCase()}. Ajuste à frequência natural de compra do seu negócio.`} />
      <div className="mt-8"><RulesForm s={s} full={false} onSaved={() => advance()} submitLabel="Salvar e analisar minha base" /></div>
    </div>
  );
}

export function StepContinue({ step, label }: { step: number; label: string }) {
  const { pending, advance } = useStep(step);
  return <Button className="mt-6" disabled={pending} onClick={() => advance()}>{label}</Button>;
}

export function StepCampaign({ existing, tone }: { existing: { id: string; name: string } | null; tone: string }) {
  const { pending, advance } = useStep(7);
  const [creating, start] = useTransition();
  const [campaign, setCampaign] = useState(existing);
  const [error, setError] = useState<string>();
  return (
    <div>
      <H title="Revise sua primeira campanha" sub="O agente prepara uma campanha em rascunho para os clientes afastados com maior potencial. Nada é enviado até você aprovar." />
      <div className="mt-8 space-y-4">
        {campaign ? (
          <Notice tone="success" title="Campanha sugerida criada">“{campaign.name}” está em rascunho com mensagens personalizadas e regras de consentimento aplicadas.</Notice>
        ) : (
          <Button variant="accent" disabled={creating} onClick={() => start(async () => {
            const fd = new FormData();
            fd.set("name", "Primeira reativação"); fd.set("channel", "whatsapp"); fd.set("tone", tone); fd.set("minPriority", "0"); fd.set("limit", "200");
            ["at_risk", "inactive", "highly_inactive"].forEach((s) => fd.append("statuses", s));
            const r = await createCampaignAction(fd);
            if (!r.ok) return setError(r.error);
            setCampaign({ id: r.data!, name: "Primeira reativação" });
          })}>{creating ? "Gerando mensagens…" : "Gerar campanha sugerida"}</Button>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          {campaign && <Button variant="secondary" disabled={pending} onClick={() => advance(new FormData(), `/campanhas/${campaign.id}`)}>Concluir e revisar a campanha</Button>}
          <Button disabled={pending} onClick={() => advance()}>Concluir e ir para o painel</Button>
        </div>
      </div>
    </div>
  );
}
