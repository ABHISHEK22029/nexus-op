-- V015__expenses.sql
-- Module 13: Expenses — ENTIRE MODULE IS MISSING
-- No expenses table exists at all. Creating from scratch.

CREATE TABLE IF NOT EXISTS expenses (
    id              SERIAL PRIMARY KEY,
    expense_number  TEXT,
    expense_date    DATE DEFAULT CURRENT_DATE,
    project_id      INTEGER REFERENCES projects(id),
    work_order_id   INTEGER REFERENCES work_orders(id),
    category        TEXT NOT NULL,
    -- category: Labour | Fuel | Equipment Hire | Tools | Site Setup
    --           Travel | Utilities | Petty Cash | Other
    gl_account      TEXT,
    description     TEXT NOT NULL,
    currency        TEXT DEFAULT 'INR',
    amount          NUMERIC NOT NULL,
    gst_amount      NUMERIC DEFAULT 0,
    paid_through    TEXT NOT NULL,
    -- paid_through: Petty Cash | Company Card | Bank Transfer | Advance
    vendor_id       INTEGER REFERENCES vendors(id),
    invoice_number  TEXT,
    invoice_date    DATE,
    receipt_url     TEXT,
    incurred_by     INTEGER,
    approved_by     INTEGER,
    status          TEXT DEFAULT 'Draft',
    -- status: Draft | Submitted | Approved | Rejected | Reimbursed
    is_billable     BOOLEAN DEFAULT FALSE,
    customer_name   TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_project
    ON expenses(project_id, expense_date DESC);

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recurring expense profiles
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    repeat_every  TEXT NOT NULL,
    -- repeat_every: Daily | Weekly | Monthly | Quarterly
    start_date    DATE NOT NULL,
    never_expires BOOLEAN DEFAULT TRUE,
    end_date      DATE,
    category      TEXT NOT NULL,
    amount        NUMERIC NOT NULL,
    paid_through  TEXT NOT NULL,
    auto_create   BOOLEAN DEFAULT FALSE,
    project_id    INTEGER REFERENCES projects(id),
    created_by    INTEGER,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
