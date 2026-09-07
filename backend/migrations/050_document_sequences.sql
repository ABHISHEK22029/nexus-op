-- ══════════════════════════════════════════════════════════════════════
-- 050 — document numbers from a sequence, not from COUNT(*)
--
-- Ten call sites built a document number as `COUNT(*) + 1`. That fails
-- three separate ways, and all three are visible on this database:
--
--   · delete a document and the next reuses its number
--   · two users creating at once both read the count before either
--     insert commits, so both get the same number
--   · the count is not per-organisation, so two companies share a series
--
--   PO  9  Kirashi/FY2026-27/001  owner 1
--   PO 20  Kirashi/FY2026-27/001  owner 1
--   PO 32  Kirashi/FY2026-27/001  owner 5   <- different company, same number
--   PO 34  Kirashi/FY2026-27/001  owner 1
--   PO 1-6 no number at all
--
-- On a tax invoice a duplicate number is a GSTR-1 filing error and a breach
-- of Rule 46, which requires the number to be unique within the financial
-- year.
--
-- A row per (owner, document type, financial year) holding the last number
-- issued. Allocation is `UPDATE ... RETURNING` inside the caller's existing
-- transaction, which takes a row lock, so concurrent callers queue rather
-- than collide.
--
-- Seeded from the HIGHEST number already issued, never from a count — so a
-- number that has gone out on a document is never handed out again.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_sequences (
  -- 0 means "no owner recorded", for rows that predate owner_id. A NULL
  -- here could not be part of the primary key.
  owner_id  INTEGER NOT NULL DEFAULT 0,
  doc_type  TEXT    NOT NULL,
  fy        TEXT    NOT NULL,
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, doc_type, fy)
);

COMMENT ON TABLE document_sequences IS
  'Last number issued per organisation, document type and financial year. Allocated with UPDATE ... RETURNING so concurrent callers serialise on the row lock.';

-- ── seed from what has already been issued ───────────────────────────
--
-- The trailing digits of an existing number are its sequence: the numbers
-- look like PREFIX/FY2026-27/007, so `substring(... '([0-9]+)$')` is the
-- part that counts. Rows whose number does not end in digits contribute
-- nothing, which is right — they were never part of a series.

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0),
       'purchase_order',
       COALESCE(substring("poNumber" from '(FY[0-9]{4}(-[0-9]{2})?)'), 'FY0000'),
       MAX(COALESCE(substring("poNumber" from '([0-9]+)$')::int, 0))
  FROM purchase_orders
 WHERE "poNumber" IS NOT NULL
 GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'quotation',
       COALESCE(substring(quote_number from '(FY[0-9]{4}(-[0-9]{2})?)'), 'FY0000'),
       MAX(COALESCE(substring(quote_number from '([0-9]+)$')::int, 0))
  FROM sales_quotations WHERE quote_number IS NOT NULL GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'customer_order',
       COALESCE(substring(order_number from '(FY[0-9]{4}(-[0-9]{2})?)'), 'FY0000'),
       MAX(COALESCE(substring(order_number from '([0-9]+)$')::int, 0))
  FROM customer_orders WHERE order_number IS NOT NULL GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'sales_invoice',
       COALESCE(substring(invoice_number from '(FY[0-9]{4}(-[0-9]{2})?)'), 'FY0000'),
       MAX(COALESCE(substring(invoice_number from '([0-9]+)$')::int, 0))
  FROM sales_invoices WHERE invoice_number IS NOT NULL GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'delivery_challan',
       COALESCE(substring(challan_number from '(FY[0-9]{4}(-[0-9]{2})?)'), 'FY0000'),
       MAX(COALESCE(substring(challan_number from '([0-9]+)$')::int, 0))
  FROM delivery_challans WHERE challan_number IS NOT NULL GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);
