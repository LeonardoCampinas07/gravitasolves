/**
 * Base de conhecimento do produto (Assistente Gravita e central de ajuda). Conteúdo estático e
 * verificado contra as telas reais — sem IA, custo zero, funciona offline. Cada artigo aponta
 * para a tela onde a tarefa é feita.
 */
import { GUIDES } from "./guides";

export interface Article { id: string; title: string; body: string; href: string; cta: string; keywords?: string }

export const FAQ: [string, string][] = [
  ["Preciso de planilha?", "Não. A planilha é só uma das opções. Você pode montar a base pelo link de agendamento, pela agenda, pelo WhatsApp ou registrando os atendimentos."],
  ["O GravitaSolves envia mensagens sozinho?", "Só se você conectar o WhatsApp oficial e aprovar a campanha. Sem integração, ele abre a conversa pronta no seu WhatsApp e você aperta enviar."],
  ["Por que alguns clientes ficam “fora do envio”?", "Porque não autorizaram aquele canal, pediram para sair, estão na lista de bloqueio ou já receberam mensagem recentemente. Isso protege você (LGPD) e evita incomodar."],
  ["Como o cliente para de receber mensagens?", "Respondendo SAIR no WhatsApp ou SMS, ou pelo link de descadastro do e-mail. Você também pode descadastrar pela ficha do cliente."],
  ["O que é o potencial de retorno?", "Uma nota de 0 a 100 que combina quanto o cliente gastava, com que frequência vinha, há quanto tempo sumiu e se autorizou contato. Quanto maior, maior a chance de voltar."],
  ["Os valores de projeção são garantidos?", "Não. A projeção estima quanto voltaria se uma parte dos afastados retornasse. A receita recuperada de verdade aparece em Resultados, com base nas visitas registradas."],
  ["Posso mudar os prazos de “em risco” e “inativo”?", "Sim, em Configurações → Critérios de inatividade. O GravitaSolves também se adapta ao ritmo de cada cliente."],
  ["O agente está em “modo básico”. O que isso significa?", "Que o agente está respondendo às perguntas mais comuns (quem chamar primeiro, quanto voltou, criar campanha...) sempre com os dados da sua empresa. Para perguntas fora dessa lista, use as sugestões que aparecem na tela."],
];

const TASKS: Article[] = [
  { id: "t-import", title: "Importar clientes de uma planilha (CSV ou Excel)", body: "Em Clientes → Importar, envie o arquivo. O GravitaSolves reconhece as colunas sozinho (nome, telefone, e-mail, última visita), mostra uma prévia e junta duplicados pelo telefone.", href: "/clientes/importar", cta: "Importar planilha", keywords: "excel xlsx csv subir arquivo base lista" },
  { id: "t-add", title: "Cadastrar um cliente manualmente", body: "Em Clientes, clique em “Novo cliente”. Ou registre o atendimento na Agenda: o cliente é criado na hora.", href: "/clientes", cta: "Abrir clientes", keywords: "novo adicionar criar cadastro" },
  { id: "t-connect", title: "Conectar agenda, WhatsApp ou link de agendamento", body: "Em Conexões, escolha como você atende. Dá para usar várias fontes ao mesmo tempo — tudo é juntado pelo telefone.", href: "/fontes", cta: "Abrir conexões", keywords: "google agenda calendario icloud outlook ics whatsapp contatos fonte sincronizar" },
  { id: "t-who", title: "Descobrir quem chamar primeiro", body: "A Central de recuperação lista os afastados com o motivo (ex.: “voltava a cada 15 dias, está há 40”) e o próximo passo. Use a aba Prioritários.", href: "/inativos?status=prioritarios#prioridade", cta: "Ver prioritários", keywords: "inativos sumidos risco prioridade quem contatar recuperar" },
  { id: "t-campaign", title: "Criar uma campanha de reativação", body: "Em Campanhas → Nova campanha, escolha o grupo (em risco, inativos…) e o canal. As mensagens são geradas e você pode editar. Depois envie para aprovação.", href: "/campanhas?nova=1", cta: "Nova campanha", keywords: "mensagem whatsapp email enviar disparo campanha" },
  { id: "t-approve", title: "Aprovar e enviar uma campanha", body: "Abra a campanha, clique em “Enviar para aprovação” e depois “Aprovar”. Com WhatsApp oficial o envio é automático; sem ele, use “Abrir no WhatsApp” e “Marcar enviada”.", href: "/campanhas", cta: "Ver campanhas", keywords: "aprovacao aprovar enviar disparar fila" },
  { id: "t-visit", title: "Registrar que o cliente voltou", body: "Na ficha do cliente, use “Registrar visita” (informe o valor para medir a receita). Ou use o Registro rápido da Agenda. Se ele recebeu campanha, o retorno é contado em Resultados.", href: "/agenda", cta: "Abrir agenda", keywords: "visita atendimento voltou retorno valor receita" },
  { id: "t-results", title: "Ver resultados e exportar relatório", body: "Em Resultados, compare períodos (30, 90 dias ou 12 meses), veja receita confirmada x potencial, o ranking de campanhas e baixe CSV de recuperados e campanhas.", href: "/resultados", cta: "Abrir resultados", keywords: "relatorio exportar csv receita taxa ranking comparar periodo" },
  { id: "t-auto", title: "Automatizar a reativação", body: "Em Automações, ligue os gatilhos (ex.: cliente entrou em risco). Uma vez por dia o sistema prepara a campanha; por padrão ela espera a sua aprovação.", href: "/automacoes", cta: "Abrir automações", keywords: "automatico gatilho regra automacao" },
  { id: "t-team", title: "Convidar a equipe e definir permissões", body: "Em Configurações → Equipe, convide por e-mail e escolha o papel: administrador, gerente (cria e envia campanhas) ou leitura.", href: "/configuracoes#equipe", cta: "Abrir equipe", keywords: "usuario convite permissao papel funcionario acesso" },
  { id: "t-thresholds", title: "Ajustar os prazos de em risco e inativo", body: "Em Configurações → Critérios de inatividade. Com o ritmo individual ligado, cada cliente é avaliado pelo próprio intervalo de visitas.", href: "/configuracoes", cta: "Abrir configurações", keywords: "prazo dias criterio limite ritmo" },
  { id: "t-consent", title: "Registrar autorização de contato (LGPD)", body: "Na ficha do cliente, marque os canais autorizados (WhatsApp, e-mail, SMS). Sem autorização, o cliente fica fora dos envios.", href: "/clientes", cta: "Abrir clientes", keywords: "lgpd consentimento autorizacao opt-in descadastro privacidade" },
  { id: "t-plan", title: "Ver assinatura, plano e uso", body: "Em Configurações → Assinatura você vê o plano, o período de teste e a forma de pagamento.", href: "/configuracoes#assinatura", cta: "Abrir assinatura", keywords: "plano pagamento cobranca fatura trial teste preco" },
  { id: "t-agent", title: "Perguntar sobre os seus números", body: "O Agente de IA responde com os dados reais da sua base: “quem sumiu este mês?”, “quanto voltou?”. Ele também cria rascunhos de campanha — nada é enviado sem aprovação.", href: "/agente", cta: "Falar com o agente", keywords: "ia inteligencia artificial pergunta analise agente consultor" },
];

/** Qual guia de tela corresponde a uma rota. */
export function guideIdFor(pathname: string): string | null {
  if (/^\/campanhas\/[^/]+/.test(pathname)) return "campanha";
  const first = pathname.split("/")[1] ?? "";
  return GUIDES[first] ? first : null;
}

export function allArticles(): Article[] {
  const guides: Article[] = Object.entries(GUIDES).map(([id, g]) => ({
    id: `g-${id}`, title: g.title, body: g.steps.join(" ") + (g.tip ? ` Dica: ${g.tip}` : ""),
    href: id === "campanha" ? "/campanhas" : `/${id}`, cta: "Abrir a tela",
  }));
  const faq: Article[] = FAQ.map(([q, a], i) => ({ id: `f-${i}`, title: q, body: a, href: "/ajuda", cta: "Central de ajuda" }));
  return [...TASKS, ...guides, ...faq];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["a", "o", "e", "de", "do", "da", "dos", "das", "um", "uma", "como", "que", "para", "por", "no", "na", "em", "eu", "meu", "minha", "os", "as", "se", "com"]);

/** Busca simples por palavras (sem acento), título pesa mais que corpo. */
export function searchArticles(query: string, limit = 6): Article[] {
  const terms = norm(query).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
  if (!terms.length) return [];
  return allArticles()
    .map((a) => {
      const title = norm(a.title), body = norm(a.body), kw = norm(a.keywords ?? "");
      let score = 0;
      for (const t of terms) {
        const stem = t.length > 4 ? t.slice(0, -1) : t;
        if (title.includes(stem)) score += 3;
        if (kw.includes(stem)) score += 2;
        if (body.includes(stem)) score += 1;
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
