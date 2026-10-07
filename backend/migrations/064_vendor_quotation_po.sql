-- 064 — a vendor's quotation remembers the purchase order raised from it.
--
-- The comparison names the lowest vendor; "Raise PO" turns that quotation
-- into a purchase order with its lines and rates. Recording which PO it
-- became lets the list say so, and stops the same quotation being ordered
-- twice by a second click. Additive and nullable: nothing existing changes.

ALTER TABLE vendor_quotations
  ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendor_quotations_po_idx ON vendor_quotations(po_id);
