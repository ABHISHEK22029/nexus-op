-- ══════════════════════════════════════════════════════════════
-- 034 — close the inventory loop, and make stock explainable
--
-- Two halves of the loop were missing entirely:
--
--   · PRODUCTION OUTPUT never entered stock. You fabricate 200 cross-arms,
--     they land in production_output, and inventory still says zero. Raw
--     material was tracked; finished goods were not tracked at all.
--
--   · DISPATCH never left stock. Goods physically went out on a delivery
--     challan and the balance never moved.
--
-- Fixing only those two would leave the deeper problem: inventory.quantity
-- is a bare running number with no history, so "why is stock 40 when it
-- should be 60" has no answer — you can see the balance and nothing that
-- produced it. Every serious stock system stores MOVEMENTS and derives the
-- balance. This adds the ledger.
--
-- inventory.quantity is kept as a maintained balance rather than replaced,
-- because a dozen queries and the whole deficiency engine read it, and
-- swapping it for a SUM() in one migration would be a large blast radius
-- for no immediate gain. The ledger is written in the same transaction as
-- every balance change, and a reconciliation endpoint compares the two —
-- so a drift becomes visible instead of silent.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_movements (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER,

  -- The stock row this moved. Nullable: an output for an item that has no
  -- inventory row yet still deserves a ledger entry.
  inventory_id  INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  sku_id        INTEGER,
  raw_material_id INTEGER,
  item_name     TEXT NOT NULL,

  -- Signed quantity: positive in, negative out. One signed column rather
  -- than a direction flag plus a magnitude, so the balance is a plain
  -- SUM() and no query can forget to apply the sign.
  quantity      NUMERIC NOT NULL,
  uom           TEXT,
  unit_cost     NUMERIC,

  -- Why it moved. Constrained so a typo cannot invent a movement type that
  -- silently drops out of every report that filters on this.
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'grn',                     -- goods received from a vendor
    'production_consumption',  -- raw material issued to the shop floor
    'production_output',       -- finished goods made
    'production_scrap',        -- lost in process
    'dispatch',                -- delivered to a customer
    'dispatch_reversal',       -- a dispatch undone
    'adjustment',              -- stock count correction
    'opening'                  -- the balance that existed before this ledger
  )),

  -- What caused it, so a movement can be traced back to its document.
  ref_type      TEXT,
  ref_id        INTEGER,
  ref_number    TEXT,

  note          TEXT,
  created_by    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_mov_inventory ON stock_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_owner     ON stock_movements(owner_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_ref       ON stock_movements(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_created   ON stock_movements(created_at DESC);

-- ── Dispatch bookkeeping on the challan ──────────────────────
-- Stock leaves on DISPATCH, not on invoice: dispatch is the physical event,
-- an invoice is a financial one, and a business may raise either without
-- the other. Moving stock on both would double-count every sale.
--
-- stock_applied makes the transition idempotent. Without it, marking a
-- challan Dispatched twice — a double click, a retry, a status set back and
-- forward — removes the goods twice, and nothing about the resulting
-- balance would look wrong.
ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS stock_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_applied_at TIMESTAMPTZ;

-- Same guard for production output lines, so re-running or reversing an
-- output cannot double-add finished goods.
ALTER TABLE production_output
  ADD COLUMN IF NOT EXISTS inventory_id  INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- Let a finished-goods row point back at what it is.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS last_movement_at TIMESTAMPTZ;

-- ── Opening balances ─────────────────────────────────────────
-- Every quantity on hand today arrived before this ledger existed. Recording
-- it as an explicit 'opening' movement means SUM(stock_movements) equals
-- inventory.quantity from the very first day, so the reconciliation check is
-- meaningful immediately rather than only for rows that happen to move next.
INSERT INTO stock_movements (owner_id, inventory_id, sku_id, raw_material_id,
                             item_name, quantity, uom, unit_cost,
                             movement_type, note)
SELECT i.owner_id, i.id, i.sku_id, i.raw_material_id,
       i."itemName", COALESCE(i.quantity, 0), i.uom, i.unit_cost,
       'opening', 'Balance on hand when the stock ledger was introduced'
FROM inventory i
WHERE NOT EXISTS (
  SELECT 1 FROM stock_movements m
  WHERE m.inventory_id = i.id AND m.movement_type = 'opening'
);

-- ── inventory.projectId must be nullable ─────────────────────
-- Stock is not inherently project-bound. Finished goods coming off a
-- production run, or leaving on a customer dispatch, belong to the company
-- rather than to a project — and the NOT NULL constraint made the first
-- dispatch fail outright:
--     null value in column "projectId" of relation "inventory"
-- Existing rows keep their project; new company-level stock simply has none.
ALTER TABLE inventory ALTER COLUMN "projectId" DROP NOT NULL;
