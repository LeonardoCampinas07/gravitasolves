# Auditoria definitiva de pré-lançamento — GravitaSolves (17/11/2026)

Esta auditoria seguiu as regras pedidas:
- Não recriar o app, não remover funcionalidades e não fazer mudanças visuais desnecessárias.
- Nenhum dado real de cliente e nenhuma cobrança real.
- Nenhum ataque a terceiros e nenhum teste destrutivo.

Antes de qualquer alteração foi feito um backup: `C:\projetos\_backups\gravita-pre-auditoria-20261117-2055.tgz`.

Ambientes usados:
- **Testes automatizados (vitest):** banco Postgres em memória (PGlite), recriado a cada execução.
- **Carga e sondagens HTTP:** uma **cópia isolada** do projeto, compilada em modo produção (`next build` + `next start`), na porta 3100, com banco próprio.
- **Telas no celular (375×812):** servidor do dono na porta 3000, **somente pela simulação**, que é só leitura (nada pode ser criado ou enviado).

Este relatório complementa o `08-AUDITORIA.md` (16/11), que já tratou pagamentos (Asaas), senha/e-mail, limites de login e cadastro, CSP e logs.

---

## A. Resumo executivo

- **Isolamento entre empresas:** sólido.
  - Toda consulta filtra pela empresa da sessão.
  - Um teste novo tentou, a partir da empresa B, usar IDs de campanhas, clientes e agendamentos da empresa A: editar, aprovar, cancelar, registrar visita, descadastrar, alterar consentimento, exportar, excluir e concluir agendamento.
  - Nenhuma dessas ações teve efeito. Todas falharam ou foram ignoradas.
- **Segurança:** foram encontrados 9 problemas, nenhum crítico. Os 8 de código foram corrigidos e retestados. O nono (RLS no Postgres de produção) depende da configuração do banco e está documentado.
  - O mais sério: uma função do servidor ficou exposta publicamente e permitia contar pedidos de agendamento de qualquer empresa sem login.
  - Também grave: o formulário público de agendamento podia ser usado para encher a base de uma empresa com cadastros falsos.
- **Celular:** três telas tinham rolagem lateral (Agenda, Importar clientes, Configurações). Foram corrigidas com uma regra única de CSS, sem mudar o visual no computador.
- **Carga (cópia local, 1 processo + PGlite):** até 500 usuários simultâneos, **zero erros**. A capacidade satura em ~50 requisições/s, com latência alta a partir de 50 usuários. Isso mede a máquina local, **não** a infraestrutura de produção, que ainda não existe.
- **O que ainda impede cobrar clientes de verdade:**
  - não há produção publicada (domínio, Postgres gerenciado, deploy);
  - a chave do Asaas é de sandbox;
  - não há chave de IA, então o agente roda só em modo básico;
  - não há envio de e-mail configurado;
  - o app Google OAuth não foi verificado;
  - o WhatsApp oficial depende do Meta Business;
  - os limites de tentativas ficam na memória do servidor;
  - não há monitoramento de erros.

**Decisão: PRONTO COM RESTRIÇÕES** (detalhes na seção H).

---

## B. Notas (0–10)

| Área | Nota | Justificativa |
|---|---|---|
| Cadastro / login | 8 | Senha forte com hash, sessão HttpOnly, limite por IP, recuperação de senha e verificação de e-mail, sem revelar se o e-mail existe. O e-mail real não foi testado porque não há provedor configurado. |
| UX | 7,5 | Tour, simulação sem cadastro, linguagem simples e conexões guiadas. Havia rolagem lateral em 3 telas no celular, agora corrigida. Sem teste com usuários reais. |
| Funcionalidades | 8 | Importação, classificação, campanhas com aprovação, agenda, link de agendamento, agenda por link (.ics), Google Agenda, LGPD e API. Os conectores de parceiros ainda estão "em breve". |
| IA | 6 | O modo básico funciona e é testado. O modo com IA nunca rodou de verdade, porque não há chave no ambiente. Cota por plano e fallback para o modo básico existem em código. |
| Importação | 8,5 | Aguenta datas impossíveis, emoji, fórmula, nome de 5.000 caracteres e telefone inválido. 5.000 linhas levaram cerca de 5 s. Reimportar não duplica. O limite do plano é respeitado. |
| Pagamentos | 7 | Webhook autenticado e idempotente, status forjado ignorado, preço vindo do servidor (testes). Só sandbox: nenhuma cobrança real. Sem pro rata. |
| Segurança | 8 | 8 falhas de código corrigidas nesta rodada. CSP, HSTS e X-Frame presentes. Webhooks e cron recusam chamadas sem credencial. Pendentes: limites em memória e RLS sem efeito no PGlite. |
| Banco | 7 | Migrações automáticas, RLS escrita para as tabelas de clientes, filtro por empresa em todas as consultas. A produção ainda precisa de um usuário de banco sem bypass de RLS. Tabelas de cobrança, auditoria e auth estão fora da RLS. |
| APIs / integrações | 7 | API v1 com chave em hash, plano e limite. Webhooks assinados. O SSRF da agenda por link está bloqueado. WhatsApp, Twilio e Resend não foram testados de verdade. |
| Performance | 6 | Até 10 usuários: p50 de 0,2 s. Com 50 usuários: p95 de 1,8 s. Com 100: p95 de 3,8 s. Medido numa máquina local com banco embutido. |
| Responsividade | 8,5 | 12 telas internas verificadas em 375 px (a landing não foi medida), sem rolagem lateral após a correção. |
| Estabilidade | 8 | 0 erros em 3.443 requisições de carga. 108 de 108 testes automatizados passando. |
| Escalabilidade | 4 | Os limites de tentativas ficam na memória (não valem entre instâncias). Não há fila de jobs nem infraestrutura de produção para medir. |
| Prontidão comercial | 5 | O produto está pronto. Falta a operação: deploy, chaves reais, e-mail, monitoramento e verificação do Google. |

---

## C. Histórico de testes (todos executados de verdade)

| Teste | Como | Resultado |
|---|---|---|
| Suíte automatizada completa | `vitest run` (banco em memória) | **108 de 108 passando** (11 arquivos), depois das correções |
| Isolamento entre empresas por ID alheio (novo) | `tests/audit-isolation.test.ts` | 4/4 passaram |
| Importação com entradas difíceis + 5.000 linhas (novo) | mesmo arquivo | 2/2 passaram. 5.000 linhas em 5,06 s. Plano Básico: 997 criados e 4.003 recusados pelo limite de 1.000 clientes. Reimportação: 0 duplicados. |
| Type-check | `tsc --noEmit` | limpo |
| Sondagem sem login (porta 3100, build de produção) | `curl` | webhook Asaas 401, Twilio 400, WhatsApp 503 (sem segredo configurado), cron 503 (sem segredo), API v1 401, chave forjada 401, exportação 401, callback Google com state forjado → recusado, páginas internas → login |
| Cabeçalhos de segurança | `curl -I` | CSP, HSTS (2 anos), X-Frame-Options DENY, nosniff, Referrer-Policy presentes |
| Carga: 10 usuários, 15 s | script Node (`scratchpad/load.mjs`): landing, login, visão geral, clientes e campanhas (simulação) | 652 req, 43 req/s, 0 erros, p50 222 ms, p95 458 ms |
| Carga: 50 usuários, 15 s | idem | 736 req, 48 req/s, 0 erros, p50 1,09 s, p95 1,82 s |
| Carga: 100 usuários, 15 s | idem | 780 req, 50 req/s, 0 erros, p50 2,0 s, p95 3,8 s |
| Carga: 500 usuários, 20 s | idem | 1.275 req, 54 req/s, 0 erros, p50 9,7 s, p95 18,9 s |
| Celular 375×812 | navegador do app, simulação | Agenda, Importar e Configurações com rolagem lateral → corrigidas. Visão geral, Clientes, Ficha do cliente, Campanhas, Conexões, Agente, Automações, Integrações e Ajuda já estavam OK. |

---

## D. Problemas encontrados

| # | Sev. | Nome | Como reproduzir | Perfil afetado | Impacto | Causa | Solução | Status | Reteste |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **P1** | Função de servidor pública vazava contagem | `countPendingRequests(orgId)` era exportada num arquivo `"use server"`. O Next.js a expõe como endpoint, chamável sem login com qualquer ID de empresa. | Todos | Vaza a quantidade de pedidos de agendamento de qualquer empresa e permite carga gratuita no banco. | Função auxiliar exportada no arquivo de ações. | Removida do arquivo de ações; não era usada em lugar nenhum. | Corrigido | A função não existe mais como endpoint. Type-check limpo. |
| 2 | **P1** | Spam no link público de agendamento | O formulário público limitava só por telefone, então bastava trocar o número a cada envio. | Barbearia, clínica, varejo (quem usa o link) | Base poluída com clientes falsos e capacidade do plano consumida. | Faltava limite por IP e por empresa. | +10 pedidos/h por IP e +60 pedidos/dia por empresa. | Corrigido | Verificado em código e type-check. Não há teste HTTP automatizado (a ação depende do contexto de requisição do Next). |
| 3 | **P2** | Preferência arbitrária nas configurações | `setSourcePrefAction("qualquerChave", …)` | Admin/dono | Gravação de chaves não previstas no JSON de configurações da empresa. | Parâmetro sem validação em tempo de execução (o TypeScript não valida chamadas reais). | Lista branca de chaves + valor booleano. | Corrigido | Type-check. |
| 4 | **P2** | Consentimento registrado para cliente de outra empresa | `setConsent` com ID de cliente alheio não alterava o cliente, mas **gravava um evento de consentimento**. Canal inválido também era aceito. | Todos | Trilha de consentimento LGPD poluída e inconsistente. | Faltava checar se o cliente foi encontrado. | Valida o canal e recusa quando o cliente não pertence à empresa. | Corrigido | `audit-isolation.test.ts`: 0 eventos gravados; canal inválido recusado. |
| 5 | **P2** | "Zip bomb" no upload de conversas | Enviar um .zip com centenas de arquivos grandes. | Quem importa WhatsApp | Memória do servidor esgotada. | Havia limite por arquivo, mas não total. | Total de até 60 MB descompactados e no máximo 500 arquivos. | Corrigido | Type-check. |
| 6 | **P2** | Rolagem lateral no celular | Abrir Agenda, Importar ou Configurações em 375 px. | Perfil G (celular), perfil E (baixa familiaridade) | Formulário cortado, sensação de app quebrado. | Itens de grid com largura mínima automática. | `main .grid > * { min-width: 0 }` | Corrigido | As 3 telas ficaram com largura 375 px. |
| 7 | **P3** | Tipo de fonte não validado | `disconnectSourceAction`, `uploadSourceAction`, `appointmentAction` com valores fora da lista. | Admin | Comportamento inesperado (sem vazamento). | Uniões do TypeScript não são checadas em execução. | Lista branca em cada ação. | Corrigido | Type-check. |
| 8 | **P3** | Ação de campanha desconhecida virava "cancelar" | `campaignTransitionAction(id, "xyz")` | Gerente | Cancelamento indevido por chamada malformada (o gerente já podia cancelar). | O ramo `else` tratava qualquer valor. | Validação de `submit`, `approve` e `cancel`. Lista de mensagens validada como array. | Corrigido | Type-check. |
| 9 | **P2** | RLS sem efeito no ambiente atual | PGlite roda como superusuário, então a RLS é ignorada. | Todos | Se uma consulta esquecer o filtro, a segunda barreira não existe. | Característica do banco embutido. | Em produção, conectar com um usuário **sem** `BYPASSRLS` e que não seja dono das tabelas. Hoje o isolamento depende só do filtro por empresa, que o teste 1 confirma. | Documentado | — |

Itens já conhecidos (de `08-AUDITORIA.md`) e ainda pendentes:
- Os limites de tentativas ficam na memória e não valem com várias instâncias.
- Mudança de plano sem pro rata.
- Sem monitoramento de erros (Sentry ou similar).
- Sem testes de ponta a ponta no navegador.

---

## E. Correções feitas (arquivos)

- `src/app/sources-actions.ts`:
  - remoção da função pública `countPendingRequests`;
  - limites por IP e por empresa no agendamento público;
  - listas brancas em `setSourcePrefAction`, `disconnectSourceAction`, `uploadSourceAction` e `appointmentAction`;
  - limite total do .zip.
- `src/lib/customers.ts`: `setConsent` valida o canal e exige que o cliente pertença à empresa.
- `src/app/actions.ts`: validação da ação de campanha e da lista de mensagens.
- `src/app/globals.css`: correção de largura no celular.
- `tests/audit-isolation.test.ts` (novo): 6 testes de isolamento e importação.

Nenhuma tabela, migração, preço ou plano foi alterado.

---

## F. Riscos que continuam

1. **Infraestrutura inexistente.** Não há como medir a capacidade real antes do deploy. A carga local satura em cerca de 50 requisições/s.
2. **Limites de tentativas em memória.** Com mais de uma instância, cada uma conta separado. Isso afeta login, cadastro, agendamento público, API e agente da simulação. Solução: Redis/Upstash ou tabela no Postgres.
3. **RLS em produção.** Precisa de um usuário de banco sem bypass. As tabelas `subscriptions`, `billing_*`, `audit_logs`, `memberships`, `sessions` e `auth_tokens` não têm RLS e dependem só do código.
4. **IA real nunca executada.** Custo, latência e qualidade das respostas com Claude não foram medidos.
5. **Consentimento pelo link público.** Quem digita o telefone de outra pessoa pode marcar o consentimento dela. É inerente a formulários públicos. Sugestão: confirmar o consentimento na primeira mensagem ("responda SIM").
6. **Sem monitoramento nem alertas.** Um erro em produção passaria despercebido.
7. **Envio real** (WhatsApp, SMS, e-mail) não testado. Hoje o caminho é o envio assistido (manual).

## G. Limitações desta auditoria (o que NÃO foi verificado)

- **Carga:** medida numa máquina local com um processo Node e um banco embutido. Isso **não** representa Cloudflare/Vercel + Postgres gerenciado. Não foram feitos testes de pico em produção, CDN ou banco remoto.
- **Pagamentos:**
  - o ciclo completo foi testado por testes automatizados com o Asaas simulado;
  - a integração com o **sandbox** real do Asaas foi exercitada anteriormente nesta mesma sessão;
  - **nenhuma** cobrança real foi feita.
- **IA:** sem chave de API no ambiente, então só o modo básico foi testado.
- **E-mail, WhatsApp Cloud API, Twilio:** sem credenciais. Só a recusa de chamadas não assinadas foi testada.
- **Perfis A–G:** avaliados por inspeção das telas, dos fluxos e dos testes automatizados. **Não** houve teste com pessoas reais de cada perfil.
- **Celular:** emulação de 375 px no navegador do app. Não houve teste em iPhone ou Android físicos.
- **Navegadores:** apenas o Chromium do app. Safari e Firefox não foram testados.
- **Testes de ponta a ponta das ações de servidor por HTTP:** não automatizados. As ações foram verificadas pelas funções de serviço que chamam.

## H. Decisão final

### **PRONTO COM RESTRIÇÕES**

O produto em si está consistente e seguro para uso, depois das correções desta rodada:
- isolamento entre empresas confirmado por teste;
- nenhuma falha de segurança aberta no código;
- importação robusta;
- celular sem quebras.

As restrições são de **operação**, e precisam ser resolvidas antes de cobrar o primeiro cliente:
1. Publicar em produção, com Postgres gerenciado (usuário sem bypass de RLS) e domínio.
2. Trocar a chave do Asaas para produção e fazer uma cobrança real de valor mínimo.
3. Configurar a chave de IA e o e-mail transacional (Resend).
4. Mover os limites de tentativas para um armazenamento compartilhado.
5. Ligar o monitoramento de erros.

Com os itens 1 a 3 feitos, passa a **APTO PARA LANÇAMENTO CONTROLADO** (poucos clientes acompanhados de perto). Com os 5 itens feitos e uma medição de carga na infraestrutura real, passa a **APTO PARA LANÇAMENTO COMERCIAL**.
