-- 017_recurring.sql — Phase 1: recurring transactions + reminder engine
-- Idempotent.

-- A schedule that auto-creates a document (expense we pay, or invoice we bill)
-- on a cadence. The scheduler advances next_run each time it fires.
CREATE TABLE IF NOT EXISTS recurring_profiles (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER REFERENCES users(id),
  doc_type      TEXT NOT NULL,                 -- 'expense' | 'sales_invoice'
  title         TEXT NOT NULL,                 -- description / narration
  customer_id   INTEGER REFERENCES customers(id),  -- for sales_invoice
  amount        REAL NOT NULL DEFAULT 0,
  frequency     TEXT NOT NULL DEFAULT 'monthly',   -- 'daily' | 'weekly' | 'monthly'
  next_run      DATE NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_run      DATE,
  runs_count    INTEGER NOT NULL DEFAULT 0,
  payload       JSONB,                         -- {category, paidTo, paymentMode, gstRate, hsn, termsDays}
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recurring_owner_idx ON recurring_profiles(owner_id);
CREATE INDEX IF NOT EXISTS recurring_next_idx  ON recurring_profiles(active, next_run);

-- Audit trail of what each schedule generated.
CREATE TABLE IF NOT EXISTS recurring_runs (
  id            SERIAL PRIMARY KEY,
  profile_id    INTEGER REFERENCES recurring_profiles(id) ON DELETE CASCADE,
  run_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  result_type   TEXT,        -- 'expense' | 'sales_invoice'
  result_id     INTEGER,
  result_ref    TEXT,        -- e.g. INV-0007
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment terms + reminder dedupe for the overdue-invoice reminder rule.
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reminder_stage INTEGER NOT NULL DEFAULT 0;
