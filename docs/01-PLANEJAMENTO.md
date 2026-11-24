# GravitaSolves — Fase 1: Planejamento

## 1. Posicionamento

**GravitaSolves é o analista de retenção que todo pequeno e médio negócio deveria ter.**
Ele lê a base de clientes, descobre quem deixou de voltar, calcula quanto isso custa,
prioriza quem tem mais chance de retornar e prepara campanhas de reativação — com
consentimento, limites de frequência e aprovação humana.

- **Para quem:** negócios de recorrência (barbearias, salões, clínicas, academias,
  restaurantes, lojas, oficinas, pet shops) com 200 a 50.000 clientes.
- **Problema:** o cliente some em silêncio. O dono só percebe quando o caixa cai,
  e as ferramentas existentes (CRMs genéricos, disparadores de WhatsApp) não dizem
  *quem* contatar, *quando* e *com qual argumento*.
- **Promessa:** "Volte a faturar com quem já conhece o seu negócio."
- **Diferencial:** não é um disparador. É um agente analítico com ferramentas reais
  sobre os dados do estabelecimento, guardrails de LGPD embutidos e medição de
  receita recuperada com atribuição.
- **Anti-posicionamento:** nada de disparo em massa, listas compradas ou promessa de
  faturamento garantido. Projeções são sempre rotuladas como projeções.

## 2. Nome e marca

**Nome: GravitaSolves** — de *gravidade*: a força que traz de volta o que se afastou.
Curto, pronunciável em PT/EN/ES, sugere ciência/tecnologia sem soar como "IA genérica".

**Logotipo:** uma órbita aberta (arco de 300°) com um ponto no fim do arco — o cliente
voltando — em torno de um núcleo sólido (o estabelecimento). O símbolo funciona em 16 px
(favicon) e acompanha o logotipo em Geist, peso 600, tracking negativo.
Arquivo: `src/components/brand/logo.tsx` e `src/app/icon.svg`.

**Paleta**

| Token | Hex | Uso |
|---|---|---|
| `ink-950` | `#0A0F0D` | Sidebar, títulos |
| `ink-600` | `#4A524E` | Texto secundário |
| `paper` | `#F6F7F4` | Fundo da aplicação (branco quente) |
| `line` | `#E4E7E1` | Bordas |
| `brand-700` | `#0B5D47` | Cor primária (verde gravidade) |
| `brand-500` | `#12A37A` | Ações, gráficos |
| `citrus` | `#D4F06A` | Destaque de marca, item ativo da sidebar |
| status ativo | `#12A37A` | |
| status em risco | `#D99A06` | |
| status inativo | `#E8692A` | |
| status altamente inativo | `#D23B3B` | |
| status recuperado | `#6E56CF` | o "momento de vitória" do produto |

**Tipografia:** Geist Sans (interface) e Geist Mono (números, KPIs, IDs) — servidas
localmente pelo pacote `geist`, sem dependência de CDN.

**Ícones:** Lucide (traço 1,75 px), sempre acompanhados de rótulo; nada de emoji na UI.

**Princípios visuais:** densidade de informação estilo Linear, números grandes em mono,
bordas de 1 px em vez de sombras pesadas, cor usada só para significado (status).

## 3. Arquitetura técnica

```
Navegador ──► Next.js 15 (App Router, RSC + Server Actions, TypeScript)
                 │
                 ├─ Camada de domínio (src/lib): importação, classificação,
                 │  analytics, campanhas, compliance, agente, canais
                 ├─ Drizzle ORM ──► PostgreSQL
                 │                   • produção: Supabase Postgres (DATABASE_URL)
                 │                   • desenvolvimento: PGlite (Postgres embutido, WASM)
                 ├─ Claude API (Anthropic SDK) — agente com tool use
                 ├─ Adaptadores de canal: WhatsApp Cloud API, Resend (e-mail), Twilio (SMS)
                 └─ Rotas: webhooks, API pública /api/v1 (CRM), cron /api/cron/daily
```

| Decisão | Escolha | Motivo |
|---|---|---|
| Frontend + backend | Next.js 15 + TypeScript | Um deploy, Server Actions seguras, SSR rápido |
| Estilo | Tailwind CSS 4 com tokens da marca | Identidade própria sem biblioteca de componentes genérica |
| Banco | PostgreSQL (Supabase em produção) | Relacional, RLS nativo, backups gerenciados |
| Dev local | PGlite | Postgres real em WASM: roda sem Docker nem credenciais |
| ORM | Drizzle | SQL explícito, tipado, leve; migrações SQL versionadas à mão |
| Autenticação | Própria: scrypt + sessão opaca em cookie httpOnly, hash do token no banco | Funciona sem serviço externo; trocável por Supabase Auth |
| Multi-tenant | `org_id` em toda tabela + repositórios que exigem `orgId` + RLS no Postgres (`app.current_org`) | Defesa em profundidade |
| Permissões | Papéis owner/admin/manager/viewer com matriz de ações | Simples de auditar |
| IA | Claude (`claude-opus-5-5`) com tool use; modo básico por regras quando sem chave | Nenhuma funcionalidade "finge" ser IA |
| Automação | Job diário idempotente (`/api/cron/daily` ou `npm run jobs:run`) | Funciona com Vercel Cron, Supabase cron ou qualquer agendador |
| Segredos de integração | AES-256-GCM com `APP_ENCRYPTION_KEY` | Tokens nunca ficam em texto puro no banco |
| Logs | Tabela `audit_logs` + logs estruturados no servidor | Rastreabilidade LGPD |

## 4. Banco de dados

Migrações em `db/migrations/*.sql` (aplicadas por `npm run db:migrate`).

- **organizations** — estabelecimento (segmento, critérios de inatividade, plano, retenção)
- **users / memberships / sessions** — identidade, papéis por empresa, sessões
- **customers** — dados do cliente, métricas, status, consentimento por canal, opt-out
- **visits** — histórico de visitas/compras (fonte de verdade para recência e receita)
- **imports** — cada importação com mapeamento de colunas e relatório de erros
- **campaigns / campaign_messages** — campanhas, mensagens por cliente, status de entrega
- **inbound_messages** — respostas recebidas
- **recoveries** — retorno atribuído a uma campanha (janela de atribuição configurável)
- **blocklist / consent_events** — bloqueios e trilha de consentimento
- **automations** — regras "quando cliente virar X, preparar campanha Y"
- **integrations** — provedores conectados (segredos cifrados)
- **api_keys** — chaves da API pública (só o hash é guardado)
- **agent_messages** — histórico de conversa com o agente
- **audit_logs** — quem fez o quê, quando (sem dados pessoais no payload)
- **plans / usage_counters** — planos configuráveis e consumo mensal

## 5. Escopo do MVP (implementado)

1. Cadastro, login, empresas isoladas, papéis.
2. Onboarding em 7 passos com primeira análise e primeira campanha sugerida.
3. Importação CSV/XLSX com detecção automática de colunas, normalização de telefone,
   datas e valores brasileiros, deduplicação e relatório de erros.
4. Classificação configurável (ativo, em risco, inativo, altamente inativo, recuperado),
   com opção de ritmo individual do cliente.
5. Análise: KPIs, potencial de retorno (score 0–100), receita em risco e projeção
   de receita recuperável (rotulada como projeção).
6. Campanhas: geração de mensagens com IA (ou modelos por segmento), variações
   para evitar repetição, checagem de compliance por cliente, aprovação manual,
   envio por canal configurado ou envio assistido (link wa.me + marcação manual).
7. Agente conversacional com ferramentas reais sobre os dados.
8. Resultados: funil, receita recuperada atribuída, comparação de campanhas.
9. Automações por mudança de status, executadas pelo job diário.
10. Integrações: WhatsApp Cloud API, Resend, Twilio, API REST para CRMs.
11. LGPD: consentimento por canal, base legal, opt-out, lista de bloqueio,
    exportação e exclusão de dados, política de retenção, auditoria.

**Fora do MVP (estrutura pronta, não implementado):** cobrança recorrente
(Stripe/Asaas), conectores nativos de sistemas de agenda específicos, app mobile.
