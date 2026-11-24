# Regras de negócio

## Classificação (`src/lib/classification.ts`)

Cada empresa tem três limites em dias sem visita (padrão do segmento, editáveis):

| Status | Regra |
|---|---|
| Ativo | dias < em risco |
| Em risco | dias ≥ em risco |
| Inativo | dias ≥ inativo |
| Altamente inativo | dias ≥ altamente inativo |
| Recuperado | voltou após uma campanha e está há menos de `recoveredHoldDays` (30) do retorno |
| Sem dados | sem data de última visita |

**Ritmo individual** (opcional, ligado por padrão): com 3+ visitas e data da primeira visita,
calcula-se o intervalo médio do cliente. Os limites são multiplicados por
`(intervalo × 1,5) ÷ limite_em_risco`, limitado entre 0,5× e 2×. Quem vem toda semana entra em
risco antes de quem vem todo mês.

A reclassificação roda na importação, ao salvar critérios, ao registrar visitas e no job diário.

Padrões por segmento (`src/lib/segments.ts`) — para adicionar um segmento basta incluir um objeto:

| Segmento | Em risco / Inativo / Altamente inativo |
|---|---|
| Barbearia | 15 / 30 / 60 |
| Salão de beleza | 30 / 45 / 90 |
| Clínica odontológica | 180 / 270 / 365 |
| Clínica de estética | 30 / 60 / 120 |
| Academia | 7 / 15 / 30 |
| Restaurante | 15 / 30 / 60 |
| Loja de roupas | 45 / 90 / 180 |
| Oficina mecânica | 120 / 180 / 365 |
| Pet shop | 20 / 40 / 80 |
| Outro | 30 / 60 / 120 |

## Potencial de retorno (score 0–100)

Só para clientes afastados (em risco, inativo, altamente inativo):

- 35% valor: ticket médio ÷ (2 × mediana da base), limitado a 1
- 25% fidelidade: log(1 + visitas) ÷ log(21)
- 30% recência: cai linearmente do limite "em risco" até 2× o limite "altamente inativo"
- 10% contato: tem algum canal autorizado

## Projeção de receita recuperável

`Σ ticket médio × probabilidade de retorno do status` — premissas padrão 30% (em risco),
15% (inativo), 6% (altamente inativo), editáveis por empresa em `settings.returnProbability`.
Sempre exibida como **projeção**, nunca como faturamento.

## Receita recuperada (real) e atribuição

Uma visita (registrada na tela, via API ou detectada numa reimportação em que a data da última
visita avançou) é **atribuída** à mensagem de campanha mais recente enviada ao cliente nos
`attributionWindowDays` (30) anteriores. Cada mensagem gera no máximo uma recuperação.
A receita só entra quando o valor é informado — retornos sem valor contam como recuperação com
R$ 0 e a interface avisa.

## Compliance de contato (`src/lib/campaigns/compliance.ts`)

Aplicado a cada cliente na criação da campanha **e de novo no momento do envio**:

1. Cliente de demonstração → nunca envia
2. Descadastrado → nunca envia
3. Telefone/e-mail na lista de bloqueio → nunca envia
4. Sem endereço para o canal → não envia
5. Sem autorização do canal → não envia (WhatsApp/SMS exigem consentimento; e-mail aceita legítimo
   interesse apenas se a empresa habilitar e o cliente estiver marcado com essa base)
6. Mensagem recebida há menos de `frequencyCapDays` (14) → não envia
7. `maxMessagesPer30Days` (2) atingido → não envia

Toda mensagem de WhatsApp/SMS recebe "Para não receber mais mensagens, responda SAIR."; e-mails
recebem link de descadastro e cabeçalho `List-Unsubscribe`. Respostas como SAIR, PARAR, STOP são
detectadas pelos webhooks e revogam todos os consentimentos.

Avisos de conteúdo (não bloqueiam): oferta/desconto em clínica odontológica (Código de Ética do
CFO), promessa de resultado em estética, texto todo em maiúsculas, excesso de exclamações, SMS longo.

## Ciclo de vida da campanha

`rascunho → aguardando aprovação → aprovada → em envio → concluída` (ou cancelada).
Editar mensagens volta para rascunho. Aprovação exige papel admin/owner e **uma pessoa** — o agente
e as automações não aprovam (exceto automação explicitamente configurada sem aprovação por um admin).

Envio: pelo adaptador do canal conectado (lotes de até 200, limitado pela cota do plano) ou
**envio assistido** — a equipe abre o link wa.me com a mensagem pronta e marca como enviada.

## Geração de mensagens

- **Com IA**: Claude recebe o perfil agregado do grupo (quantidade, status, afastamento médio, ticket,
  serviços e profissionais mais comuns, segmento, restrições do setor) — nunca dados individuais — e
  devolve 3 variações + estratégia, via saída estruturada.
- **Sem IA**: modelos por segmento combinando aberturas por status, ganchos do segmento e fechamentos.
- Variáveis `{nome} {estabelecimento} {oferta} {servico} {profissional}`; frases com variável vazia são
  removidas. Variações são distribuídas entre os clientes para não repetir o mesmo texto.

## Agente (`src/lib/ai/`)

Ferramentas: `get_overview`, `find_customers`, `analyze_patterns`, `create_campaign_draft`,
`campaign_performance`, `recovered_revenue`, `get_settings`. Todas filtram pela empresa da sessão e
respeitam o papel do usuário. O agente não envia mensagens nem aprova campanhas.

O modelo recebe nomes abreviados ("João S.") e métricas; telefone e e-mail não saem da plataforma.
A conversa é reenviada à API exatamente como foi trocada (inclui blocos de raciocínio e ferramentas);
após 30 turnos inicia-se uma nova conversa. Cada pergunta consome 1 da cota mensal de IA do plano;
esgotada a cota, o agente responde em modo básico.

## Automações

Regra: "quando cliente virar X → preparar campanha no canal Y". O job diário reclassifica a base,
coleta as transições do dia e cria uma campanha por regra com exatamente esses clientes. Com
aprovação exigida (padrão), a campanha aguarda revisão; sem aprovação, é disparada se o canal estiver
conectado — compliance sempre aplicado.
