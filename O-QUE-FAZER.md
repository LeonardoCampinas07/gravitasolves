# O que fazer agora — passo a passo

Tudo abaixo acontece dentro da pasta **C:\projetos\gravita** (a pasta deste arquivo).

> No PowerShell, use sempre `npm.cmd` em vez de `npm` (o Windows bloqueia o `npm` por segurança).

---

## Passo 1 — Rodar no seu computador (hoje, 5 minutos)

**Onde:** no terminal, dentro da pasta `gravita`.

1. Abra o terminal na pasta `C:\projetos\gravita` (clique com o botão direito na pasta → "Abrir no Terminal").
2. Digite e aperte Enter:
   ```
   npm.cmd install
   ```
3. Depois:
   ```
   npm.cmd run dev
   ```
4. Abra no navegador: **http://localhost:3000**
5. Sua conta continua lá: clique em **Entrar**. (Conta nova: **Começar agora** e siga as 7 etapas.)
6. Abra **Conexões** no menu e escolha como você atende seus clientes — sem planilha:
   - **Link de agendamento**: ative, copie o link e coloque na bio do Instagram e no WhatsApp.
   - **Histórico do WhatsApp**: exporte conversas pelo celular e envie (passo a passo na própria tela).
   - **Contatos do celular**, **arquivo de agenda (.ics)**, **planilha** ou **registro rápido no balcão** (menu **Agenda**).
   - Para só testar: `examples/clientes-exemplo.csv` ou **Carregar dados de demonstração** no onboarding.

Para desligar: aperte `Ctrl + C` no terminal.

---

## Passo 2 — Ligar a inteligência artificial (hoje, 10 minutos)

**Onde:** site https://platform.claude.com + arquivo `.env.local` na pasta `gravita`.

1. Entre em https://platform.claude.com, crie uma conta e adicione créditos.
2. Vá em **API Keys** → **Create Key** → copie a chave (começa com `sk-ant-`).
3. Abra o arquivo `.env.local` (na pasta `gravita`) no Bloco de Notas.
4. Adicione uma linha no final:
   ```
   ANTHROPIC_API_KEY=cole-sua-chave-aqui
   ```
5. Salve, pare o servidor (`Ctrl + C`) e rode `npm.cmd run dev` de novo.
6. Na tela **Agente de IA**, o selo "Modo básico" deve sumir.

---

## Passo 2b — Ligar o "Conectar com Google" (opcional, 15 minutos)

Só precisa fazer uma vez. Sem isso, o botão do Google avisa que não está configurado e você pode usar
o **arquivo de agenda (.ics)**, que dá o mesmo resultado (só não sincroniza sozinho).

Passo a passo completo em `docs/06-CONEXOES.md` (seção "Configurar o Google Agenda"). No final você
coloca duas linhas no `.env.local`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Passo 3 — Ligar o WhatsApp oficial (começar hoje, demora dias)

**Onde:** https://business.facebook.com e https://developers.facebook.com, depois no GravitaSolves em **Integrações**.

1. Verifique sua empresa no **Meta Business Manager** (pede CNPJ e documentos).
2. Em developers.facebook.com: **Criar app** → tipo Business → adicione o produto **WhatsApp**.
3. Adicione e verifique o número de telefone que vai enviar as mensagens.
4. Crie um **Usuário do sistema** com token permanente
   (permissões `whatsapp_business_messaging` e `whatsapp_business_management`).
5. No **WhatsApp Manager**, crie um modelo de mensagem:
   - Categoria: Marketing · Idioma: Português (BR)
   - Texto: `Olá, {{1}}! {{2}}`
   - Espere a aprovação da Meta.
6. No GravitaSolves → **Integrações** → WhatsApp, preencha: Phone Number ID, nome do modelo e o token.
   O sistema testa a conexão antes de salvar.

Enquanto isso não fica pronto, use o **envio assistido**: na campanha aprovada, clique em
"Abrir no WhatsApp" (a mensagem já vai escrita) e depois em "Marcar enviada".

## Passo 3b — E-mail e SMS (opcional)

- **E-mail:** conta em https://resend.com → verifique seu domínio → copie a API Key →
  GravitaSolves → **Integrações** → E-mail.
- **SMS:** conta em https://www.twilio.com → compre um número → GravitaSolves → **Integrações** → SMS
  (Account SID, Auth Token e número).

---

## Passo 4 — Colocar na internet (quando for vender)

**Onde:** https://supabase.com (banco de dados) e https://dash.cloudflare.com (site).
Instruções detalhadas em `docs/03-PRODUCAO.md`.

1. **Supabase:** crie um projeto na região **São Paulo**. Copie a "Connection string".
2. No terminal, dentro de `gravita`, crie as tabelas:
   ```
   set DATABASE_URL=cole-a-connection-string
   npm.cmd run db:migrate
   ```
3. No Supabase → SQL Editor, rode o bloco SQL da seção 1 do `docs/03-PRODUCAO.md`
   (cria o usuário seguro `gravita_app`).
4. **Cloudflare:** crie a conta (plano Workers Paid, ~US$ 5/mês — o login usa mais CPU que o grátis permite)
   e, no terminal, rode `npx.cmd wrangler login`.
5. Cadastre cada variável da tabela da seção 2 do `docs/03-PRODUCAO.md` com
   `npx.cmd wrangler secret put NOME` (DATABASE_URL, APP_URL, APP_ENCRYPTION_KEY, APP_SECRET,
   CRON_SECRET, ANTHROPIC_API_KEY…). O valor é digitado no terminal, não fica em arquivo.
6. Publique com `npm.cmd run cf:deploy`. O agendamento diário já está no `wrangler.jsonc`.

---

## Passo 5 — Antes de cobrar dos clientes

| O que | Quem faz | Onde |
|---|---|---|
| Revisar Termos de Uso e Política de Privacidade | Advogado | `src/app/(legal)/termos/page.tsx` e `src/app/(legal)/privacidade/page.tsx` |
| Nomear o encarregado de dados (DPO) e colocar o contato | Você | Página de privacidade (campo "[preencher]") |
| Contrato de tratamento de dados com cada assinante | Advogado | — |
| Definir preços e limites dos planos | Você | Tabela `plans` do banco (valores atuais: R$ 149 / 349 / 799) |
| Cobrança automática (Stripe ou Asaas) | Claude (eu) | Ainda não existe — é só pedir |
| Recuperação de senha e convite por e-mail | Claude (eu) | Ainda não existe — é só pedir |

---

## Onde está cada coisa

| Arquivo / pasta | Para que serve |
|---|---|
| `README.md` | Visão geral e comandos |
| `O-QUE-FAZER.md` | Este passo a passo |
| `.env.local` | Suas chaves secretas (nunca compartilhe) |
| `examples/clientes-exemplo.csv` | Planilha de teste (dados fictícios) |
| `docs/01-PLANEJAMENTO.md` | Marca, arquitetura, banco de dados |
| `docs/02-FUNCIONAMENTO.md` | Como o sistema classifica clientes e mede resultados |
| `docs/03-PRODUCAO.md` | Como publicar na internet (detalhado) |
| `docs/04-API.md` | Como conectar seu sistema de agenda |
| `docs/05-LGPD.md` | Como o sistema cumpre a LGPD |
| `docs/06-CONEXOES.md` | Todas as formas de conectar clientes sem planilha |
