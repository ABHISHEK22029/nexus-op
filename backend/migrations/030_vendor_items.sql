-- ══════════════════════════════════════════════════════════
-- 030 — Vendor ↔ material link (Track C)
--
-- THE PROBLEM
-- Raising a PO for MS sheets lists EVERY vendor — the transporter, the
-- electrician, the software supplier. The user has to remember who sells
-- steel. There is no data anywhere that answers "who supplies this?".
--
-- `vendors.capability_tags` gives a rough label ("Sheets, Hinges") which is
-- fine for a chip on a list, but it cannot drive a dropdown: it has no
-- price, no MOQ, no lead time, and no reliable link to a specific material.
--
-- This table is the real relationship, and it does three jobs at once:
--   1. filters the PO / RFQ vendor picker to who actually sells the item
--   2. supplies PER-VENDOR MOQ and lead time to the deficiency engine
--      (Jindal's minimum is not Electrosteel's)
--   3. records the price each vendor charges, so RFQ comparison has a
--      starting point rather than a blank form
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_items (
  id               SERIAL PRIMARY KEY,
  owner_id         INTEGER REFERENCES users(id),
  vendor_id        INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  raw_material_id  INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,

  vendor_item_code TEXT,                    -- the vendor's own part number
  price            NUMERIC(14,2),           -- their rate, in purchase_uom
  price_uom        TEXT REFERENCES uom(code),
  moq              NUMERIC(14,4),           -- THIS vendor's minimum order
  lead_time_days   INTEGER,
  is_preferred     BOOLEAN DEFAULT FALSE,
  last_quoted_at   DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vendor_items_unique UNIQUE (vendor_id, raw_material_id)
);

CREATE INDEX IF NOT EXISTS vendor_items_material_idx ON vendor_items (raw_material_id);
CREATE INDEX IF NOT EXISTS vendor_items_vendor_idx   ON vendor_items (vendor_id);

-- Only one preferred vendor per material — the auto-PO target has to be
-- unambiguous, otherwise "order from the preferred vendor" has no answer.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_items_one_preferred_idx
  ON vendor_items (raw_material_id)
  WHERE is_preferred = TRUE;

COMMENT ON TABLE vendor_items IS
  'Which vendor supplies which material, with their price, MOQ and lead time. Drives the filtered PO vendor picker and per-vendor MOQ rounding.';
