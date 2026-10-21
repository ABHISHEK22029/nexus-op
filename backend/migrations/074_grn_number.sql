-- ════════════════════════════════════════════════════════════════════
-- 074: goods receipts are numbered in their company's own series.
--
-- A receipt was shown as GRN-<database id>, so a company's first receipt
-- read GRN-00304: the numbers jumped, and gave away how many receipts the
-- whole platform had made. Each company's receipts are now GRN-00001,
-- GRN-00002 … in the order they were made, and new ones come from the
-- same locked counter as every other document (document_sequences,
-- doc_type 'goods_receipt'; shared/docSeries). The prefix and digits can
-- be changed in Settings → Document numbering like any other series.
--
-- Safe to run again: nothing already numbered is renumbered.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE grn ADD COLUMN IF NOT EXISTS grn_number text;

-- Existing receipts, per company, oldest first.
WITH n AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY COALESCE(date, NOW()), id) AS seq
    FROM grn
   WHERE grn_number IS NULL
)
UPDATE grn g
   SET grn_number = 'GRN-' || LPAD(n.seq::text, 5, '0')
  FROM n
 WHERE g.id = n.id;

-- Each company's counter carries on from its last receipt. ('ALL': the
-- default prefix has no {FY}, so the series runs on rather than restarting
-- each April; owner 0 stands for receipts with no owner, as in docSeries.)
INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq)
SELECT COALESCE(owner_id, 0), 'goods_receipt', 'ALL', COUNT(*)
  FROM grn
 GROUP BY COALESCE(owner_id, 0)
ON CONFLICT (owner_id, doc_type, fy)
  DO UPDATE SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq);

-- A number is never issued twice within a company.
CREATE UNIQUE INDEX IF NOT EXISTS grn_owner_number_uq ON grn (owner_id, grn_number);

-- The stock history names a receipt by its number too.
UPDATE stock_movements m
   SET ref_number = g.grn_number
  FROM grn g
 WHERE m.ref_type = 'grn'
   AND m.ref_id = g.id
   AND m.ref_number IS DISTINCT FROM g.grn_number;
