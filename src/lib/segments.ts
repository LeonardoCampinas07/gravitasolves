/**
 * Presets por segmento. Para adicionar um segmento, inclua um objeto em SEGMENTS —
 * nenhuma outra parte do sistema precisa mudar.
 */
export interface Segment {
  id: string;
  label: string;
  icon: string; // nome do ícone Lucide
  thresholds: { atRiskDays: number; inactiveDays: number; highlyInactiveDays: number };
  vocab: { visit: string; visits: string; staff: string; service: string };
  /** Contexto que o agente de IA considera ao analisar e escrever. */
  aiContext: string;
  /** Ganchos de retorno usados nos modelos de mensagem sem IA. */
  hooks: string[];
  offerIdeas: string[];
  /** Restrições de comunicação do setor. */
  restrictions?: string;
  defaultTone: string;
}

export const SEGMENTS: Segment[] = [
  {
    id: "barbershop", label: "Barbearia", icon: "Scissors",
    thresholds: { atRiskDays: 15, inactiveDays: 30, highlyInactiveDays: 60 },
    vocab: { visit: "corte", visits: "cortes", staff: "barbeiro", service: "serviço" },
    aiContext: "Clientes costumam cortar a cada 2 a 4 semanas. Considere o barbeiro preferido, o serviço mais feito (corte, barba, combo) e a regularidade. Tom descontraído e direto.",
    hooks: ["que tal dar aquele trato no visual esta semana?", "a cadeira está te esperando para renovar o corte.", "bora deixar o visual em dia de novo?"],
    offerIdeas: ["barba de cortesia no próximo corte", "horário reservado com o barbeiro preferido", "combo corte + barba com condição especial"],
    defaultTone: "descontraído",
  },
  {
    id: "beauty_salon", label: "Salão de beleza", icon: "Sparkles",
    thresholds: { atRiskDays: 30, inactiveDays: 45, highlyInactiveDays: 90 },
    vocab: { visit: "atendimento", visits: "atendimentos", staff: "profissional", service: "procedimento" },
    aiContext: "Ciclos variam por procedimento (escova, coloração 4–6 semanas, manicure 1–2 semanas). Valorize a profissional preferida e o último procedimento.",
    hooks: ["que tal reservar um momento para você esta semana?", "temos horários para cuidar de você do jeitinho que gosta.", "já está na hora de renovar o seu cuidado?"],
    offerIdeas: ["hidratação de cortesia", "horário preferencial com sua profissional", "condição especial no procedimento favorito"],
    defaultTone: "acolhedor",
  },
  {
    id: "dental", label: "Clínica odontológica", icon: "Stethoscope",
    thresholds: { atRiskDays: 180, inactiveDays: 270, highlyInactiveDays: 365 },
    vocab: { visit: "consulta", visits: "consultas", staff: "dentista", service: "tratamento" },
    aiContext: "Retornos de revisão costumam ser semestrais. Priorize pacientes com tratamento em andamento. Comunicação de saúde: cuidado e acompanhamento, nunca pressão comercial.",
    hooks: ["podemos ajudar a organizar sua próxima consulta de acompanhamento.", "a revisão periódica ajuda a manter tudo em dia — conte com a gente.", "se quiser, encontramos um horário que caiba na sua rotina."],
    offerIdeas: ["facilidade no agendamento da revisão", "lembrete de acompanhamento do tratamento"],
    restrictions: "O Código de Ética Odontológica (CFO) veda anunciar descontos, preços e promoções. Não ofereça vantagens financeiras; foque em cuidado e agendamento.",
    defaultTone: "profissional e cuidadoso",
  },
  {
    id: "aesthetics", label: "Clínica de estética", icon: "Flower2",
    thresholds: { atRiskDays: 30, inactiveDays: 60, highlyInactiveDays: 120 },
    vocab: { visit: "sessão", visits: "sessões", staff: "profissional", service: "protocolo" },
    aiContext: "Protocolos têm sessões sequenciais; interrupção compromete resultado. Destaque continuidade do protocolo e bem-estar. Evite promessas de resultado.",
    hooks: ["que tal retomar seu protocolo para manter os resultados?", "temos horários para dar continuidade ao seu cuidado.", "sentimos sua falta por aqui — vamos retomar?"],
    offerIdeas: ["avaliação de retorno sem custo", "sessão de manutenção com condição especial"],
    restrictions: "Não prometa resultados estéticos. Se houver procedimento médico, siga as regras de publicidade do CFM.",
    defaultTone: "acolhedor",
  },
  {
    id: "gym", label: "Academia", icon: "Dumbbell",
    thresholds: { atRiskDays: 7, inactiveDays: 15, highlyInactiveDays: 30 },
    vocab: { visit: "treino", visits: "treinos", staff: "professor", service: "modalidade" },
    aiContext: "A frequência semanal é o principal sinal de cancelamento. Aluno que some 1–2 semanas está em risco. Tom motivador, sem culpa.",
    hooks: ["bora retomar o ritmo esta semana? Um treino já faz diferença.", "seu lugar no treino continua garantido.", "que tal voltar com um treino leve para reengatar?"],
    offerIdeas: ["avaliação física de retorno", "aula experimental de uma nova modalidade", "acompanhamento do professor na primeira semana"],
    defaultTone: "motivador",
  },
  {
    id: "restaurant", label: "Restaurante", icon: "UtensilsCrossed",
    thresholds: { atRiskDays: 15, inactiveDays: 30, highlyInactiveDays: 60 },
    vocab: { visit: "pedido", visits: "pedidos", staff: "equipe", service: "prato" },
    aiContext: "Analise frequência de pedidos e prato favorito. Novidades do cardápio e conveniência funcionam bem.",
    hooks: ["que tal matar a saudade do seu prato favorito?", "temos novidades no cardápio que combinam com você.", "a mesa está pronta para te receber de novo."],
    offerIdeas: ["sobremesa de cortesia", "frete grátis no próximo pedido", "prato favorito com condição especial"],
    defaultTone: "caloroso",
  },
  {
    id: "clothing", label: "Loja de roupas", icon: "Shirt",
    thresholds: { atRiskDays: 45, inactiveDays: 90, highlyInactiveDays: 180 },
    vocab: { visit: "compra", visits: "compras", staff: "vendedor(a)", service: "peça" },
    aiContext: "Recorrência acompanha coleções e estações. Use preferências de estilo e categoria mais comprada.",
    hooks: ["chegaram novidades que combinam com o seu estilo.", "separamos peças da nova coleção que têm a sua cara.", "que tal passar para conhecer a coleção nova?"],
    offerIdeas: ["provador reservado com peças separadas", "condição especial na nova coleção", "brinde na próxima compra"],
    defaultTone: "próximo e estiloso",
  },
  {
    id: "auto_repair", label: "Oficina mecânica", icon: "Wrench",
    thresholds: { atRiskDays: 120, inactiveDays: 180, highlyInactiveDays: 365 },
    vocab: { visit: "serviço", visits: "serviços", staff: "mecânico", service: "serviço" },
    aiContext: "Revisões e trocas de óleo seguem quilometragem/tempo (6 a 12 meses). Lembretes preventivos e segurança funcionam melhor que promoções.",
    hooks: ["já está na hora da revisão preventiva do seu veículo?", "uma checagem rápida evita surpresas na estrada.", "podemos agendar a manutenção no melhor horário para você."],
    offerIdeas: ["check-up de itens de segurança sem custo", "condição especial na troca de óleo"],
    defaultTone: "confiável",
  },
  {
    id: "pet_shop", label: "Pet shop", icon: "PawPrint",
    thresholds: { atRiskDays: 20, inactiveDays: 40, highlyInactiveDays: 80 },
    vocab: { visit: "atendimento", visits: "atendimentos", staff: "tosador(a)", service: "serviço" },
    aiContext: "Banho e tosa costumam ser quinzenais ou mensais; ração tem ciclo de recompra. Fale do pet com carinho.",
    hooks: ["que tal um banho caprichado para o seu pet esta semana?", "estamos com saudade do seu companheiro por aqui.", "temos horários para deixar seu pet cheiroso de novo."],
    offerIdeas: ["hidratação de pelos de cortesia", "lembrete de recompra de ração", "leva-e-traz com condição especial"],
    defaultTone: "carinhoso",
  },
  {
    id: "generic", label: "Outro / comércio em geral", icon: "Store",
    thresholds: { atRiskDays: 30, inactiveDays: 60, highlyInactiveDays: 120 },
    vocab: { visit: "visita", visits: "visitas", staff: "atendente", service: "serviço" },
    aiContext: "Use a frequência histórica do próprio cliente como referência de ciclo.",
    hooks: ["que tal passar para nos ver esta semana?", "temos novidades que podem te interessar.", "vai ser um prazer receber você de novo."],
    offerIdeas: ["condição especial no próximo atendimento", "brinde na próxima visita"],
    defaultTone: "acolhedor",
  },
];

export function getSegment(id: string | null | undefined): Segment {
  return SEGMENTS.find((s) => s.id === id) ?? SEGMENTS[SEGMENTS.length - 1];
}
