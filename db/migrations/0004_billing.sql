-- Cobrança recorrente (Asaas). Migração NÃO destrutiva: só cria tabelas novas.
-- Nada nos planos, preços ou dados existentes é alterado.

-- Uma assinatura por empresa. Sem linha = período de teste a partir do 1º acesso.
CREATE TABLE IF NOT EXISTS subscriptions (
  org_id                 uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing','pending','active','past_due','canceled','expired')),
  plan_id                text NOT NULL REFERENCES plans(id),
  pending_plan_id        text REFERENCES plans(id),       -- troca de plano aplicada no próximo pagamento confirmado
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,                     -- acesso garantido até aqui (pago)
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  provider               text NOT NULL DEFAULT 'asaas',
  provider_customer_id   text,
  provider_subscription_id text UNIQUE,
  billing_name           text,
  billing_email          text,
  billing_document       text,                            -- CPF/CNPJ só com dígitos (exigido pelo Asaas)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Cobranças geradas pelo provedor. Só o webhook (validado e reconsultado na API) muda o status.
CREATE TABLE IF NOT EXISTS billing_payments (
  id                  text PRIMARY KEY,                   -- id do pagamento no Asaas (pay_...)
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id     text,
  plan_id             text,
  status              text NOT NULL,                      -- PENDING, CONFIRMED, RECEIVED, OVERDUE, REFUNDED...
  value_cents         integer NOT NULL,
  billing_type        text,
  due_date            date,
  paid_at             timestamptz,
  invoice_url         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_payments_org_idx ON billing_payments(org_id, created_at DESC);

-- Idempotência dos webhooks: cada evento é processado uma única vez.
CREATE TABLE IF NOT EXISTS billing_events (
  id           text PRIMARY KEY,
  event        text NOT NULL,
  org_id       uuid,
  payload      jsonb NOT NULL,
  processed_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Recuperação de senha e verificação de e-mail (tokens guardados apenas como hash).
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens(user_id, purpose);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
