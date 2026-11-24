/** Perguntas prontas do agente (modo básico), usadas no servidor e na tela do agente. */
/** Por tema. Todas são respondidas pelo modo básico com os dados reais da empresa. */
export const BASIC_EXAMPLE_GROUPS: { title: string; items: string[] }[] = [
  { title: "Visão do negócio", items: [
    "Me dá um resumo da minha base de clientes.",
    "Quanto dinheiro está parado com clientes que sumiram?",
    "Estamos melhor ou pior que no mês passado?",
    "O que eu preciso fazer hoje?",
    "Como está a minha meta do mês?",
  ] },
  { title: "Clientes", items: [
    "Encontre todos os clientes que não aparecem há mais de 30 dias.",
    "Quais clientes estão em risco de parar de vir?",
    "Quais clientes devo tentar recuperar primeiro?",
    "Quais clientes estão há mais tempo sem retornar?",
    "Quem são os clientes que mais gastam?",
    "Quais clientes que gastavam mais pararam de vir?",
    "Quais clientes costumam comprar com maior frequência?",
    "Quais clientes voltaram depois de uma campanha?",
    "Quantos clientes estão ativos?",
    "Clientes com ticket acima de R$ 100 que estão inativos.",
    "Clientes entre 30 e 60 dias sem visita.",
  ] },
  { title: "Campanhas e resultados", items: [
    "Quais campanhas tiveram melhores resultados?",
    "Tem campanha esperando aprovação?",
    "Quanto conseguimos recuperar em receita neste mês?",
    "Quanto recuperamos no mês passado?",
    "Quanto já recuperamos no total?",
    "Crie uma campanha para recuperar os clientes inativos deste mês.",
    "Crie uma campanha para clientes que não retornam há 60 dias.",
    "Crie uma campanha por e-mail para os clientes em risco.",
    "Crie uma campanha para os clientes que mais gastavam.",
  ] },
  { title: "Análises e dicas", items: [
    "Quais padrões de inatividade você encontrou?",
    "Em qual serviço eu mais perco clientes?",
    "Qual profissional tem mais clientes afastados?",
    "O que posso fazer para melhorar minha taxa de recuperação?",
    "Quantos clientes eu posso chamar no WhatsApp?",
    "Escreva uma mensagem para chamar um cliente sumido.",
    "Que oferta posso dar para trazer o cliente de volta?",
    "Quais são os critérios para um cliente virar inativo?",
  ] },
];
export const BASIC_EXAMPLES = BASIC_EXAMPLE_GROUPS.flatMap((g) => g.items);
