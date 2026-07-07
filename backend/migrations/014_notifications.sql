-- 014_notifications.sql — Phase 1: in-app notifications
-- Idempotent.
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),   -- recipient
  type         TEXT,                            -- PO_CREATED | APPROVAL_NEEDED | BILL_PAID | ...
  title        TEXT NOT NULL,
  message      TEXT,
  entity_type  TEXT,
  entity_id    INTEGER,
  link         TEXT,                            -- in-app route to open
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read, id DESC);
