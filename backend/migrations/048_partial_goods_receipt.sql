-- ══════════════════════════════════════════════════════════════════════
-- 048 — record how much of a purchase order has actually arrived
--
-- Nothing did. There was no received_quantity on purchase_orders or on
-- po_line_items, and the receipts sitting in `grn` were never totalled
-- against the order. Two lines sixteen apart made part-loads impossible:
--
--   grn.js:84   UPDATE purchase_orders SET status = 'Delivered'   (unconditional)
--   grn.js:68   if (po.status === 'Delivered') refuse('already delivered')
--
-- The first receipt closed the order and the closed order refused the
-- second, so the outstanding balance silently vanished — nobody chased it
-- because nothing knew it existed. `POs with more than one GRN: 0` on this
-- database is not a coincidence; the system forbade it.
--
-- 'Closed' is deliberately NOT added. Closing a short-shipped order was
-- considered and dropped.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;
ALTER TABLE po_line_items   ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;

-- Which line a receipt was booked against. Nullable: every GRN on this
-- database predates the column, and 10 of 11 POs have a single line where
-- the answer is unambiguous anyway.
ALTER TABLE grn ADD COLUMN IF NOT EXISTS po_line_item_id INTEGER REFERENCES po_line_items(id);

-- 'Partially Received' is a real state the CHECK forbade.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD  CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('Pending','Approved','Dispatched','Partially Received','Delivered'));

-- Backfill from the receipts already recorded. Nothing is invented here —
-- these numbers have been in `grn` all along, just never added up.
UPDATE purchase_orders p
   SET received_quantity = COALESCE(
         (SELECT SUM("receivedQuantity") FROM grn WHERE "poId" = p.id), 0);

-- Correct the statuses that disagree with the receipts.
--
-- PO 4 is 'Delivered' with nothing received against it. Left alone, it can
-- never be received — the guard refuses a GRN on a Delivered order — so the
-- goods would be permanently unreceivable. Returned to 'Dispatched', which
-- is the state it must have passed through, so the receipt can be recorded.
--
-- This corrects a STATUS from the evidence. It does not touch a quantity:
-- PO 20 holds 1250 against an order for 150, and whether that is a typing
-- error or a genuine over-delivery is a question for the buyer, not for a
-- migration.
UPDATE purchase_orders
   SET status = 'Dispatched'
 WHERE status = 'Delivered'
   AND COALESCE(received_quantity, 0) <= 0;

UPDATE purchase_orders
   SET status = 'Partially Received'
 WHERE status IN ('Dispatched','Delivered')
   AND received_quantity > 0
   AND received_quantity < quantity - 0.001;
