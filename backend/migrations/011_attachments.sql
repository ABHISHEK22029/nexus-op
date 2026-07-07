-- 011_attachments.sql — file attachments (Phase 0)
-- Files are stored in Postgres so the feature is fully self-contained (no
-- external object-storage keys). Fine for SME-sized documents; can migrate
-- to object storage later. Idempotent.
CREATE TABLE IF NOT EXISTS attachments (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id),
  entity_type TEXT NOT NULL,          -- grn | grn_bill | vendor | customer | sku | raw_material | po | ...
  entity_id   INTEGER NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT,
  size_bytes  INTEGER,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments(entity_type, entity_id);
