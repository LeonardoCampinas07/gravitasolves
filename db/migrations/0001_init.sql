-- Gravita — schema inicial
-- Toda tabela de dados de negócio carrega org_id (multi-tenant).


CREATE TABLE plans (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  price_cents   integer NOT NULL,
  limits        jsonb NOT NULL,
  features      jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order    integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  segment             text NOT NULL DEFAULT 'generic',
  base_size           text,
  plan_id             text NOT NULL REFERENCES plans(id) DEFAULT 'basic',
  settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_step     integer NOT NULL DEFAULT 1,
  onboarding_done     boolean NOT NULL DEFAULT false,
  data_retention_days integer NOT NULL DEFAULT 1095,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','manager','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE TABLE sessions (
  id          text PRIMARY KEY,               -- sha256 do token do cookie
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id       text,
  name              text NOT NULL,
  phone             text,                     -- E.164
  email             text,
  first_visit_at    date,
  last_visit_at     date,
  visit_count       integer NOT NULL DEFAULT 0,
  total_spent_cents bigint NOT NULL DEFAULT 0,
  avg_ticket_cents  bigint NOT NULL DEFAULT 0,
  favorite_service  text,
  preferred_staff   text,
  notes             text,
  status            text NOT NULL DEFAULT 'unknown',
  status_changed_at timestamptz,
  recovered_at      timestamptz,
  priority_score    integer NOT NULL DEFAULT 0,
  consent_whatsapp  boolean NOT NULL DEFAULT false,
  consent_email     boolean NOT NULL DEFAULT false,
  consent_sms       boolean NOT NULL DEFAULT false,
  legal_basis       text NOT NULL DEFAULT 'none' CHECK (legal_basis IN ('consent','legitimate_interest','none')),
  consent_source    text,
  consent_at        timestamptz,
  opted_out_at      timestamptz,
  is_demo           boolean NOT NULL DEFAULT false,
  source            text NOT NULL DEFAULT 'manual',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org_status_idx ON customers(org_id, status);
CREATE INDEX customers_org_last_visit_idx ON customers(org_id, last_visit_at);
CREATE UNIQUE INDEX customers_org_phone_uq ON customers(org_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX customers_org_email_uq ON customers(org_id, email) WHERE email IS NOT NULL AND phone IS NULL;

CREATE TABLE campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name               text NOT NULL,
  objective          text,
  audience           jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel            text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  tone               text NOT NULL DEFAULT 'acolhedor',
  offer              text,
  variants           jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_subject      text,
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_approval','approved','sending','completed','cancelled')),
  requires_approval  boolean NOT NULL DEFAULT true,
  approved_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at        timestamptz,
  generated_by       text NOT NULL DEFAULT 'template' CHECK (generated_by IN ('ai','template','user')),
  rationale          text,
  created_by_type    text NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user','agent','automation')),
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  automation_id      uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);
CREATE INDEX campaigns_org_idx ON campaigns(org_id, created_at DESC);

CREATE TABLE campaign_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id         uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel             text NOT NULL,
  body                text NOT NULL,
  variant_index       integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','skipped','sent','delivered','read','failed','replied')),
  skip_reason         text,
  provider_message_id text,
  sent_via            text CHECK (sent_via IN ('api','manual')),
  error               text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  replied_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_messages_campaign_idx ON campaign_messages(campaign_id);
CREATE INDEX campaign_messages_customer_idx ON campaign_messages(org_id, customer_id, sent_at);
CREATE INDEX campaign_messages_provider_idx ON campaign_messages(provider_message_id);

CREATE TABLE visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  occurred_at  date NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  description  text,
  source       text NOT NULL DEFAULT 'manual',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_customer_idx ON visits(org_id, customer_id, occurred_at DESC);

CREATE TABLE recoveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  message_id    uuid REFERENCES campaign_messages(id) ON DELETE SET NULL,
  visit_id      uuid REFERENCES visits(id) ON DELETE CASCADE,
  returned_at   date NOT NULL,
  revenue_cents bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recoveries_org_idx ON recoveries(org_id, returned_at);

CREATE TABLE inbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  campaign_message_id uuid REFERENCES campaign_messages(id) ON DELETE SET NULL,
  channel             text NOT NULL,
  body                text,
  is_opt_out          boolean NOT NULL DEFAULT false,
  received_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  status      text NOT NULL DEFAULT 'completed',
  total_rows  integer NOT NULL DEFAULT 0,
  created     integer NOT NULL DEFAULT 0,
  updated     integer NOT NULL DEFAULT 0,
  skipped     integer NOT NULL DEFAULT 0,
  errors      jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blocklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  value      text NOT NULL,                  -- telefone E.164 ou e-mail normalizado
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, value)
);

CREATE TABLE consent_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel     text NOT NULL,
  action      text NOT NULL CHECK (action IN ('granted','revoked')),
  legal_basis text,
  source      text NOT NULL,
  actor       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  trigger_status    text NOT NULL CHECK (trigger_status IN ('at_risk','inactive','highly_inactive')),
  channel           text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  tone              text NOT NULL DEFAULT 'acolhedor',
  offer             text,
  requires_approval boolean NOT NULL DEFAULT true,
  enabled           boolean NOT NULL DEFAULT true,
  last_run_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('whatsapp_cloud','resend','twilio')),
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- somente dados não sensíveis
  secret_encrypted text,                                 -- AES-256-GCM
  status           text NOT NULL DEFAULT 'configured',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  prefix       text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);

CREATE TABLE agent_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  content    text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_messages_org_idx ON agent_messages(org_id, created_at);

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','agent','system','api')),
  actor_id    uuid,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  summary     text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON audit_logs(org_id, created_at DESC);

CREATE TABLE usage_counters (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period        text NOT NULL,                -- AAAA-MM
  ai_requests   integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period)
);

-- Planos iniciais (preços e limites editáveis direto na tabela)
INSERT INTO plans (id, name, price_cents, sort_order, limits, features) VALUES
('basic', 'Básico', 14900, 1,
  '{"maxCustomers":1000,"aiRequestsPerMonth":100,"messagesPerMonth":500,"automations":0,"channels":["whatsapp"],"apiAccess":false,"members":2}',
  '["Identificação de inativos","Análises básicas","Mensagens com IA","Envio assistido via WhatsApp"]'),
('pro', 'Profissional', 34900, 2,
  '{"maxCustomers":10000,"aiRequestsPerMonth":1000,"messagesPerMonth":5000,"automations":5,"channels":["whatsapp","email","sms"],"apiAccess":true,"members":5}',
  '["Tudo do Básico","Campanhas personalizadas","Automações","Relatórios completos","Integrações e API"]'),
('premium', 'Premium', 79900, 3,
  '{"maxCustomers":100000,"aiRequestsPerMonth":10000,"messagesPerMonth":50000,"automations":50,"channels":["whatsapp","email","sms"],"apiAccess":true,"members":25}',
  '["Tudo do Profissional","Maior capacidade","Automações avançadas","Análises inteligentes","Suporte prioritário"]');
