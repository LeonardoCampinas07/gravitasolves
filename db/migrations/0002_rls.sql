-- Row Level Security (defesa em profundidade para o isolamento entre empresas).
--
-- A aplicação já filtra tudo por org_id. Além disso, cada operação de dados roda em
-- uma transação que executa set_config('app.current_org', <org>, true).
-- Em produção, conecte com um papel SEM privilégio de bypass (ver docs/03-PRODUCAO.md):
-- as políticas abaixo então impedem leitura/escrita fora da empresa corrente,
-- mesmo que uma consulta esqueça o filtro.
-- Superusuários e donos das tabelas (ex.: PGlite local) ignoram RLS.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','campaigns','campaign_messages','visits','recoveries','inbound_messages',
    'imports','blocklist','consent_events','automations','agent_messages',
    'usage_counters'
    -- integrations e api_keys ficam fora: webhooks/API precisam resolver a empresa a
    -- partir delas antes de existir contexto. São sempre consultadas com filtro explícito.
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (org_id::text = current_setting('app.current_org', true))
      WITH CHECK (org_id::text = current_setting('app.current_org', true))$p$, t);
  END LOOP;
END $$;
