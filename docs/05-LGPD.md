# LGPD e segurança

| Requisito | Implementação |
|---|---|
| Papéis | Estabelecimento = controlador dos dados dos clientes; GravitaSolves = operador (política em `/privacidade`) |
| Base legal por canal | `customers.legal_basis` + flags por canal; WhatsApp/SMS só com consentimento; e-mail por legítimo interesse só se habilitado |
| Registro de consentimento | `consent_events` (canal, ação, base legal, origem, autor, data) — importação, cadastro manual, alterações, opt-out |
| Opt-out | Link assinado em todo e-mail (`/descadastro/<token>`, com confirmação), resposta SAIR/PARAR/STOP via webhooks, botão na ficha |
| Lista de bloqueio | `blocklist` — vence reimportações; opcionalmente preserva o contato ao excluir um titular |
| Minimização | IA recebe nome abreviado e métricas; nunca telefone/e-mail. Auditoria sem dados pessoais |
| Acesso/portabilidade | Exportar dados do titular (JSON) e da base inteira — permissão `data:export` |
| Eliminação | Exclusão definitiva em cascata (visitas, mensagens, consentimentos) — permissão `customers:delete` |
| Retenção | Job diário elimina clientes sem atividade além de `data_retention_days` (padrão 3 anos, configurável 180–3650) |
| Isolamento entre empresas | `org_id` em todas as tabelas + filtros obrigatórios no código + **RLS** no Postgres (`0002_rls.sql`), testado em `tests/integration.test.ts` |
| Controle de acesso | Papéis owner/admin/manager/viewer (`src/lib/auth/permissions.ts`) checados em toda Server Action |
| Credenciais de integração | AES-256-GCM (`APP_ENCRYPTION_KEY`), nunca reexibidas; chaves de API só como SHA-256 |
| Autenticação | scrypt; sessão opaca em cookie httpOnly/SameSite=Lax/Secure; só o hash do token no banco; rate limit de login |
| Cabeçalhos | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Rastreabilidade | `audit_logs` para importações, campanhas, aprovações, envios, opt-outs, exclusões, exportações, configurações, ações do agente |

## Uso de dados

Os dados de clientes são usados exclusivamente para: classificação de recorrência, análises exibidas
ao próprio estabelecimento e comunicações de reativação aprovadas por ele. Não há compartilhamento
entre empresas, enriquecimento externo ou uso para treinamento de modelos.

## Responsabilidades do estabelecimento

- Coletar e documentar o consentimento dos clientes (a declaração na importação fica registrada).
- Se usar legítimo interesse para e-mail, manter a avaliação (LIA) documentada.
- Atender pedidos de titulares usando as ferramentas de exportação/exclusão.
- Seguir regras do conselho profissional do setor (ex.: CFO para odontologia — a plataforma alerta).
