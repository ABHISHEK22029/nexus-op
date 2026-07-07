-- 013_phase0_rest.sql — expenses, departments (RBAC), opening balances
-- Idempotent.

-- ── Expense ledger (off-PO costs) ──
CREATE TABLE IF NOT EXISTS expenses (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER REFERENCES users(id),
  project_id    INTEGER,
  category      TEXT,
  description   TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  expense_date  DATE,
  paid_to       TEXT,
  payment_mode  TEXT,
  reference     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expenses_owner_idx ON expenses(owner_id);

-- ── RBAC: department on users (role already exists) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;

-- ── Opening balance carried into the customer master ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance REAL DEFAULT 0;
