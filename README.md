# GravitaSolves

Plataforma SaaS de recuperação de clientes inativos, com agente de IA. Monta a base sozinha a partir
de onde o negócio já atende (agenda, WhatsApp, link de agendamento, contatos), identifica quem deixou
de voltar, mostra quanto isso representa, prioriza quem tem mais chance de retornar, prepara
campanhas personalizadas (WhatsApp oficial, e-mail, SMS) com consentimento e aprovação humana,
e mede o retorno real.

| Documento | Conteúdo |
|---|---|
| [docs/01-PLANEJAMENTO.md](docs/01-PLANEJAMENTO.md) | Posicionamento, marca, arquitetura, banco, escopo do MVP |
| [docs/02-FUNCIONAMENTO.md](docs/02-FUNCIONAMENTO.md) | Regras de negócio: classificação, score, projeção, atribuição, compliance, agente |
| [docs/03-PRODUCAO.md](docs/03-PRODUCAO.md) | Como publicar (Cloudflare Workers + Supabase), variáveis, cron, WhatsApp, checklist |
| [docs/04-API.md](docs/04-API.md) | API pública para CRMs e sistemas de agenda |
| [docs/05-LGPD.md](docs/05-LGPD.md) | Como a plataforma atende a LGPD |
| [docs/06-CONEXOES.md](docs/06-CONEXOES.md) | Conexões sem planilha: agenda, WhatsApp, link de agendamento, contatos |

## Rodar localmente

Requisitos: Node.js 20+ (testado no 26). Não precisa de Docker nem de credenciais.

```bash
npm.cmd install
```

```bash
npm.cmd run dev
```

Abra http://localhost:3000, clique em **Começar agora** e siga o onboarding. O banco local
(PostgreSQL embutido via PGlite) é criado e migrado automaticamente em `.data/pglite`.

Para testar com uma planilha, use [examples/clientes-exemplo.csv](examples/clientes-exemplo.csv)
(dados fictícios) ou o botão **Carregar dados de demonstração** — os clientes de demonstração ficam
marcados e nunca recebem mensagens reais.

Opcional — conta pronta com dados de demonstração (credenciais impressas no terminal):

```bash
npm.cmd run db:demo
```

### Ativar a IA

Sem chave, o agente funciona em **modo básico** (interpretador de comandos por regras) e as
campanhas usam modelos por segmento — a interface sempre informa isso. Para a IA completa:

```bash
echo ANTHROPIC_API_KEY=sk-ant-... >> .env.local
```

Modelo padrão: `claude-opus-5-5` (altere com `AI_MODEL`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm test` | Testes unitários e de integração (Vitest + PGlite em memória) |
| `npm run lint` | Checagem de tipos (TypeScript strict) |
| `npm run db:migrate` | Aplica `db/migrations/*.sql` no banco de `DATABASE_URL` |
| `npm run db:demo` | Cria conta de demonstração |
| `npm run jobs:run` | Executa o job diário (reclassificação, automações, retenção) |

## Estrutura

```
db/migrations/          SQL versionado (schema + RLS) — fonte de verdade do banco
src/db/                 Conexão (PGlite ou Postgres), schema Drizzle, migrador
src/lib/
  import/               Leitura CSV/XLSX, detecção de colunas, normalização BR, gravação
  classification.ts     Status de inatividade e score de potencial de retorno
  analytics.ts          KPIs, padrões, funil, comparação de campanhas
  campaigns/            Geração (IA/modelos), compliance, ciclo de vida e disparo
  channels/             Adaptadores WhatsApp Cloud API, Resend, Twilio
  ai/                   Cliente Claude, ferramentas do agente, loop e modo básico
  auth/                 Senhas scrypt, sessões, permissões por papel
  jobs.ts, lgpd.ts, demo.ts, segments.ts, settings.ts, plans.ts
src/app/                Páginas (App Router), Server Actions e rotas de API
tests/                  unit.test.ts e integration.test.ts
```

## O que está implementado e o que depende de você

**Funciona de ponta a ponta sem credenciais externas:** cadastro/login, multiempresa com RLS,
onboarding, conexões sem planilha (link de agendamento, agenda/balcão, .ics, conversas exportadas do
WhatsApp, contatos .vcf), importação, classificação, análises, agente (modo básico), campanhas com compliance,
aprovação, envio assistido (link wa.me + marcação), registro de visitas, atribuição de retorno,
resultados, automações, API pública, exportação/exclusão LGPD, auditoria.

**Código pronto que precisa de credenciais para operar:**

| Recurso | O que configurar |
|---|---|
| Agente com IA e mensagens geradas por IA | `ANTHROPIC_API_KEY` |
| Botão "Conectar com Google" (Google Agenda) | `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (docs/06-CONEXOES.md) |
| Envio via WhatsApp | Conta WhatsApp Business Platform (Meta), número, token permanente, template aprovado; `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET` para webhooks |
| Envio de e-mail | Conta Resend com domínio verificado |
| Envio de SMS | Conta Twilio com número/Messaging Service |
| Job diário em produção | `CRON_SECRET` + agendador (wrangler.jsonc já incluso) |

**Não implementado (próximos passos):** cobrança recorrente (Stripe/Asaas), convite de membros por
e-mail (hoje gera senha temporária exibida uma vez), recuperação de senha por e-mail, conectores
nativos de sistemas de agenda específicos (Trinks, AppBarber etc. — pedido já registrado na tela), webhooks de entrega do Resend.
