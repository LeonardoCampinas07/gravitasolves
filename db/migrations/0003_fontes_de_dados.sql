-- Fontes de dados automáticas: agenda, WhatsApp, contatos, link de agendamento.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_count integer NOT NULL DEFAULT 0;

-- Endereço público do link de agendamento (gravita.app/agendar/<slug>)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Agendamentos/atendimentos (link próprio, atendimento rápido, Google Agenda, arquivo .ics)
CREATE TABLE appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES customers(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  service       text,
  staff         text,
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','confirmed','done','no_show','cancelled')),
  amount_cents  bigint,
  notes         text,
  source        text NOT NULL,          -- booking_page | quick | google_calendar | ics | manual
  external_id   text,                   -- id do evento na origem (evita duplicar na ressincronização)
  visit_id      uuid REFERENCES visits(id) ON DELETE SET NULL,
  contact_name  text,                   -- dados informados no link público antes da conferência
  contact_phone text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_org_idx ON appointments(org_id, scheduled_for);
CREATE UNIQUE INDEX appointments_external_uq ON appointments(org_id, source, external_id) WHERE external_id IS NOT NULL;

-- Fontes conectadas por empresa
CREATE TABLE data_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind             text NOT NULL,       -- google_calendar | whatsapp_capture | booking_page | partner_request ...
  status           text NOT NULL DEFAULT 'active',
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_encrypted text,
  last_sync_at     timestamptz,
  last_result      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
  USING (org_id::text = current_setting('app.current_org', true))
  WITH CHECK (org_id::text = current_setting('app.current_org', true));
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON data_sources
  USING (org_id::text = current_setting('app.current_org', true))
  WITH CHECK (org_id::text = current_setting('app.current_org', true));
