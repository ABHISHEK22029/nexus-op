-- 063_document_series.sql
--
-- A business's document numbers are its own.
--
-- Every sales document was numbered from a literal — INV-0001, QT-0001,
-- CO-0001, DC-0001, CN-/DN-0001 — so a business moving over from Tally or a
-- spreadsheet, already on invoice 147 of this financial year, had no way to
-- carry on from 148. Renaming one invoice by hand did not help either: the
-- counter did not know, and the next invoice came out as INV-0002.
--
-- document_series holds how each series is WRITTEN (its prefix and how many
-- digits). The counter itself stays in document_sequences, which already
-- serialises concurrent allocation with a row lock.
--
-- A prefix may contain {FY}, written out as the financial year (2026-27).
-- A series whose prefix carries the year restarts at 1 each year; one that
-- does not runs on for ever — a restart without the year in the number
-- would reissue numbers already used.

CREATE TABLE IF NOT EXISTS document_series (
  owner_id   INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type   TEXT     NOT NULL,
  prefix     TEXT     NOT NULL,
  pad        SMALLINT NOT NULL DEFAULT 4 CHECK (pad BETWEEN 1 AND 8),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, doc_type)
);

-- Rule 46(b): a tax invoice number is unique for the supplier. Until now
-- that was a check in application code that only one of the two write paths
-- made. With custom numbers allowed it has to be the database's job.
-- (Checked before writing this: no business has a duplicate today.)
CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_owner_number_uq
  ON sales_invoices (owner_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS sales_quotations_owner_number_uq
  ON sales_quotations (owner_id, quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS customer_orders_owner_number_uq
  ON customer_orders (owner_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_challans_owner_number_uq
  ON delivery_challans (owner_id, challan_number);
CREATE UNIQUE INDEX IF NOT EXISTS credit_debit_notes_owner_number_uq
  ON credit_debit_notes (owner_id, note_number);
