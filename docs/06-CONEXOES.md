# Conexões: como a base de clientes se monta sem planilha

Tela **Conexões** (`/fontes`) e passo 4 do onboarding. O dono responde "como você atende?" e o
GravitaSolves recomenda os modos mais fáceis para o caso dele. Todos podem ser usados juntos: os clientes
são unificados por telefone → e-mail → nome (só quando o nome é único).

| Modo | Como funciona | Precisa de credencial? | Traz histórico? | Atualiza sozinho? |
|---|---|---|---|---|
| Link de agendamento GravitaSolves (`/agendar/<slug>`) | Cliente pede horário por um link; pedido cria/atualiza o cliente e registra autorização de WhatsApp quando marcada. Dono confirma e marca "Atendido" em **Agenda** | Não | Não (a partir de agora) | Sim |
| Registro rápido no balcão (**Agenda**) | Nome, telefone, serviço e valor ao fim do atendimento | Não | Não | Sim (manual, 5 s) |
| Google Agenda | OAuth somente leitura; lê 12 meses + próximos 60 dias; sincroniza todo dia no job diário | `GOOGLE_CLIENT_ID/SECRET` | Sim | Sim |
| Agenda por link (iPhone/iCloud, Outlook, webcal/.ics) | Link público da agenda colado em Conexões; guardado criptografado; bloqueia hosts internos (SSRF), 10 MB/20 s; sincroniza todo dia no job diário | Não | Sim | Sim |
| Arquivo de agenda (.ics / .zip) | Exportação do Google, Outlook, Apple ou sistemas de agenda | Não | Sim | Reenviar arquivo |
| WhatsApp Business (API oficial) | Cada mensagem recebida atualiza "último contato"; com a captura ligada, cria o cliente | Conta Meta + integração | Não (limitação da Meta) | Sim |
| Histórico do WhatsApp (conversas exportadas) | Upload de "Exportar conversa" (.txt/.zip, Android e iPhone). Guarda só contato e datas | Não | Sim | Reenviar |
| Contatos do celular (.vcf) | Cria a lista de clientes; datas vêm das outras fontes | Não | Não | — |
| Planilha (Excel/CSV) | Importação com detecção de colunas | Não | Sim | Reenviar |
| API / Zapier / Make | `POST /api/v1/visits` e `/api/v1/customers` | Chave de API (plano Pro+) | Sim | Sim |
| Sistemas de agendamento (Trinks, AppBarber, Booksy…) | Pedido registrado; conectores nativos em desenvolvimento | — | — | — |

## Regras

- **Eventos de agenda**: eventos passados não cancelados = visita; futuros = agendamento confirmado.
  Títulos como "Almoço", "Folga", "Bloqueio", "Reunião" são ignorados. O cliente é reconhecido em
  "Corte - João Silva", "João Silva | Barba", "Maria (11) 98888-7777" ou pelos convidados do evento.
  Reimportar o mesmo evento não duplica (`appointments.external_id`).
- **Conversas como atividade** (`settings.countContactAsActivity`, padrão ligado): a última conversa
  conta como atividade quando não há visita mais recente. Assim, quem só atende pelo WhatsApp já vê
  quem está sumindo. Pode ser desligado em Conexões.
- **WhatsApp**: a API oficial não dá acesso a conversas antigas; mensagens "SAIR" nunca criam cadastro.
  Integrações não oficiais (WhatsApp Web automatizado) não são usadas: violam os termos da Meta e
  podem banir o número.
- **Privacidade**: das conversas exportadas só são guardados nome/telefone, data da última mensagem e
  quantidade de mensagens. O texto não é armazenado.
- **Limite do plano**: clientes novos além do limite são ignorados e o resultado avisa.

## Banco

Migração `db/migrations/0003_fontes_de_dados.sql`: `appointments` (agendamentos/atendimentos),
`data_sources` (fontes conectadas, segredos cifrados), `customers.last_contact_at`,
`customers.contact_count`, `organizations.slug`. Ambas as tabelas novas têm RLS.

## Configurar o Google Agenda (uma vez, para a plataforma toda)

1. console.cloud.google.com → crie um projeto → **APIs e serviços → Biblioteca** → ative **Google Calendar API**.
2. **Tela de consentimento OAuth**: tipo Externo, escopo `.../auth/calendar.readonly`. Para mais de 100 usuários, envie para verificação do Google.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. URI de redirecionamento: `https://SEU_DOMINIO/api/sources/google/callback` (em desenvolvimento: `http://localhost:3000/api/sources/google/callback`).
4. Coloque `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` (ou com `wrangler secret put` em produção) e reinicie.
