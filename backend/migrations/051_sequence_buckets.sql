-- ══════════════════════════════════════════════════════════════════════
-- 051 — bucket a sequence by financial year only when the number says so
--
-- 050 keyed every sequence on (owner, doc_type, financial year). That is
-- right for purchase orders, whose numbers read NFM/FY2026-27/007 — the
-- year is in the number, so restarting at 1 each April cannot collide.
--
-- It is wrong for every other document here. Customer orders are CO-0001,
-- invoices INV-0001: no year anywhere in the string. Reset those per
-- financial year and next April's first order is CO-0001 again — the same
-- number as one already issued, which is the exact fault this migration set
-- out to remove.
--
-- So the bucket follows the format: 'ALL' for a series that does not carry
-- its year, the real financial year for one that does. Seeded from the
-- highest number issued, never a count.
--
-- Adding the financial year to those formats later is a separate decision —
-- it changes how every document looks — and it is safe to make once the
-- numbering itself is sound.
-- ══════════════════════════════════════════════════════════════════════

DELETE FROM document_sequences;

-- Purchase orders: the number carries FY2026-27, so bucket by year.
INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'purchase_order',
       COALESCE(substring("poNumber" from '(FY[0-9]{4}(-[0-9]{2})?)'), 'ALL'),
       MAX(COALESCE(substring("poNumber" from '([0-9]+)$')::int, 0))
  FROM purchase_orders WHERE "poNumber" IS NOT NULL GROUP BY 1, 3
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

-- Everything else: one continuous series, because the numbers carry no year.
INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'quotation', 'ALL',
       MAX(COALESCE(substring(quote_number from '([0-9]+)$')::int, 0))
  FROM sales_quotations WHERE quote_number IS NOT NULL GROUP BY 1
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'customer_order', 'ALL',
       MAX(COALESCE(substring(order_number from '([0-9]+)$')::int, 0))
  FROM customer_orders WHERE order_number IS NOT NULL GROUP BY 1
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'sales_invoice', 'ALL',
       MAX(COALESCE(substring(invoice_number from '([0-9]+)$')::int, 0))
  FROM sales_invoices WHERE invoice_number IS NOT NULL GROUP BY 1
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'delivery_challan', 'ALL',
       MAX(COALESCE(substring(challan_number from '([0-9]+)$')::int, 0))
  FROM delivery_challans WHERE challan_number IS NOT NULL GROUP BY 1
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

-- Credit and debit notes run separate series per type.
INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'note_' || note_type, 'ALL',
       MAX(COALESCE(substring(note_number from '([0-9]+)$')::int, 0))
  FROM credit_debit_notes WHERE note_number IS NOT NULL GROUP BY 1, 2
ON CONFLICT (owner_id, doc_type, fy) DO UPDATE
   SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);
