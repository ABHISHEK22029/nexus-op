-- ══════════════════════════════════════════════════════════════
-- 037 — index the foreign keys every document lookup joins on
--
-- Postgres indexes a PRIMARY KEY automatically. It does NOT index the
-- column on the OTHER side of a foreign key, which is the side every
-- "fetch this document's lines" query filters on. So opening one invoice
-- scanned the whole sales_invoice_items table, and the same for challans
-- and payments.
--
-- Invisible at eleven rows. At ten thousand it is the difference between
-- a document opening and a document timing out, and it degrades smoothly
-- enough that nobody can point to the day it broke.
--
-- The load test flagged exactly these three: they were the only hot
-- foreign keys of twelve with no index.
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice
  ON sales_invoice_items(sales_invoice_id);

CREATE INDEX IF NOT EXISTS idx_delivery_challan_items_challan
  ON delivery_challan_items(delivery_challan_id);

CREATE INDEX IF NOT EXISTS idx_sales_payments_invoice
  ON sales_payments(sales_invoice_id);

-- While here: the columns owner-scoping filters on for every list. These
-- were not flagged as missing, but every list query in the product now
-- carries `WHERE owner_id = $1`, so they are worth having explicitly.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_owner   ON sales_invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_owner  ON customer_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_owner  ON purchase_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_owner ON delivery_challans(owner_id);
CREATE INDEX IF NOT EXISTS idx_grn_bills_owner        ON grn_bills(owner_id);
