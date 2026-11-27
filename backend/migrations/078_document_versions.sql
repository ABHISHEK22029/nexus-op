-- ════════════════════════════════════════════════════════════════════
-- 078: every change to a document is kept — the History on its page.
--
-- An invoice, quotation, delivery challan, purchase order, vendor bill or
-- credit/debit note can be changed on its page (terms, dates, notes, and a
-- draft's lines), reopened as a draft, sent, cancelled. Until now the
-- change simply replaced what was there: nobody could say what the
-- customer was sent on Monday, or who moved the rate on line 2.
--
-- One row per change: the document as it was just before (before) and
-- just after (after), who made it, and when. The document's own lines are
-- inside both. A row is written only when something actually changed.
--
-- Nothing reads this table except the History panel, and the code that
-- writes it carries on without it, so the order of deploy and migration
-- doesn't matter. Kept when a document is deleted — it is the record of
-- what was there. Safe to run again.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_versions (
  id               bigserial PRIMARY KEY,
  owner_id         integer,
  doc_type         text NOT NULL,      -- sales_invoice, sales_quotation, delivery_challan,
                                       -- purchase_order, grn_bill, credit_debit_note
  doc_id           integer NOT NULL,
  action           text NOT NULL,      -- edit, status, approval, dispatch
  before           jsonb NOT NULL,
  after            jsonb NOT NULL,
  changed_by       integer,
  changed_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_versions_doc_idx
  ON document_versions (doc_type, doc_id, id);
CREATE INDEX IF NOT EXISTS document_versions_owner_idx
  ON document_versions (owner_id);
