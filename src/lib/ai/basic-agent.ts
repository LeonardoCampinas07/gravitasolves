/**
 * Modo básico (sem IA generativa): reconhece os comandos mais comuns por regras e executa as
 * mesmas ferramentas do agente. Usado quando ANTHROPIC_API_KEY não está configurada ou a cota acabou.
 */
import { getSegment } from "@/lib/segments";
import { runTool, type ToolAction, type ToolContext } from "./tools";
import type { AgentReply } from "./agent";
import { BASIC_EXAMPLE_GROUPS } from "./examples";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export { BASIC_EXAMPLE_GROUPS, BASIC_EXAMPLES } from "./examples";

const CAMPAIGN_STATUS: Record<string, string> = { draft: "rascunho", pending_approval: "aguardando aprovação", approved: "aprovada", sending: "enviando", completed: "concluída", cancelled: "cancelada" };
const LAPSED = ["at_risk", "inactive", "highly_inactive"];

type Row = Record<string, unknown>;

export async function runBasicAgent(ctx: ToolContext, text: string): Promise<AgentReply> {
  const q = norm(text);
  const actions: ToolAction[] = [];
  const used: string[] = [];
  const call = async (name: string, input: Record<string, unknown>) => {
    used.push(name);
    const out = await runTool(name, input, ctx);
    if (out.action) actions.push(out.action);
    return out.data as Row & Row[];
  };
  const done = (t: string): AgentReply => ({ text: t, actions, mode: "basic", toolsUsed: used });
  const seg = getSegment(ctx.org.segment);
  const range = q.match(/entre\s*(\d{1,4})\s*e\s*(\d{1,4})\s*dias?/);
  const days = range ? Number(range[1]) : Number(q.match(/(\d{1,4})\s*dias?/)?.[1] ?? NaN);
  const maxDays = range ? Number(range[2]) : undefined;
  const ticketMin = Number(q.match(/(?:ticket|gast\w*)[^\d]{0,25}(?:acima|mais|maior|superior)[^\d]{0,8}(\d{1,6})/)?.[1] ?? NaN);
  const big = /gast(am|a|ou|avam|ava) mais|ticket (alto|maior)|maior (gasto|ticket)|\bvips?\b|melhores clientes|mais valiosos|que mais gast/.test(q);
  const lapsedWord = /inativ|sumi|afastad|parar(am)?|pararam|nao (vem|aparece|volta)|sem (vir|visit)|em risco/.test(q);
  const statusesFrom = () => {
    const st: string[] = [];
    if (/em risco|risco/.test(q)) st.push("at_risk");
    if (/altamente|muito tempo|sumid/.test(q)) st.push("highly_inactive");
    if (/inativ/.test(q) && !st.includes("highly_inactive")) st.push("inactive", "highly_inactive");
    return st.length ? [...new Set(st)] : undefined;
  };

  try {
    if (/(cri|mont|ger|prepar|fa[cz]).*campanha/.test(q)) {
      const channel = /e-?mail/.test(q) ? "email" : /sms/.test(q) ? "sms" : "whatsapp";
      const statuses = statusesFrom() ?? ["at_risk", "inactive", "highly_inactive"];
      const name = `Reativação ${/mes/.test(q) ? "do mês" : ""} — ${new Date().toLocaleDateString("pt-BR")}`.replace(/\s+/g, " ");
      const r = await call("create_campaign_draft", {
        name, channel, statuses,
        ...(Number.isFinite(days) ? { min_days_inactive: days } : {}),
        ...(maxDays ? { max_days_inactive: maxDays } : {}),
        ...(Number.isFinite(ticketMin) ? { min_avg_ticket_reais: ticketMin } : big ? { min_priority: 60 } : {}),
      });
      return done([
        `Criei a campanha **${name}** em rascunho (canal: ${channel}).`,
        `- Público: **${r.publico_total}** clientes`,
        `- Elegíveis para envio: **${r.elegiveis_para_envio}**`,
        `- Fora por regras de contato (sem autorização, descadastro, bloqueio ou frequência): **${r.bloqueados_por_regras_de_contato}**`,
        `- Mensagens geradas por: ${r.mensagens_geradas_por}`,
        r.aviso ? `- Aviso: ${r.aviso}` : "",
        "",
        "Nada foi enviado. Revise as mensagens e aprove a campanha em **Campanhas**.",
      ].filter(Boolean).join("\n"));
    }

    if (/melhorar.*(taxa|resultado|recupera)|o que (posso|devo) fazer|dica|como (aumentar|melhorar)/.test(q)) {
      const r = await call("recovery_diagnosis", {});
      const pend = r.pendencias as Row[];
      const has = (k: string) => pend.find((p) => p.tipo === k);
      const tips: string[] = [];
      if (has("approval")) tips.push(`- **Aprove as campanhas paradas**: ${has("approval")!.descricao}. Enquanto não aprovar, ninguém recebe nada.`);
      if (has("queued")) tips.push(`- **Envie o que já está aprovado**: ${has("queued")!.descricao}.`);
      if (has("replied")) tips.push(`- **Responda quem respondeu**: ${has("replied")!.descricao}. É a etapa com maior chance de retorno.`);
      if (has("failed")) tips.push(`- **Corrija falhas de envio**: ${has("failed")!.descricao}. Confira os números e a conexão do canal.`);
      if (has("ready")) tips.push(`- **Chame quem está pronto**: ${has("ready")!.descricao}. Peça: _"Crie uma campanha para os clientes inativos"_.`);
      if (has("consent")) tips.push(`- **Peça autorização de contato**: ${has("consent")!.descricao}. Sem ela não dá para chamar — peça no próximo atendimento ou pelo link de agendamento.`);
      if (!r.meta_mensal) tips.push("- **Defina uma meta mensal** na Visão geral para acompanhar o progresso.");
      const rate = r.taxa_recuperacao_90_dias ? `Taxa de recuperação (90 dias): **${r.taxa_recuperacao_90_dias}** — ${r.voltaram_90_dias} de ${r.contatados_90_dias} clientes contatados voltaram.` : "Ainda não há envios nos últimos 90 dias para calcular a taxa de recuperação.";
      return done([
        rate,
        `Este mês: **${r.retornos_mes_atual}** retorno(s) · mesmo período do mês passado: ${r.retornos_mesmo_periodo_mes_passado}.`,
        "", tips.length ? "O que fazer agora, com base nos seus dados:" : "Não encontrei pendências — siga criando campanhas para os afastados com contato autorizado.",
        ...tips,
      ].join("\n"));
    }

    if (/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|ajuda|help|menu)\b|o que (voce|vc) (faz|sabe|consegue)|como (te uso|funciona voce|usar voce)|quais perguntas/.test(q)) {
      return done(["Oi! Sou o agente de retenção. Respondo com os dados atuais dos seus clientes. Alguns exemplos:",
        ...BASIC_EXAMPLE_GROUPS.flatMap((g) => [`\n**${g.title}**`, ...g.items.slice(0, 3).map((e) => `- ${e}`)]),
        "", "Pergunte com as suas palavras: eu entendo variações."].join("\n"));
    }

    if (/(escrev|sugir|sugest|modelo|exemplo|ideia).*(mensagem|texto|msg)|o que (escrever|mandar|falar|dizer)|como (chamar|abordar|falar com)/.test(q)) {
      const v = seg.vocab;
      const hooks = seg.hooks.length ? seg.hooks : ["que tal voltar esta semana?"];
      return done([`Três mensagens no tom **${seg.defaultTone}** para ${seg.label.toLowerCase()} (troque {nome} pelo nome do cliente):`, "",
        `1. "Oi, {nome}! Faz um tempinho que você não aparece por aqui. ${cap(hooks[0])}"`,
        `2. "{nome}, sentimos sua falta! ${cap(hooks[1 % hooks.length])} Quer que eu reserve um horário para você?"`,
        `3. "Olá, {nome}! Separamos uma condição especial para o seu próximo ${v.visit}: ${seg.offerIdeas[0] ?? "um mimo da casa"}. Posso agendar?"`,
        "", "Dicas: mensagem curta, com o nome da pessoa e uma pergunta no final. Só envie para quem autorizou contato.",
        "Ao criar uma campanha, as mensagens já saem prontas para cada cliente e passam por aprovação antes do envio."].join("\n"));
    }

    if (/oferta|promoc|desconto|brinde|cortesia|incentivo|condicao especial/.test(q)) {
      return done([`Ofertas que costumam funcionar para ${seg.label.toLowerCase()}:`, ...seg.offerIdeas.map((o) => `- ${o}`), "",
        "Para não acostumar o cliente a só voltar com desconto:",
        "- Use a oferta para quem está **inativo** ou **altamente inativo**; para quem está só **em risco**, um lembrete costuma bastar.",
        "- Dê prazo curto (ex.: válido por 7 dias).",
        "- Prefira um extra (cortesia, horário reservado) a baixar o preço.",
        seg.restrictions ? `\nAtenção no seu setor: ${seg.restrictions}` : ""].filter((x) => x !== "").join("\n"));
    }

    if (/criterio|configurac|regra|quantos dias.*(inativ|risco)|quando .*(vira|fica|considera).*(inativ|risco)|como (voce )?(classifica|calcula)/.test(q)) {
      const r = await call("get_settings", {});
      return done([`Critérios atuais (${r.segmento}):`,
        `- **Em risco** a partir de ${r.dias_para_em_risco} dias sem ${seg.vocab.visit}`,
        `- **Inativo** a partir de ${r.dias_para_inativo} dias`,
        `- **Altamente inativo** a partir de ${r.dias_para_altamente_inativo} dias`,
        r.usa_ritmo_individual ? "- Também considero o ritmo de cada cliente: quem vem toda semana entra em risco antes." : "",
        `- Um retorno conta como recuperação se acontecer em até ${r.janela_atribuicao_dias} dias depois do contato`,
        `- Intervalo mínimo entre mensagens para o mesmo cliente: ${r.intervalo_minimo_entre_mensagens_dias} dias (máx. ${r.max_mensagens_30_dias} em 30 dias)`,
        r.exige_aprovacao ? "- Toda campanha precisa de aprovação antes do envio" : "",
        "", "Você pode mudar isso em **Configurações**."].filter(Boolean).join("\n"));
    }

    if (/(dinheiro|receita|grana|faturamento) (parad|perdid|em jogo)|perdendo|deixando de (ganhar|faturar)|quanto (vale|valem)|quanto custa.*(sumi|inativ)|parado/.test(q) && !/(servico|procedimento|tratamento|modalidade|profissional|barbeiro|dentista|professor)/.test(q)) {
      const o = await call("get_overview", {});
      return done([
        `Clientes afastados hoje: **${afastados(o)}**.`,
        `- Se cada um voltasse uma vez, seriam **${brl(o.afastados_soma_ticket_medio_reais as number)}** (soma do ticket médio de cada um).`,
        `- Esses clientes já gastaram **${brl(o.afastados_gasto_historico_reais as number)}** com você no histórico.`,
        `- Projeção realista de recuperação: **${brl(o.projecao_receita_recuperavel_reais as number)}** (estimativa pelas taxas de retorno configuradas, não é faturamento garantido).`,
        `- Afastados com contato autorizado: **${o.afastados_com_contato_autorizado}**: é com eles que dá para começar agora.`,
      ].join("\n"));
    }

    if (/compar|evolu|melhor ou pior|estamos (melhor|pior|indo)|crescend|caindo|mes passado.*(melhor|pior)|tendencia/.test(q)) {
      const r = await call("recovery_diagnosis", {});
      const cur = Number(r.retornos_mes_atual), prev = Number(r.retornos_mesmo_periodo_mes_passado);
      const verdict = cur > prev ? "📈 **Melhor** que no mesmo período do mês passado." : cur < prev ? "📉 **Abaixo** do mesmo período do mês passado." : "➡️ **Igual** ao mesmo período do mês passado.";
      return done([verdict,
        `- Retornos: **${cur}** este mês x ${prev} no mesmo período do mês passado`,
        `- Receita recuperada: **${brl(r.receita_mes_atual_reais as number)}** x ${brl(r.receita_mesmo_periodo_mes_passado_reais as number)}`,
        r.taxa_recuperacao_90_dias ? `- Taxa de recuperação (90 dias): **${r.taxa_recuperacao_90_dias}** (${r.voltaram_90_dias} de ${r.contatados_90_dias} contatados)` : "- Ainda não há envios nos últimos 90 dias para calcular a taxa.",
      ].join("\n"));
    }

    if (/\bmeta\b|objetivo do mes/.test(q)) {
      const r = await call("recovery_diagnosis", {});
      if (!r.meta_mensal) return done(`Você ainda não definiu uma meta mensal. Defina na **Visão geral** (ex.: 10 clientes recuperados por mês).\n\nEste mês até agora: **${r.retornos_mes_atual}** cliente(s) recuperado(s).`);
      const goal = Number(r.meta_mensal), cur = Number(r.retornos_mes_atual);
      return done([`Meta do mês: **${goal}** clientes recuperados.`, `- Até agora: **${cur}** (${Math.min(100, Math.round((cur / goal) * 100))}%)`,
        cur >= goal ? "- Meta batida! 🎉" : `- Faltam **${goal - cur}**. Afastados com contato autorizado: ${r.afastados_com_contato_autorizado}.`].join("\n"));
    }

    if (/pendenc|o que (eu )?(preciso|tenho que|devo) fazer|fazer hoje|tarefas|proximo passo|o que falta|por onde comec/.test(q)) {
      const r = await call("recovery_diagnosis", {});
      const pend = (r.pendencias as Row[]).filter((p) => Number(p.quantidade) > 0);
      if (!pend.length) return done("Nada pendente agora. 👍 Um bom próximo passo: peça _\"Crie uma campanha para os clientes em risco\"_ antes que eles virem inativos.");
      return done(["O que pede sua atenção agora:", ...pend.map((p, i) => `${i + 1}. ${p.descricao}`), "", "Comece pelo primeiro item: ele é o que tem mais chance de trazer cliente de volta rápido."].join("\n"));
    }

    if (/autoriza|consentimento|sem contato|posso (chamar|mandar|enviar|contatar)|descadastr|opt.?out|lgpd/.test(q)) {
      const [o, r] = [await call("get_overview", {}), await call("recovery_diagnosis", {})];
      const total = afastados(o), ok = Number(o.afastados_com_contato_autorizado);
      return done([`Dos **${total}** clientes afastados, **${ok}** autorizaram contato e podem ser chamados agora.`,
        total > ok ? `- **${total - ok}** ainda não têm autorização, ou se descadastraram. Peça a autorização no próximo atendimento ou pelo link de agendamento.` : "",
        "- Quem se descadastra nunca recebe nova mensagem, e cada cliente respeita um intervalo mínimo entre contatos" + (r.intervalo_minimo_entre_mensagens_dias ? ` (${r.intervalo_minimo_entre_mensagens_dias} dias).` : "."),
      ].filter(Boolean).join("\n"));
    }

    if (/(quem|quais clientes|clientes que) (voltou|voltaram|retornou|retornaram)|clientes recuperados|lista.*recuperad/.test(q)) {
      const r = await call("find_customers", { statuses: ["recovered"], sort_by: "total_spent", limit: 15 });
      return done(listCustomers(`**${r.total_encontrado}** clientes voltaram depois de um contato:`, r.clientes as Row[]));
    }

    if (/campanha/.test(q) && /(aguardando|esperando|pendente|para aprovar|aprova|rascunho)/.test(q)) {
      const list = ((await call("campaign_performance", {})) as unknown as Row[]).filter((c) => c.status === "pending_approval" || c.status === "draft");
      if (!list.length) return done("Nenhuma campanha esperando aprovação ou em rascunho.");
      return done(["Campanhas esperando você:", ...list.map((c) => `- **${c.nome}** (${c.canal}) · ${CAMPAIGN_STATUS[String(c.status)] ?? c.status} · ${c.publico} cliente(s)`), "", "Abra em **Campanhas**, revise as mensagens e aprove. Nada é enviado antes disso."].join("\n"));
    }

    if (/(quais|minhas|lista|todas as|ver) campanhas|campanhas (ativas|em andamento|criadas)/.test(q) && !/melhor|resultado|desempenho/.test(q)) {
      const list = (await call("campaign_performance", {})) as unknown as Row[];
      if (!list.length) return done("Ainda não há campanhas. Peça: _\"Crie uma campanha para os clientes inativos\"_.");
      return done(["Suas campanhas mais recentes:", ...list.slice(0, 10).map((c) => `- **${c.nome}** (${c.canal}) · ${CAMPAIGN_STATUS[String(c.status)] ?? c.status} · ${c.enviadas} enviadas, ${c.retornaram} retornos`)].join("\n"));
    }

    if (/(qual|quais|por|em que|em qual) (servico|procedimento|tratamento|modalidade|prato|peca)/.test(q) || /(servico|procedimento|tratamento|modalidade).*(perd|afast|inativ)/.test(q)) {
      const r = await call("analyze_patterns", {});
      return done(patternBlock(`Afastamento por ${seg.vocab.service}:`, r.por_servico as Row[]));
    }

    if (/(qual|quais|por|cada) (profissional|barbeiro|dentista|professor|mecanico|vendedor|atendente|tosador|funcionario|equipe)/.test(q)) {
      const r = await call("analyze_patterns", {});
      return done(patternBlock(`Afastamento por ${seg.vocab.staff}:`, r.por_profissional as Row[]));
    }

    if (Number.isFinite(ticketMin) || big) {
      const r = await call("find_customers", {
        ...(lapsedWord ? { statuses: LAPSED } : {}),
        ...(Number.isFinite(ticketMin) ? { min_avg_ticket_reais: ticketMin } : {}),
        ...(Number.isFinite(days) ? { min_days_inactive: days } : {}),
        sort_by: /ticket/.test(q) ? "avg_ticket" : "total_spent", limit: 15,
      });
      const head = lapsedWord ? `Clientes de maior valor que estão afastados (**${r.total_encontrado}**):` : `Clientes de maior valor (**${r.total_encontrado}** no critério):`;
      return done(listCustomers(head, r.clientes as Row[]) + (lapsedWord && Number(r.total_encontrado) ? "\n\nEsses valem uma campanha própria: peça _\"Crie uma campanha para os clientes que mais gastavam\"_." : ""));
    }

    if (/(clientes )?ativos\b|quem (esta|ta) (vindo|em dia)|em dia/.test(q) && !lapsedWord) {
      const r = await call("find_customers", { statuses: ["active"], sort_by: "visits", limit: 10 });
      return done(listCustomers(`**${r.total_encontrado}** clientes estão ativos (vindo no ritmo normal). Os mais frequentes:`, r.clientes as Row[]));
    }

    if (/(frequen|mais (compram|vem|visitam)|fieis|fiel|assiduo)/.test(q) && !/(cri|mont|ger).*campanha/.test(q)) {
      const r = await call("find_customers", { sort_by: "visits", limit: 10 });
      return done(listCustomers("Clientes que mais frequentam (por número de visitas):", r.clientes as Row[]));
    }

    if (/mais tempo sem|ha mais tempo|mais antigos sem|nao retorna(m)? ha mais/.test(q) && !Number.isFinite(days)) {
      const r = await call("find_customers", { statuses: ["at_risk", "inactive", "highly_inactive"], sort_by: "days_inactive", limit: 10 });
      return done(listCustomers(`Afastados há mais tempo (de ${r.total_encontrado}):`, r.clientes as Row[]));
    }

    if (/receita|faturamento|recuperamos|conseguimos recuperar|recuperad/.test(q) && !/potencial/.test(q)) {
      const period = /mes passado|ultimo mes/.test(q) ? "last_month" : /30 dias/.test(q) ? "last_30_days" : /90 dias|trimestre/.test(q) ? "last_90_days" : /total|sempre|ate hoje/.test(q) ? "all_time" : "this_month";
      const r = await call("recovered_revenue", { period });
      const p = r.periodo as Row;
      return done([
        `Entre ${p.de} e ${p.ate}: **${r.clientes_recuperados}** clientes voltaram após uma campanha, somando **${brl(r.receita_recuperada_reais as number)}** em receita registrada.`,
        Number(r.clientes_recuperados) > Number(r.recuperacoes_com_valor_informado)
          ? `- ${Number(r.clientes_recuperados) - Number(r.recuperacoes_com_valor_informado)} retorno(s) sem valor informado — registre o valor da visita para medir a receita completa.` : "",
      ].filter(Boolean).join("\n"));
    }

    if (/campanha/.test(q) && /(melhor|resultado|desempenho|performance|funcion)/.test(q)) {
      const list = (await call("campaign_performance", {})) as unknown as Row[];
      if (!list.length) return done("Ainda não há campanhas. Peça: _\"Crie uma campanha para os clientes inativos\"_.");
      const ranked = [...list].sort((a, b) => Number(b.retornaram) - Number(a.retornaram) || Number(b.respostas) - Number(a.respostas));
      return done(["Campanhas por clientes que retornaram:", ...ranked.slice(0, 5).map((c) =>
        `- **${c.nome}** (${c.canal}): ${c.enviadas} enviadas, ${c.respostas} respostas, **${c.retornaram} retornos**, ${brl(c.receita_atribuida_reais as number)} — taxa ${c.taxa_recuperacao}`)].join("\n"));
    }

    if (/padr|por que|motivo|onde.*(perd|concentr)/.test(q)) {
      const r = await call("analyze_patterns", {});
      const top = (rows: Row[]) => rows.filter((x) => Number(x.total) >= 3).sort((a, b) => parseFloat(String(b.taxa_afastamento)) - parseFloat(String(a.taxa_afastamento))).slice(0, 3)
        .map((x) => `  - ${x.grupo}: ${x.taxa_afastamento} afastados (${x.afastados}/${x.total})`);
      return done(["Onde a inatividade se concentra:", "- Por serviço:", ...top(r.por_servico as Row[]), "- Por profissional:", ...top(r.por_profissional as Row[]), "- Por fidelidade:", ...top(r.por_fidelidade as Row[])].join("\n"));
    }

    if (/potencial|prioridade|priorizar|chance|mais vale|primeiro|comecar por/.test(q)) {
      const r = await call("find_customers", { statuses: ["at_risk", "inactive", "highly_inactive"], sort_by: "priority", limit: 10 });
      return done(listCustomers(`Clientes afastados com maior potencial de retorno (de ${r.total_encontrado}):`, r.clientes as Row[]));
    }

    if (Number.isFinite(days) || /inativ|nao aparece|sumi|sem visit|em risco/.test(q)) {
      const r = await call("find_customers", {
        ...(Number.isFinite(days) ? { min_days_inactive: days } : { statuses: statusesFrom() }),
        ...(maxDays ? { max_days_inactive: maxDays } : {}),
        sort_by: "priority", limit: 15,
      });
      const head = maxDays ? `**${r.total_encontrado}** clientes estão entre ${days} e ${maxDays} dias sem ${seg.vocab.visit}.`
        : Number.isFinite(days) ? `**${r.total_encontrado}** clientes estão há mais de ${days} dias sem ${seg.vocab.visit}.` : `**${r.total_encontrado}** clientes encontrados.`;
      return done(listCustomers(head, r.clientes as Row[]));
    }

    if (/resumo|visao geral|situacao|como esta|panorama|quantos/.test(q)) {
      const o = await call("get_overview", {});
      const st = o.por_status as Record<string, number>;
      return done([
        `Base com **${o.total_clientes}** clientes:`,
        ...Object.entries(st).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`),
        `- Projeção de receita recuperável: **${brl(o.projecao_receita_recuperavel_reais as number)}** (estimativa, não faturamento garantido)`,
        `- Recuperados no mês: ${o.recuperados_no_mes} · receita registrada: ${brl(o.receita_recuperada_no_mes_reais as number)}`,
      ].join("\n"));
    }
  } catch (e) {
    return done(`Não consegui concluir: ${e instanceof Error ? e.message : "erro"}.`);
  }

  return done(["Ainda não entendi essa. Sem a IA generativa ligada, eu respondo perguntas sobre estes temas:",
    ...BASIC_EXAMPLE_GROUPS.flatMap((g) => [`\n**${g.title}**`, ...g.items.slice(0, 4).map((e) => `- ${e}`)]),
    "", "Escolha uma delas ou pergunte com outras palavras."].join("\n"));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const afastados = (o: Row) => {
  const st = o.por_status as Record<string, number>;
  return (st["Em risco"] ?? 0) + (st["Inativo"] ?? 0) + (st["Altamente inativo"] ?? 0);
};
function patternBlock(head: string, rows: Row[]) {
  const list = rows.filter((x) => Number(x.total) >= 3).sort((a, b) => parseFloat(String(b.taxa_afastamento)) - parseFloat(String(a.taxa_afastamento)));
  if (!list.length) return `${head}\n\nAinda não há dados suficientes (preciso de pelo menos 3 clientes por grupo).`;
  return [head, ...list.slice(0, 6).map((x) => `- **${x.grupo}**: ${x.taxa_afastamento} afastados (${x.afastados} de ${x.total})`), "",
    `O grupo do topo é onde vale olhar primeiro: atendimento, preço ou horário podem estar afastando clientes.`].join("\n");
}

function listCustomers(head: string, rows: Row[]) {
  if (!rows.length) return `${head}\n\nNenhum cliente nesse critério.`;
  return [head, ...rows.map((c) =>
    `- **${c.nome}** — ${c.status}, ${c.dias_sem_visita ?? "?"} dias, ${c.visitas} visitas, ticket ${brl(c.ticket_medio_reais as number)}, potencial **${c.potencial_retorno}**${(c.canais_autorizados as string[]).length ? "" : " · sem contato autorizado"}`),
  ].join("\n");
}
