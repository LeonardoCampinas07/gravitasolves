import Link from "next/link";
import { Cable, CalendarDays, UserMinus, Sparkles, Megaphone, LineChart, Smartphone, MessageCircle, UserPlus, FlaskConical, ArrowRight } from "lucide-react";
import { requireCtx } from "@/lib/auth/session";
import { STATUS_LABEL } from "@/lib/classification";
import { STATUS_HELP } from "@/lib/guides";
import { getSegment } from "@/lib/segments";
import { Card, CardHeader, PageHeader, STATUS_COLOR } from "@/components/ui";
import { ReopenTourButton } from "@/components/guide";
import { KnowledgeSearch } from "@/components/help-assistant";
import { FAQ } from "@/lib/knowledge";
import type { CustomerStatus } from "@/db/schema";

export const metadata = { title: "Central de ajuda" };

const STEPS = [
  { icon: Cable, title: "Conecte seus clientes", text: "Escolha como você atende: link de agendamento, Google Agenda, WhatsApp, contatos ou planilha.", href: "/fontes", cta: "Abrir Conexões" },
  { icon: CalendarDays, title: "Registre os atendimentos", text: "Use o Registro rápido da Agenda ao fim de cada atendimento. Isso mantém a base sempre certa.", href: "/agenda", cta: "Abrir Agenda" },
  { icon: UserMinus, title: "Veja quem está sumindo", text: "A Central de recuperação mostra quem passou do intervalo normal, por quê e qual o próximo passo.", href: "/inativos", cta: "Abrir recuperação" },
  { icon: Sparkles, title: "Peça ajuda ao agente", text: "Pergunte em português: “quem devo chamar primeiro?”, “crie uma campanha para os inativos”.", href: "/agente", cta: "Falar com o agente" },
  { icon: Megaphone, title: "Aprove e envie a campanha", text: "Revise as mensagens, aprove e envie — pelo WhatsApp oficial ou abrindo a conversa pronta no seu WhatsApp.", href: "/campanhas", cta: "Ver campanhas" },
  { icon: LineChart, title: "Acompanhe quem voltou", text: "Quando o cliente voltar, registre a visita. Resultados mostra quem foi recuperado e quanto faturou.", href: "/resultados", cta: "Ver resultados" },
];

const TEST = [
  { icon: FlaskConical, title: "Use dados de exemplo", text: "Em Conexões → Planilha, envie o arquivo examples\\clientes-exemplo.csv (clientes fictícios com meses de histórico). Assim você vê o painel, os inativos e o agente funcionando com volume." },
  { icon: UserPlus, title: "Cadastre você mesmo como cliente", text: "Em Clientes → Novo cliente, coloque seu nome e seu WhatsApp e marque que autoriza mensagens. Crie uma campanha, aprove e clique em “Abrir no WhatsApp”: a mensagem personalizada abre pronta para o seu número." },
  { icon: Smartphone, title: "Peça um horário pelo celular", text: "Ative o link de agendamento em Conexões. Com o celular no mesmo Wi-Fi do computador, abra o endereço “Network” que aparece no terminal + /agendar/seu-link e peça um horário. Ele chega na Agenda." },
  { icon: MessageCircle, title: "Envie conversas reais do seu WhatsApp", text: "No celular: conversa → ⋮ → Mais → Exportar conversa → Sem mídia. Envie em Conexões → Histórico do WhatsApp. Quem não fala com você há mais de 30 dias aparece como inativo." },
];


export default async function HelpPage() {
  const ctx = await requireCtx();
  const t = ctx.settings.thresholds;
  const seg = getSegment(ctx.org.segment);
  return (
    <>
      <PageHeader eyebrow="Central de ajuda" title="Como usar o GravitaSolves" description="Tudo o que você precisa para começar, testar e tirar o máximo da plataforma." actions={<ReopenTourButton />} />

      <Card className="mb-4 p-5">
        <div className="mb-2 text-[14px] font-semibold">Pesquisar na ajuda</div>
        <KnowledgeSearch />
      </Card>

      <Card className="mb-4">
        <CardHeader title="Primeiros passos" description="Siga nesta ordem. Cada passo leva poucos minutos." />
        <ol className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0 xl:grid-cols-3">
          {STEPS.map(({ icon: I, title, text, href, cta }, i) => (
            <li key={title} className="flex gap-3 p-5 md:border-b md:border-line">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-citrus"><I className="size-5" strokeWidth={1.75} /><span className="num absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-citrus text-[11px] font-semibold text-ink-950">{i + 1}</span></span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{text}</p>
                <Link href={href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">{cta}<ArrowRight className="size-3.5" /></Link>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Como testar sem ter um comércio" description="Você faz os dois papéis: dono e cliente." />
          <ul className="divide-y divide-line">
            {TEST.map(({ icon: I, title, text }) => (
              <li key={title} className="flex gap-3 px-5 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-ink-700 ring-1 ring-line"><I className="size-4" /></span>
                <div><div className="text-[14px] font-medium">{title}</div><p className="mt-0.5 text-[13px] leading-relaxed text-ink-600">{text}</p></div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="self-start">
          <CardHeader title="O que cada status significa" description={`Prazos atuais para ${seg.label.toLowerCase()}: em risco após ${t.atRiskDays} dias, inativo após ${t.inactiveDays}, altamente inativo após ${t.highlyInactiveDays}.`} />
          <ul className="divide-y divide-line">
            {(["active", "at_risk", "inactive", "highly_inactive", "recovered", "unknown"] as CustomerStatus[]).map((s) => (
              <li key={s} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                <div><div className="text-[13.5px] font-medium">{STATUS_LABEL[s]}</div><p className="text-[12.5px] text-ink-500">{STATUS_HELP[s]}</p></div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3 text-[12.5px]"><Link href="/configuracoes" className="font-medium text-brand-700 hover:underline">Ajustar os prazos em Configurações</Link></div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Perguntas frequentes" />
        <div className="divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium">
                {q}<span className="text-ink-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-600">{a}</p>
            </details>
          ))}
        </div>
      </Card>
    </>
  );
}
