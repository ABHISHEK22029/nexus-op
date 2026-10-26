-- ════════════════════════════════════════════════════════════════════
-- 076: buying the way a buyer actually compares, and knowing what for.
--
-- 1. A vendor quotation's terms, beside its price. The cheapest rate is
--    not the best one when it takes three weeks, wants cash up front or
--    leaves the freight to you, and the comparison showed only the rate.
--      lead_time_days   delivery, in days (0 = ex-stock); NULL = not stated
--      payment_terms    as the vendor wrote it: "30 days credit", "advance"
--      freight          'Included' | 'Extra' (free text kept as written)
--
-- 2. Which material a quoted line is. Quotation lines were text only, so
--    the material requirements could not tell that Deccan had quoted the
--    sheet they were short of, and kept offering the preferred vendor.
--    Lines are linked where their wording names one of the company's
--    materials, and a person can link or change it when checking them.
--
-- 3. Which customer orders a purchase order was bought for. A shortfall
--    PO covers whatever every open order is short of — one PO, several
--    orders — so a link table, not a column. purchase_orders.customer_order_id
--    stays (the older vendor-quote path fills it) and is read alongside.
--
-- Additive only: new columns are NULL, the new table is empty. The code
-- running before this migration ignores all three. Safe to run again.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS lead_time_days integer;
ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS payment_terms  text;
ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS freight        text;

ALTER TABLE vendor_quotation_lines
  ADD COLUMN IF NOT EXISTS raw_material_id integer REFERENCES raw_materials(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vendor_quotation_lines_material_idx
  ON vendor_quotation_lines (raw_material_id) WHERE raw_material_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS po_customer_orders (
  po_id             integer NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  customer_order_id integer NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  owner_id          integer REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (po_id, customer_order_id)
);
CREATE INDEX IF NOT EXISTS po_customer_orders_order_idx ON po_customer_orders (customer_order_id);
CREATE INDEX IF NOT EXISTS po_customer_orders_owner_idx ON po_customer_orders (owner_id);
