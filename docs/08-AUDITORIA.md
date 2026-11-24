# Auditoria completa — GravitaSolves (16/11/2026)

Relatório final da auditoria (fases 1 a 6). Tudo aqui foi verificado em código, por testes automatizados ou no navegador, sobre uma **cópia isolada** do projeto. O servidor de desenvolvimento do dono (porta 3000) e o banco `.data` **não foram tocados**. Antes das mudanças estruturais foi feito um backup do projeto.

---

## A. Resumo executivo

- **Antes:** o produto funcionava (importação, classificação, agente, campanhas), mas **não cobrava** ninguém. Faltavam recuperação de senha e verificação de e-mail. Não havia limite de tentativas no login e no cadastro, nem cabeçalhos de segurança (CSP/HSTS). O prompt do agente era genérico.
- **Agora:**
  - assinatura via **Asaas** (sandbox por padrão), com confirmação só no backend e webhook autenticado e idempotente;
  - bloqueio das funções pagas quando a assinatura vence;
  - fluxo completo de senha/e-mail;
  - rate limit por IP;
  - CSP e HSTS;
  - logs estruturados sem dados sensíveis;
  - agente com método de consultor e cache de prompt;
  - nova demonstração animada na landing, recriando o vídeo de referência;
  - marca 100% **GravitaSolves**.
- **Testes:** 75 automatizados, 75 passando. Type-check limpo. Build de produção concluído.
- **Não verificado de verdade:** cobrança real no Asaas, envio real de e-mail (Resend) e chamadas reais à IA, porque não há chaves no ambiente de teste. Detalhes na seção G.

## B. Diagnóstico (fase 2) — o que foi encontrado

| # | Severidade | Problema | Situação |
|---|---|---|---|
| 1 | **CRÍTICO** | Nenhuma cobrança: planos existiam só como texto; qualquer conta usava tudo para sempre | **Corrigido**: Asaas + bloqueio por assinatura |
| 2 | **CRÍTICO** | Sem recuperação de senha: quem esquecesse perdia a conta | **Corrigido** |
| 3 | **ALTO** | Login e cadastro sem limite de tentativas (força bruta e criação em massa) | **Corrigido**: 30 logins/15 min e 10 cadastros/h por IP |
| 4 | **ALTO** | Cadastro revelava se um e-mail já tinha conta (enumeração) | **Corrigido**: mensagem genérica |
| 5 | **ALTO** | Sem cabeçalhos de segurança (CSP, frame-ancestors, HSTS) | **Corrigido** em `next.config.ts` |
| 6 | **ALTO** | E-mail nunca verificado | **Corrigido**: link de verificação + aviso no app |
| 7 | **MÉDIO** | Prompt do agente genérico; data no prompt de sistema impedia o cache (custo e latência maiores) | **Corrigido**: método de consultor, prompt estável com cache, data na mensagem |
| 8 | **MÉDIO** | Logs soltos com risco de vazar tokens e dados | **Corrigido**: `log()` em JSON com campos sensíveis omitidos |
| 9 | **MÉDIO** | Rate limit em memória: não vale entre várias instâncias (Vercel escala horizontalmente) | **Pendente**: trocar por Redis/Upstash quando houver tráfego real |
| 10 | **MÉDIO** | Mudança de plano sem cálculo proporcional (pro rata) | **Documentado** em `07-PAGAMENTOS.md` |
| 11 | **BAIXO** | Landing com ilustração estática, pouco convincente | **Corrigido**: tour animado do produto |
| 12 | **BAIXO** | Nome antigo espalhado pelo site | **Corrigido**: busca sem ocorrências restantes |

## C. Correções e implementações

**Cobrança (Asaas)**
- `src/lib/billing/service.ts`:
  - assinatura com teste grátis automático;
  - o valor vem sempre do plano no banco, nunca do navegador;
  - um pagamento abaixo do preço do plano é ignorado;
  - reembolso e chargeback deixam a conta "em atraso";
  - cancelamento.
- `src/app/api/webhooks/asaas/route.ts`:
  - autenticado por token com comparação em tempo constante;
  - **reconsulta a cobrança na API do Asaas** antes de ativar, para que um evento forjado não ative plano;
  - idempotente (`billing_events`);
  - responde 500 em caso de falha, para o Asaas reenviar.
- Bloqueio quando inativo: IA (cai para o modo básico), criação e envio de campanhas, importação e automações. Visualização e exportação dos dados continuam liberadas: o cliente nunca fica sem acesso aos próprios dados.
- Interface: painel em Configurações → Plano (`#assinatura`) e aviso no topo do app.

**Autenticação**
- `src/lib/auth/tokens.ts`:
  - tokens de uso único, com só o hash SHA-256 no banco;
  - validade de 1 h para senha e 3 dias para e-mail;
  - um novo link invalida o anterior;
  - redefinir a senha derruba todas as sessões.
- Páginas `/recuperar-senha`, `/redefinir-senha` e `/verificar-email`, além do link "Esqueci minha senha" no login.
- `src/lib/email.ts`: envia via Resend quando houver chave; em desenvolvimento, sem chave, imprime o e-mail no console.

**Segurança e observabilidade**
- `next.config.ts`: CSP, `frame-ancestors 'none'`, HSTS (só em produção).
- `src/lib/request-ip.ts`: IP do cliente para o rate limit.
- `src/lib/log.ts`: logs estruturados.

**IA**
- `src/lib/ai/agent.ts`:
  - prompt de consultor sênior: fato × hipótese, prioridade por impacto, alerta de amostra pequena e recomendação prática com prazo de medição;
  - cache de prompt (ferramentas + sistema);
  - cache automático da conversa.
- O modelo foi mantido (`claude-opus-5-5`).

**Landing**
- `src/components/landing/product-showcase.tsx`: recriação do vídeo de referência, grande e centralizada logo abaixo do título. Painel escuro com vidro fosco e brilho verde ao fundo, e um cursor que percorre o menu e clica. Cada tela entra e sai com desfoque:
  - números contando, com a receita "viva";
  - cartão 3D flutuante do cliente;
  - barras crescendo e linhas sendo desenhadas;
  - gráfico de rosca;
  - mensagem do agente sendo digitada.
- 4 telas: Visão geral, Inativos, Insights e Resultados.
- Comportamento:
  - desenhado em 1120×700 e escalado para a largura da tela, como um vídeo;
  - pausa fora da tela, com o mouse em cima ou no botão de pausa;
  - aceita clique do visitante no menu;
  - com "reduzir movimento" do sistema, só os brilhos de fundo param;
  - marcado como **exemplo ilustrativo**.

## D. Testes executados (evidência)

| Verificação | Resultado |
|---|---|
| `npm test` (vitest) | **5 arquivos, 75 testes, 75 passando** |
| — `unit.test.ts` | 28 |
| — `integration.test.ts` | 21 |
| — `sources.test.ts` | 12 |
| — `billing.test.ts` (novo) | 13 |
| — `auth-tokens.test.ts` (novo) | 5 |
| `npm run lint` (`tsc --noEmit`) | sem erros |
| `next build` (cópia isolada) | concluído, todas as rotas geradas |
| Navegador, cópia isolada (porta 3100) | landing a 375, 1024 e 1440 px; as 4 telas do tour alternando |

O que os testes de cobrança cobrem:
- CPF/CNPJ inválido;
- teste grátis;
- assinar não ativa o plano antes do pagamento;
- webhook forjado é ignorado;
- ativação idempotente;
- pagamento abaixo do preço é ignorado;
- assinatura desconhecida é ignorada;
- reembolso e cancelamento;
- conta inativa bloqueada.

Todas as chamadas ao Asaas nesses testes são **simuladas**, e o teste confere que o destino seria `api-sandbox.asaas.com`.

## E. Notas por área (0–10)

| Área | Nota | Evidência |
|---|---|---|
| Funcionalidade principal | 8,5 | 61 testes de domínio; fluxo completo rodando na cópia isolada |
| Cobrança | 7,5 | 13 testes e confirmação só no backend; falta teste real no sandbox do Asaas e pro rata |
| Segurança | 8 | CSP/HSTS, rate limit, tokens com hash, anti-enumeração, RLS por empresa; rate limit em memória pendente |
| Autenticação | 8,5 | 5 testes novos: uso único, expiração, derrubar sessões |
| IA | 8 | Prompt de consultor e cache; sem medição com chamadas reais |
| LGPD / conformidade | 8 | Consentimento e descadastro já existentes; dados exportáveis mesmo com plano vencido |
| UX / landing | 8,5 | Tour animado verificado em três larguras; acessível a "reduzir movimento" |
| Observabilidade | 7 | Logs JSON sem dados sensíveis; falta enviar a um serviço (ex.: Sentry, Axiom) |
| Testes | 8 | 75 automatizados; faltam testes de interface (end-to-end) |
| **Geral** | **8** | |

## F. Decisões comerciais para você confirmar

Nenhum preço foi alterado. Duas condições novas precisam do seu OK (dá para mudar no `.env.local`):
- **Teste grátis de 7 dias** (`BILLING_TRIAL_DAYS=7`) — definido pelo dono.
- **Carência de 3 dias** após o vencimento antes de bloquear (`BILLING_GRACE_DAYS=3`) — definido pelo dono.

O bloqueio só liga com `ASAAS_API_KEY` configurada, ou com `BILLING_ENFORCE=true`. Sem isso, o app segue como hoje.

## F2. Revisão de 17/11 — funcionalidades, API e excesso de informação

**Bugs corrigidos**
- Cliente que ficava inativo ao registrar uma visita antiga continuava com potencial de retorno **0** e sumia da lista de prioridade (`reclassifyOne`). Agora o potencial é recalculado. Tem teste.
- Campanha aprovada sem nenhuma mensagem na fila ficava “parada” sem explicação. Agora aparece um aviso com o motivo e onde ver.
- Respostas do agente quebravam nomes como `ANTHROPIC_API_KEY` (o `_` virava itálico). Corrigido.

**Testes novos:** `tests/api.test.ts` cobre a API pública v1 (chave ausente/falsa/revogada, plano sem API, corpo inválido, cadastro de clientes, registro de visita, telefone desconhecido). Total: **80 testes passando**, `tsc` limpo.

**Menos informação por tela**
- Visão geral: o “Comece por aqui” virou uma linha só com o próximo passo (lista completa recolhida); listas mais curtas; uma ação principal no topo.
- Conexões e onboarding: mostram só 3 formas de conectar (ou as recomendadas), com “ver todas”.
- Campanha: 3 números principais; as mensagens abrem no filtro que importa e carregam 20 por vez.
- Guias “Como usar esta tela?” ficam recolhidos por padrão.

**Conferido no navegador (porta 3100):** todas as telas abrem; campanha de ponta a ponta (rascunho → aprovação → envio assistido → retorno atribuído); link de agendamento → Agenda → Atendido; configurações, critérios, bloqueio; exportações; descadastro; agente em modo básico.

## F3. Evolução de 17/11 — central de inteligência, clientes e IA consultora

Feito sem recriar nada, sem dados inventados e sem mexer em preços/planos. Backup antes: `C:\projetos\gravita-backup-evolucao-20261117-0100`. Única mudança de banco: migração aditiva `0005_etiquetas.sql` (coluna `tags` + índice).

- **Visão geral**: card "Próximas ações" (pendências reais: pedidos de agendamento, aprovações, fila, respostas, falhas, prontos para contato, rascunhos, sem autorização); meta mensal editável com barra; este mês x mesmo período do mês passado; taxa de recuperação de 90 dias.
- **Notificações**: sino no topo (computador e celular) com as mesmas pendências e contador.
- **Clientes**: "Mais filtros" (dias sem vir, visitas mínimas, gasto mínimo, etiqueta, só com contato autorizado); ordenar por prioridade e frequência; seleção em lote → etiquetar, exportar CSV, criar campanha (respeita consentimento); cartões no celular.
- **Ficha do cliente**: "Por que este cliente merece atenção" + próximo passo com botão; linha do tempo única (visitas, mensagens, autorizações); etiquetas e anotações editáveis.
- **IA (modo básico e com chave)**: nova ferramenta `recovery_diagnosis`; responde "quem recuperar primeiro", "há mais tempo sem retornar", "mais frequentes", "como melhorar a taxa", "melhor campanha", "criar campanha para 60 dias" — sempre com dados da empresa.
- **Textos**: feed de atividade sem nomes técnicos (ex.: `blocklist.add` → "Contato bloqueado para mensagens"); canais e origens legíveis na ficha.
- **Correções achadas no teste**: menu do sino saía da tela no celular; link dentro de link nos cartões de cliente (erro de hidratação).
- **Testes**: `tests/evolution.test.ts` (10 novos). Total 90/90, `tsc` limpo, verificação manual em 375px e desktop.
- **Pendente**: exportação Excel/PDF (só CSV); calendário de oportunidades; envio real depende das chaves de WhatsApp/Claude no `.env.local`.

## G. Não verificado (precisa das suas chaves ou de produção)

- **Asaas real:** nenhuma cobrança foi criada, nem no sandbox. Para testar:
  1. coloque a chave **sandbox** no `.env.local`;
  2. configure o webhook;
  3. siga `docs/07-PAGAMENTOS.md`.
- **E-mail real (Resend):** sem chave, os e-mails só aparecem no console.
- **IA real:** sem chave, o agente roda em modo básico. Prompt e cache foram conferidos no código, sem medição de custo.
- **Nota fiscal automática:** não implementada.

## H. Próximos passos recomendados

1. Testar a assinatura de ponta a ponta no **sandbox** do Asaas (cartão de teste) antes de ligar a chave de produção.
2. Configurar Resend com domínio verificado (SPF/DKIM) para os e-mails não caírem no spam.
3. Trocar o rate limit em memória por Upstash Redis antes de escalar.
4. Ligar um serviço de erros (Sentry) e alertas para falhas de webhook.
5. Adicionar testes end-to-end (Playwright) de cadastro → assinatura → uso.
