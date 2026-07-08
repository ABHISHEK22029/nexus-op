-- 023_credit_debit_notes.sql — Wave 1D: credit & debit notes
-- Formal GST adjustment documents: credit note to a customer (returns / short
-- supply / rate correction), debit note to a vendor. Optionally linked to the
-- source invoice / bill. Idempotent.
CREATE TABLE IF NOT EXISTS credit_debit_notes (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER REFERENCES users(id),
  note_type       TEXT NOT NULL,          -- credit | debit
  party_type      TEXT NOT NULL,          -- customer | vendor
  party_id        INTEGER,
  ref_type        TEXT,                   -- sales_invoice | grn_bill | null
  ref_id          INTEGER,
  ref_number      TEXT,                   -- human ref of the source doc
  note_number     TEXT,
  note_date       DATE,
  reason          TEXT,
  sub_total       REAL DEFAULT 0,
  gst_rate        REAL DEFAULT 0,
  interstate      BOOLEAN DEFAULT FALSE,
  cgst            REAL DEFAULT 0,
  sgst            REAL DEFAULT 0,
  igst            REAL DEFAULT 0,
  gst_total       REAL DEFAULT 0,
  total           REAL DEFAULT 0,
  amount_in_words TEXT,
  status          TEXT NOT NULL DEFAULT 'Issued',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS credit_debit_note_items (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER NOT NULL REFERENCES credit_debit_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn         TEXT,
  uom         TEXT DEFAULT 'nos',
  quantity    REAL DEFAULT 0,
  rate        REAL DEFAULT 0,
  amount      REAL DEFAULT 0,
  sort_order  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cdn_owner_idx ON credit_debit_notes(owner_id);
