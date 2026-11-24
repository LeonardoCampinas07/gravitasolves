-- Etiquetas livres por cliente (não destrutiva: só adiciona coluna e índice).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS customers_tags_idx ON customers USING gin (tags);
