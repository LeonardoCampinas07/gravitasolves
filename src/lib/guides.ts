/** Textos de ajuda exibidos em cada tela ("Como funciona esta tela"). Centralizados para manter o tom consistente. */
export interface Guide { title: string; steps: string[]; tip?: string; link?: { href: string; label: string } }

export const GUIDES: Record<string, Guide> = {
  "visao-geral": {
    title: "Como ler o painel",
    steps: [
      "Os números do topo mostram quantos clientes você tem e quantos estão em risco ou inativos.",
      "O cartão escuro estima quanto dá para recuperar se parte dos clientes afastados voltar (é uma projeção, não uma promessa).",
      "Siga o “Comece por aqui” para deixar tudo configurado em poucos minutos.",
      "Clique em “Ver prioridades” para saber quem contatar primeiro.",
    ],
    link: { href: "/ajuda", label: "Abrir a central de ajuda" },
  },
  agenda: {
    title: "Como usar a agenda",
    steps: [
      "Atendeu alguém? Preencha o Registro rápido: o cliente é criado ou atualizado na hora.",
      "Pedidos feitos pelo seu link de agendamento aparecem em “Pedidos de horário”.",
      "Use “Combinar” para responder pelo WhatsApp e “Atendido” quando o cliente vier.",
      "Cada atendimento registrado mantém a base atualizada e mostra quem voltou por causa de uma campanha.",
    ],
    tip: "Salve esta página na tela inicial do celular para registrar atendimentos em segundos.",
  },
  clientes: {
    title: "Sua base de clientes",
    steps: [
      "Use as abas (Ativo, Em risco, Inativo…) para filtrar e a busca para achar alguém pelo nome ou telefone.",
      "Clique no nome para ver o histórico, as mensagens e as autorizações de contato.",
      "“Última atividade” é a última visita ou conversa no WhatsApp — o que for mais recente.",
      "Faltam clientes? Use “Conectar fontes” para trazê-los da agenda, do WhatsApp ou do celular.",
    ],
  },
  inativos: {
    title: "Central de recuperação",
    steps: [
      "Siga o fluxo do topo: identificar → entender → mensagem → aprovar → acompanhar.",
      "Use as abas: “Prioritários” reúne quem tem potencial 70+; “Recuperados” mostra quem já voltou.",
      "A coluna “Por que está aqui” explica cada caso com os dados reais (ex.: voltava a cada 15 dias, está há 40).",
      "“Próximo passo” diz o que fazer: convidar, oferecer motivo para voltar, pedir autorização ou aguardar.",
      "“Campanha para este grupo” prepara as mensagens; nada é enviado sem a sua aprovação.",
    ],
    tip: "Os prazos (ex.: 15/30/60 dias) podem ser ajustados em Configurações.",
  },
  fontes: {
    title: "Como conectar seus clientes",
    steps: [
      "Escolha a opção que mais parece com o seu dia a dia — mostramos primeiro as mais fáceis para você.",
      "Pode usar várias ao mesmo tempo: o GravitaSolves junta tudo pelo telefone, sem duplicar.",
      "Não sabe por onde começar? Ative o link de agendamento e registre os atendimentos na Agenda.",
    ],
    tip: "Quer só testar? Use a planilha de exemplo ou exporte algumas conversas do seu próprio WhatsApp.",
  },
  agente: {
    title: "Como conversar com o agente",
    steps: [
      "Pergunte em português, como falaria com uma pessoa: “quem sumiu este mês?”, “quem devo chamar primeiro?”.",
      "Ele responde com os números reais da sua base.",
      "Peça uma campanha e ele cria um rascunho — nada é enviado sem a sua aprovação.",
    ],
    tip: "Comece clicando em uma das perguntas sugeridas.",
  },
  campanhas: {
    title: "Como funciona uma campanha",
    steps: [
      "Crie em “Nova campanha” ou peça ao agente. Ela nasce como rascunho.",
      "Revise as mensagens e clique em “Enviar para aprovação”; um administrador aprova.",
      "Envie pelo WhatsApp oficial (automático) ou pelo envio assistido (abre a conversa pronta).",
      "Quando o cliente voltar, registre a visita: o retorno é contado em Resultados.",
    ],
    tip: "Clientes sem autorização, descadastrados ou contatados há pouco tempo ficam de fora automaticamente.",
  },
  campanha: {
    title: "Passo a passo desta campanha",
    steps: [
      "Revise as variações de mensagem — você pode editar o texto à vontade.",
      "Clique em “Enviar para aprovação” e depois em “Aprovar”.",
      "Sem WhatsApp conectado, use “Abrir no WhatsApp” em cada cliente e depois “Marcar enviada”.",
      "Quando o cliente voltar, registre a visita na ficha dele ou na Agenda.",
    ],
  },
  automacoes: {
    title: "Automações",
    steps: [
      "Uma automação prepara uma campanha sozinha quando alguém muda de status (ex.: entrou em risco).",
      "Ela roda uma vez por dia e, por padrão, espera a sua aprovação antes de enviar.",
    ],
  },
  resultados: {
    title: "Como ler os resultados",
    steps: [
      "Escolha o período (30 dias, 90 dias ou 12 meses): cada número mostra a variação contra o período anterior.",
      "Recuperado é quem voltou até 30 dias depois de receber uma mensagem de campanha.",
      "Receita confirmada soma os valores registrados nas visitas; potencial é só uma projeção.",
      "Use o ranking para repetir as campanhas que funcionaram e baixe o CSV para planilhas.",
    ],
    tip: "Registre o valor de cada atendimento para medir a receita com precisão.",
  },
  integracoes: {
    title: "Integrações",
    steps: [
      "Conecte o WhatsApp Business oficial, e-mail ou SMS para enviar campanhas automaticamente.",
      "Sem integração, tudo funciona com o envio assistido pelo seu próprio WhatsApp.",
      "A chave de API permite que o seu sistema de agenda envie as visitas sozinho.",
    ],
  },
  configuracoes: {
    title: "Configurações",
    steps: [
      "Ajuste em quantos dias um cliente fica “em risco” e “inativo” para o ritmo do seu negócio.",
      "Defina limites de contato (para ninguém receber mensagens demais) e quem da equipe pode aprovar.",
      "Em Privacidade você exporta ou exclui dados e gerencia a lista de bloqueio.",
    ],
  },
};

/** Explicação curta de cada status (tooltips e central de ajuda). */
export const STATUS_HELP: Record<string, string> = {
  active: "Veio dentro do intervalo normal.",
  at_risk: "Passou do intervalo normal — melhor momento para chamar de volta.",
  inactive: "Está sem vir há bastante tempo e já quebrou o hábito.",
  highly_inactive: "Afastado há muito tempo. Retorno menos provável.",
  recovered: "Voltou depois de receber uma campanha.",
  unknown: "Ainda não há data de visita ou conversa.",
};
