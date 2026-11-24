# Publicação em produção

Arquitetura: **Cloudflare Workers** (Next.js via OpenNext) + **Supabase** (PostgreSQL gerenciado, região São Paulo),
com **Hyperdrive** opcional entre os dois. O banco continua sendo Postgres: o isolamento entre empresas depende do
RLS do Postgres, por isso D1 (SQLite) não serve. Qualquer host Node 20+ (`npm run build && npm start`) também funciona.

**Custos e limites a saber antes:**
- O plano gratuito do Workers dá 10 ms de CPU por requisição. O hash de senha (scrypt) no login/cadastro passa disso,
  então conte com o **Workers Paid (~US$ 5/mês)**, que permite até 30 s de CPU.
- O Worker gerado tem ~2,6 MB comprimido (limite: 3 MB grátis / 10 MB pago).
- O limitador de tentativas (`src/lib/rate-limit.ts`) é em memória **por isolate**: no Workers cada isolate conta
  separado, então a proteção contra força bruta é mais fraca. Para endurecer, use Rate Limiting Rules da Cloudflare
  no `/login` ou troque por um contador em KV/Durable Object.

## 1. Banco (Supabase)

1. Crie um projeto na região `sa-east-1` (São Paulo).
2. Rode as migrações com a conexão de **administrador** (Project Settings → Database → Connection string, modo *Session*):

   ```bash
   DATABASE_URL="postgresql://postgres:SENHA@db.xxxx.supabase.co:5432/postgres" npm run db:migrate
   ```

3. Crie um papel sem bypass de RLS para a aplicação e conceda acesso (SQL Editor):

   ```sql
   create role gravita_app login password 'SENHA_FORTE' noinherit;
   grant usage on schema public to gravita_app;
   grant select, insert, update, delete on all tables in schema public to gravita_app;
   alter default privileges in schema public grant select, insert, update, delete on tables to gravita_app;
   ```

   Como `gravita_app` não é dono das tabelas nem superusuário, as políticas de `0002_rls.sql`
   passam a valer: cada transação só enxerga linhas de `app.current_org`.

4. A `DATABASE_URL` da aplicação usa o **pooler em modo transaction** (porta 6543) com o usuário
   `gravita_app` (no pooler do Supabase o nome fica `gravita_app.<ref-do-projeto>`). O código já desativa prepared statements (`prepare: false`), exigência do pooler.
5. **Hyperdrive (opcional, recomendado):** reduz a latência de conexão a partir da borda.

   ```bash
   npx wrangler hyperdrive create gravita-db --connection-string="postgresql://gravita_app:SENHA@db.xxxx.supabase.co:5432/postgres"
   ```

   Use a conexão **direta** (porta 5432), não o pooler. Cole o `id` retornado no bloco `hyperdrive` comentado
   em `wrangler.jsonc`. Com o binding presente o app usa o Hyperdrive; sem ele, usa o secret `DATABASE_URL`.

No Workers cada requisição abre seu próprio cliente Postgres e o fecha logo após ficar ocioso (o runtime não
reaproveita sockets entre requisições) — ver `src/db/client.ts`.

## 2. Variáveis de ambiente (secrets do Worker)

Cada segredo é gravado uma vez com `npx wrangler secret put NOME` (o valor é digitado no terminal, nunca vai
para arquivo versionado). `ASAAS_ENV=sandbox` já está em `vars` no `wrangler.jsonc`. Para testar localmente com
`npm run cf:preview`, use um arquivo `.dev.vars` (já no `.gitignore`) com valores de teste.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Postgres (pooler, usuário `gravita_app`) |
| `APP_URL` | sim | URL pública, ex. `https://app.gravita.com.br` |
| `APP_ENCRYPTION_KEY` | sim | 32 bytes base64 — cifra tokens de integração. **Não troque depois** sem recifrar os segredos |
| `APP_SECRET` | sim | Assina links de descadastro |
| `CRON_SECRET` | sim | Protege `/api/cron/daily` |
| `ANTHROPIC_API_KEY` | recomendada | Ativa o agente com IA e a geração de mensagens |
| `AI_MODEL` | não | Padrão `claude-opus-5-5` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | p/ Google Agenda | Credencial OAuth (docs/06-CONEXOES.md); redirecionamento `https://SEU_DOMINIO/api/sources/google/callback` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | p/ WhatsApp | Texto aleatório usado na verificação do webhook |
| `WHATSAPP_APP_SECRET` | p/ WhatsApp | App Secret do app Meta (valida assinatura) |
| `DATABASE_POOL_SIZE` | não | Padrão 5 |
| `ASAAS_API_KEY` / `ASAAS_ENV` / `ASAAS_WEBHOOK_TOKEN` | p/ cobrança | Comece com `ASAAS_ENV=sandbox`; webhook em `https://SEU_DOMINIO/api/webhooks/asaas` |
| `BILLING_TRIAL_DAYS` / `BILLING_GRACE_DAYS` | não | Dias de teste e de tolerância |
| `RESEND_API_KEY` / `EMAIL_FROM` | recomendada | Confirmação de e-mail e recuperação de senha |

Gerar segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Em produção a aplicação **recusa iniciar operações** sem `APP_ENCRYPTION_KEY`/`APP_SECRET`.

## 3. Verificação antes do deploy

Com as variáveis de produção no ambiente (nunca em arquivo versionado):

```bash
npm run prod:check
```

Confere as variáveis obrigatórias, conecta no banco e **recusa** se o papel do app for superusuário,
tiver BYPASSRLS ou for dono das tabelas (qualquer um desses anula o isolamento entre empresas).
Não imprime segredos.

O isolamento por RLS com um papel restrito é testado automaticamente (`tests/rls.test.ts`), e a suíte
inteira pode rodar como esse papel: `PGLITE_APP_ROLE=1 npx vitest run --exclude tests/rls.test.ts`.

## 4. Deploy

Uma vez: `npx wrangler login` (abre o navegador para você entrar na sua conta Cloudflare).

```bash
npm run cf:deploy
```

Isso roda `cf:build` (build do Next com `GRAVITA_CF_BUILD=1`, sem o PGlite) e `wrangler deploy`. Depois, em
Workers → gravitasolves → Settings → Domains, aponte o domínio próprio e ajuste `APP_URL` para ele.

O job diário está em `wrangler.jsonc` (`triggers.crons`, 09:00 UTC = 06:00 em Brasília). O handler
`scheduled` de `worker.ts` chama `/api/cron/daily` com `Authorization: Bearer $CRON_SECRET`. Teste local:
`npx wrangler dev --test-scheduled` e acesse `/__scheduled?cron=0+9+*+*+*`.

Antes de publicar, `npm run cf:preview` roda o Worker de verdade em `http://localhost:8787` (exige `.dev.vars`
com um `DATABASE_URL` acessível).

> Correção relevante encontrada nesta migração: o driver postgres-js do drizzle enviava datas cruas em
> consultas SQL manuais e quebrava em qualquer Postgres real (o PGlite dos testes mascarava). Corrigido em
> `drizzlePostgres()` (`src/db/client.ts`), com teste em `tests/pg-driver.test.ts`.

## 5. WhatsApp Business Platform (Cloud API)

1. Meta Business Manager verificado → app em developers.facebook.com com o produto WhatsApp.
2. Adicione e verifique o número; crie um **System User** com token permanente
   (permissões `whatsapp_business_messaging`, `whatsapp_business_management`).
3. Crie e aguarde aprovação do template (categoria Marketing, pt_BR), corpo `Olá, {{1}}! {{2}}`.
4. Webhook: URL `https://SEU_DOMINIO/api/webhooks/whatsapp`, token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   assine o campo `messages`.
5. No GravitaSolves → Integrações → WhatsApp: Phone Number ID, nome do template e token. A conexão é testada
   antes de salvar.

> Modelo de operação: com um app Meta da plataforma (Tech Provider), cada empresa conecta seu próprio
> número/WABA. Os campos já são por empresa; o *Embedded Signup* da Meta é o próximo passo para
> automatizar essa conexão.

## 6. E-mail (Resend) e SMS (Twilio)

- Resend: verifique o domínio do remetente (SPF/DKIM) e cole a API key em Integrações.
- Twilio: Account SID, Auth Token e número/Messaging Service. O webhook de status e respostas é
  configurado automaticamente por mensagem (`StatusCallback`) quando `APP_URL` é HTTPS; para respostas
  (SAIR), configure no número a URL `https://SEU_DOMINIO/api/webhooks/twilio?org=<ID_DA_EMPRESA>`.

## 7. Checklist antes de vender

- [ ] Revisão jurídica de termos, política de privacidade e DPA (contrato de operador) com os assinantes
- [ ] Encarregado (DPO) nomeado e publicado
- [ ] Backups e PITR habilitados no Supabase
- [ ] Monitoramento: logs do Workers (observability ligado no `wrangler.jsonc`) + alertas (Sentry/Datadog) — eventos de negócio já ficam em `audit_logs`
- [ ] Rate limit distribuído (Rate Limiting Rules da Cloudflare, KV ou Durable Object) — no Workers o atual é por isolate (`src/lib/rate-limit.ts`)
- [ ] Gateway de cobrança e troca de plano
- [ ] Recuperação de senha e convite de membros por e-mail
- [ ] Teste de carga da importação com a maior base esperada (limite atual: 100 mil linhas/arquivo)
