import { Sparkles, Upload, Megaphone, CheckCircle2, Send, UserX, Settings2, Bot, ShieldCheck, Trash2, Workflow, Plug, CalendarCheck, Users, Tag, Download, Target, KeyRound, CreditCard } from "lucide-react";
import { relativeBR } from "@/lib/format";

const MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  "customers.import": { label: "Importação de clientes", icon: Upload },
  "campaign.create": { label: "Campanha criada", icon: Megaphone },
  "campaign.submit": { label: "Campanha enviada para aprovação", icon: Megaphone },
  "campaign.approve": { label: "Campanha aprovada", icon: CheckCircle2 },
  "campaign.dispatch": { label: "Envio de campanha", icon: Send },
  "campaign.manual_sent": { label: "Envio assistido registrado", icon: Send },
  "campaign.cancel": { label: "Campanha cancelada", icon: Megaphone },
  "campaign.edit": { label: "Mensagens editadas", icon: Megaphone },
  "agent.turn": { label: "Análise do agente", icon: Sparkles },
  "customer.opt_out": { label: "Descadastro registrado", icon: UserX },
  "customer.delete": { label: "Dados de titular eliminados (LGPD)", icon: Trash2 },
  "settings.rules": { label: "Critérios de inatividade atualizados", icon: Settings2 },
  "settings.business": { label: "Dados do estabelecimento atualizados", icon: Settings2 },
  "retention.purge": { label: "Política de retenção aplicada", icon: ShieldCheck },
  "automation.create": { label: "Automação criada", icon: Workflow },
  "integration.save": { label: "Integração conectada", icon: Plug },
  "demo.remove": { label: "Dados de demonstração removidos", icon: Trash2 },
  "integration.remove": { label: "Integração desconectada", icon: Plug },
  "booking.request": { label: "Novo pedido de agendamento", icon: CalendarCheck },
  "blocklist.add": { label: "Contato bloqueado para mensagens", icon: UserX },
  "blocklist.remove": { label: "Contato desbloqueado", icon: UserX },
  "customer.create": { label: "Cliente cadastrado", icon: Users },
  "customer.profile": { label: "Etiquetas e anotações do cliente", icon: Tag },
  "customer.bulk_tag_add": { label: "Etiqueta adicionada em lote", icon: Tag },
  "customer.bulk_tag_remove": { label: "Etiqueta removida em lote", icon: Tag },
  "customer.export": { label: "Clientes exportados", icon: Download },
  "org.export": { label: "Exportação completa dos dados", icon: Download },
  "settings.goal": { label: "Meta mensal atualizada", icon: Target },
  "member.add": { label: "Pessoa adicionada à equipe", icon: Users },
  "member.remove": { label: "Pessoa removida da equipe", icon: Users },
  "api_key.create": { label: "Chave de acesso criada", icon: KeyRound },
  "billing.cancel": { label: "Assinatura cancelada", icon: CreditCard },
  "billing.payment_confirmed": { label: "Pagamento confirmado", icon: CreditCard },
  "billing.payment_reversed": { label: "Pagamento estornado", icon: CreditCard },
  "visit.api": { label: "Visita registrada por integração", icon: CalendarCheck },
  "source.booking": { label: "Agenda sincronizada", icon: CalendarCheck },
  "source.disconnect": { label: "Fonte de dados desconectada", icon: Plug },
  "source.partner_request": { label: "Pedido de integração enviado", icon: Plug },
};

const PREFIX: [string, string][] = [["campaign.", "Campanha atualizada"], ["automation.", "Automação atualizada"], ["source.", "Dados importados"], ["settings.", "Configurações atualizadas"], ["customer.", "Cliente atualizado"], ["billing.", "Assinatura atualizada"]];
const fallbackLabel = (action: string) => PREFIX.find(([p]) => action.startsWith(p))?.[1] ?? "Alteração registrada";

export function ActivityFeed({ items }: { items: { id: string; action: string; actorType: string; summary: string | null; createdAt: Date }[] }) {
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-ink-500">Nenhuma atividade ainda.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const m = MAP[a.action] ?? { label: fallbackLabel(a.action), icon: a.actorType === "agent" ? Bot : Settings2 };
        const Icon = m.icon;
        return (
          <li key={a.id} className="flex gap-3 px-5 py-3">
            <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${a.actorType === "agent" ? "bg-ink-950 text-citrus" : a.actorType === "system" ? "bg-st-recovered/10 text-st-recovered" : "bg-paper text-ink-600 ring-1 ring-line"}`}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{m.label}</span>
                <span className="shrink-0 text-[11px] text-ink-400">{relativeBR(a.createdAt)}</span>
              </div>
              {a.summary && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-500">{a.summary}</p>}
              <span className="text-[11px] text-ink-400">{a.actorType === "agent" ? "Agente GravitaSolves" : a.actorType === "system" ? "Automático" : a.actorType === "api" ? "API" : "Equipe"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
