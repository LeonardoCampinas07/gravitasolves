# 10 — Evolução do produto (23/11/2026)

O app não foi recriado. Antes de qualquer alteração foi feito backup completo em `C:\projetos\_backups\gravita-pre-evolucao-20261123.tgz`. O que mudou:

- banco de dados: nenhuma migração, nenhuma tabela nova;
- preços e planos: não alterados;
- integrações: nenhuma nova;
- custo de IA: nenhum novo, porque tudo o que foi adicionado é determinístico e calculado com SQL sobre os dados reais da empresa.

## 1. Como estava antes

O app já tinha:

- painel com números e "Próximas ações";
- CRM com etiquetas, notas, filtros, exportação de seleção em CSV e exportação LGPD;
- tela "Clientes inativos" com grupos, gráficos de padrão e potencial de 0 a 100;
- campanhas com aprovação, automações, agenda e link de agendamento;
- agente de IA (com Claude ou em modo básico), equipe com 4 papéis e cobrança Asaas em sandbox;
- simulação "Barbearia Exemplo";
- onboarding em 7 passos, tour de boas-vindas, guia "Como usar esta tela?" em 10 telas e central de ajuda;
- 108 testes passando.

## 2. Problemas encontrados

| # | Problema | Impacto |
|---|---|---|
| P1 | A lista de inativos mostrava *quem*, mas não *por que* nem *o que fazer agora*. | O dono precisava interpretar sozinho. |
| P2 | Resultados não comparava períodos, não separava receita confirmada da projeção e não exportava relatório. | Era difícil provar o valor do produto, o que pesa na retenção. |
| P3 | O painel mostrava números, mas não leituras do tipo "12 clientes mensais sumiram há mais de 45 dias". | O app soava menos como consultor. |
| P4 | Não havia resumo do mês que mostrasse ao dono o que o produto entregou. | Retenção. |
| P5 | A ajuda só existia como página separada: sem busca e sem ajuda dentro da tela em que o usuário está. | Mais dúvidas, maior tempo até o primeiro valor. |
| P6 | O nome "Clientes inativos" no menu escondia que ali é onde a recuperação acontece. | Navegação. |
| P7 | Configurações não tinha âncora para a seção da Equipe, então os links de ajuda não chegavam nela. | Pequeno. |

## 3. Páginas melhoradas

- **Central de recuperação** (`/inativos`, que antes era "Clientes inativos"):
  - abas Todos afastados, Prioritários (potencial 70 ou mais), Em risco, Inativo, Muito tempo e Recuperados;
  - faixa de fluxo clicável: identificar → entender → mensagem → aprovar → acompanhar;
  - novas colunas na tabela: **"Por que está aqui"** e **"Próximo passo"**;
  - estado vazio próprio em cada aba;
  - grupos e gráficos que já existiam foram mantidos.
- **Resultados** (`/resultados`):
  - seletor de período: 30 dias, 90 dias ou 12 meses, com variação contra o período anterior;
  - cartão **"Receita confirmada x potencial"**, com aviso quando há retornos sem valor registrado;
  - evolução mensal;
  - quebra por canal e por serviço;
  - ranking de campanhas;
  - botões de CSV;
  - estado vazio com link para criar a primeira campanha.
- **Visão geral**:
  - cartão "Inteligência da sua base", com até 5 leituras, cada uma com número real e link para agir;
  - cartão "Resumo do mês".
- **Central de ajuda** (`/ajuda`): busca na base de conhecimento. As perguntas frequentes agora vêm de uma fonte única.
- **Menu**: "Clientes inativos" passou a se chamar "Recuperação". O tour e a ajuda foram atualizados.
- **Guias de tela**: os textos de Recuperação e Resultados foram reescritos para o novo fluxo.

## 4. O que foi corrigido

- P1 a P7, acima.
- Telefone no CSV: o "+" inicial era prefixado com apóstrofo pela proteção contra fórmulas do Excel. Agora o telefone sai sem o "+".
- Exportações na simulação: antes funcionavam e gravavam um registro de auditoria na empresa de exemplo. Agora a simulação recusa a exportação com 403 e mantém o modo somente leitura.

## 5. Funcionalidades novas

| Funcionalidade | Onde está | Custo |
|---|---|---|
| Justificativa e próximo passo por cliente: ritmo individual, cliente fiel, ticket alto, consentimento, limite de frequência e descadastro | `src/lib/recovery.ts` | zero (função pura) |
| Relatórios por período, comparação, evolução mensal, quebra por serviço e linhas de recuperados | `src/lib/reports.ts` | consultas SQL |
| Insights do painel, sempre com dados reais e link para a tela de ação | `getDashboardInsights` | consultas SQL |
| Resumo do mês: oportunidades novas, contatados, respostas, recuperados, receita, campanhas e mensagens | `getMonthSummary`, `countNewOpportunities` | consultas SQL |
| Exportação CSV de recuperados e de campanhas: `;` como separador, BOM, proteção contra injeção de fórmula, permissão `data:export` e auditoria `report.export` | `/api/export/recuperados?dias=…` e `/api/export/campanhas`, código em `src/lib/csv.ts` | zero |
| Assistente Gravita | `src/components/help-assistant.tsx` | zero |
| Base de conhecimento pesquisável, ignorando acentos | `src/lib/knowledge.ts` | zero |

## 6. Pendências recomendadas (não implementadas)

| Item | Motivo de não ter sido feito agora |
|---|---|
| Exportação em **PDF** | Hoje só há CSV. O PDF exige uma biblioteca de renderização ou impressão no servidor. Sugestão: começar com uma página de impressão (`@media print`). |
| Tarefas e lembretes por cliente | Exige tabela nova, ou seja, migração, que pede aprovação. |
| Envio do resumo mensal por e-mail | Depende de e-mail transacional configurado em produção. A tela já mostra o resumo. |
| Tooltips (`InfoTip`) em mais métricas | Hoje aparecem em 7 pontos. É recomendável cobrir todos os números do painel e de Resultados. |
| Tour opcional por tela, além do tour geral | Os guias "Como usar esta tela?" já cumprem parte desse papel. |
| Limite de requisições persistente | Hoje fica em memória, o que não funciona com várias instâncias. Precisa de Redis ou do banco em produção. |

### Avaliação das funcionalidades candidatas

| Funcionalidade | Valor | Complexidade | Custo | Pode ser cobrada à parte? | Decisão |
|---|---|---|---|---|---|
| Justificativa por cliente | Alto | Baixa | Zero | Faz parte do núcleo | **Feita** |
| Comparação de períodos e receita confirmada x potencial | Alto | Média | Zero | Argumento para o plano Profissional | **Feita** |
| Insights do painel | Alto | Média | Zero | — | **Feita** |
| Resumo do mês | Alto (retenção) | Baixa | Zero | — | **Feita na tela**, e-mail pendente |
| Exportação CSV | Médio | Baixa | Zero | — | **Feita** |
| Exportação PDF | Médio | Média | Baixo | — | Pendente |
| Assistente de ajuda contextual | Alto | Baixa | Zero | — | **Feito** (sem IA) |
| Assistente de ajuda com IA | Médio | Média | Por uso | — | **Descartado**: a versão determinística resolve sem custo e sem risco de inventar respostas |
| Busca na central de ajuda | Médio | Baixa | Zero | — | **Feita** |
| Tarefas e lembretes | Médio | Média | Zero | — | Pendente (precisa de migração) |
| Metas mensais de recuperação | Médio | Média | Zero | Sim | Pendente |
| Pontuação de saúde da base | Médio | Baixa | Zero | — | Parcial: o painel já mostra a distribuição por status |
| Teste A/B de mensagens | Médio | Média | Zero | Sim | Já existe parcialmente (variantes de texto) |
| Programa de indicação ou fidelidade | Médio | Alta | Zero | Sim | Fora do escopo atual |
| Integração com sistemas de PDV | Alto | Alta | Variável | Sim | Depende de API de terceiros; não iniciada para não simular |
| Pesquisa de satisfação (NPS) | Baixo | Média | Envio | — | Não agora |
| Painel de várias unidades | Médio | Alta | Zero | Sim (plano superior) | Não agora |
| Envio por SMS | Baixo | Média | Por mensagem | — | O código existe; não testado sem credencial |
| Aplicativo nativo | Baixo | Alta | Alto | — | Descartado: o app web responsivo atende |
| Chatbot que responde clientes automaticamente | Médio | Alta | Por uso | Sim | Descartado agora por risco à marca e à LGPD |

## 7. Onboarding

- O onboarding de **7 passos** foi mantido: estabelecimento, segmento, tamanho da base, conectar clientes, critérios de inatividade, primeira análise e primeira campanha. Ele já cobre o pedido de "8 passos", porque o 8º pedido ("conhecer o painel") é feito pelo tour de boas-vindas que abre logo depois.
- O texto do tour foi atualizado para "Central de recuperação".
- Ao fim do onboarding o usuário tem o Assistente Gravita em todas as telas.

## 8. Assistente de ajuda (Assistente Gravita)

- Botão flutuante "Precisa de ajuda?" em todas as telas logadas.
- **Reconhece a tela atual** pela rota e mostra o guia "Nesta tela" com os passos e a dica.
- Mostra perguntas comuns que levam direto à tela real: prioritários, importar, nova campanha e resultados.
- Pesquisa em 34 artigos: 14 tarefas, 12 guias de tela e 8 perguntas frequentes. Cada resultado tem um botão "Ir para" que abre a tela onde a tarefa é feita.
- Quando a busca não encontra nada, sugere a central de ajuda e indica o Agente de IA para perguntas sobre números.
- Fecha com Esc e ao trocar de tela.
- No celular aparece como painel inferior.
- **Não usa IA:** custo zero, funciona sem chave de API e não inventa respostas.
- Limitação: na simulação, o cartão do tour fica por cima do botão até ser fechado.

## 9. Melhorias na IA e na "inteligência"

- A inteligência nova é **determinística e auditável**: cada frase vem de uma consulta SQL sobre os dados da própria empresa. Não há texto gerado que possa inventar números.
- O agente de IA não foi alterado.
- **Limitação:** o agente com Claude de verdade não foi testado nesta rodada, porque não há `ANTHROPIC_API_KEY` configurada. Foi testado apenas o modo básico.

## 10. Otimizações

- Nenhuma consulta nova roda dentro de loop. As agregações (`count … filter`, `percentile_cont`, `group by`) acontecem no banco.
- O assistente e a busca rodam no navegador, sobre texto estático, sem chamada de rede.
- O formato de CSV ficou centralizado em `src/lib/csv.ts`.

## 11. Testes realizados

- **Automáticos:** `vitest` com **126 de 126 testes passando** em 12 arquivos. Eram 108; entraram 18 novos em `tests/recovery-reports.test.ts`:
  - `recoveryReason`: os 7 caminhos (sem ritmo, fiel e ticket alto, descadastrado, sem consentimento, limite de frequência, reconquista, recuperado);
  - CSV: escape de aspas e separador, injeção de fórmula, BOM, `;` e quebra de linha CRLF;
  - relatórios: totais por período, comparação com o período anterior, evolução mensal e linhas do CSV;
  - **isolamento entre empresas**: a empresa B não vê retornos, linhas de CSV nem insights da empresa A;
  - base de conhecimento: reconhecimento da tela, busca sem acento e busca sem resultado.
- **Tipos:** `tsc --noEmit` sem erros.
- **No navegador** (simulação, http://localhost:3000):
  - o painel mostra os insights e o resumo do mês;
  - `/inativos?status=prioritarios` mostra 38 prioritários com justificativa;
  - `/resultados?dias=90` mostra comparação, confirmado x potencial, evolução mensal, quebra por serviço e ranking;
  - a busca da ajuda e o Assistente Gravita (guia da tela e busca) funcionam;
  - o CSV de recuperados devolve 200, `text/csv` e o arquivo é baixado como anexo. Isso foi testado antes do bloqueio na simulação. Depois do bloqueio, a exportação na simulação devolve 403.
- **Celular (375 px):** sem rolagem horizontal em Recuperação, Resultados, Visão geral e Ajuda.
- **Não testado:**
  - Claude real, porque falta a chave;
  - envios reais por WhatsApp oficial, e-mail e SMS, porque faltam credenciais;
  - CSV com uma conta real fora da simulação, que depende de login com senha. Esse caminho está coberto pelos testes de permissão e de dados.

## 12. Problemas que continuam

- PDF não implementado; só CSV.
- O limite de requisições fica em memória.
- A segurança entre empresas (RLS) precisa ser validada no Postgres de produção. Em desenvolvimento é usado PGlite.
- O resumo mensal não é enviado por e-mail.
- Na simulação, o tour cobre o botão do assistente até ser fechado.
- Um registro de auditoria `report.export` ficou gravado na empresa de simulação, de um teste feito antes do bloqueio. Não afeta dados reais.
- Banco de produção e deploy ainda aguardam a sua aprovação.

## Notas (0–10) com evidência

| Área | Nota | Evidência |
|---|---|---|
| Interface | 8,5 | Identidade mantida. Novos cartões no mesmo sistema visual: tema escuro, destaque cítrico, tipografia `num`. Fluxo de recuperação visível. |
| Facilidade de uso | 8,5 | Assistente em todas as telas, busca na ajuda, guias atualizados e "Próximo passo" escrito por cliente. |
| Funcionalidades | 8 | Central de recuperação, relatórios por período e CSV somam-se ao CRM, às campanhas e às automações que já existiam. Faltam PDF e tarefas. |
| IA | 7 | Inteligência determinística sem risco de inventar dados. O agente com Claude real não foi testado nesta rodada. |
| Recuperação de clientes | 9 | Por cliente: motivo, próximo passo e bloqueios (LGPD, frequência). Abas de prioridade e fluxo completo até Resultados. |
| Onboarding | 8 | 7 passos, tour e assistente contextual. Faltam tooltips em mais métricas. |
| Mobile | 8 | Sem rolagem horizontal a 375 px nas telas novas; assistente vira painel inferior. As tabelas largas rolam dentro do próprio contêiner. |
| Performance | 8 | Agregações feitas no banco; ajuda 100% no navegador. Não foi feito teste de carga. |
| Valor comercial | 8,5 | O resumo do mês e a receita confirmada x potencial mostram o retorno em reais. A exportação ajuda a prestar contas ao sócio ou contador. |
