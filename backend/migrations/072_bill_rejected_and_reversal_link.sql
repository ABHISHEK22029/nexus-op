-- ══════════════════════════════════════════════════════════════════════
-- 072 — two things that needed the schema to change.
--
-- 1. RA bills can be Rejected.
--    The app has offered "Reject" (Draft or Under Review → Rejected) and a
--    Rejected filter, and lets a rejected bill be deleted, but the table's
--    CHECK allowed only Draft, Under Review, Approved and Paid. So every
--    rejection failed with a 500 and the bill stayed where it was.
--
-- 2. A stock reversal points at the movement it reverses.
--    Undoing a delivery challan writes a compensating movement per stock
--    movement the challan made. Knowing which ones were already undone —
--    so a challan pulled back twice does not put the goods back twice —
--    rested on the note text "Reversal of movement #id". Now it is a column,
--    and a unique index makes a second reversal of the same movement
--    impossible rather than merely avoided.
--
--    Existing reversals, if any, are linked from their note first. On
--    13 Oct 2026 the live ledger had none.
--
-- Safe to run twice.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE bills ADD CONSTRAINT bills_status_check
  CHECK (status IN ('Draft', 'Under Review', 'Approved', 'Paid', 'Rejected'));

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id INTEGER REFERENCES stock_movements(id);

UPDATE stock_movements r
   SET reverses_movement_id = substring(r.note FROM '^Reversal of movement #([0-9]+)$')::int
 WHERE r.reverses_movement_id IS NULL
   AND r.note ~ '^Reversal of movement #[0-9]+$'
   AND EXISTS (SELECT 1 FROM stock_movements m
                WHERE m.id = substring(r.note FROM '^Reversal of movement #([0-9]+)$')::int);

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_reverses_once
  ON stock_movements (reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
