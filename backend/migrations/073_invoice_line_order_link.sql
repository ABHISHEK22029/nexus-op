-- ══════════════════════════════════════════════════════════════════════
-- 073 — each invoice line records the order line it bills.
--
-- An order could be invoiced any number of times: nothing knew how much of
-- each order line was already billed. With this link the server adds up
-- what earlier invoices bill per order line and refuses an invoice that
-- would bill more than was ordered (shared/orderBilling.js).
--
-- Existing lines are linked where it is certain: the invoice belongs to an
-- order, and exactly one line on that order has the same description. Any
-- other existing line still counts by its description at check time.
--
-- ON DELETE SET NULL: an order line removed by editing the order leaves the
-- invoice line in place, counted by its description from then on.
--
-- Safe to run twice.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS customer_order_item_id INTEGER
  REFERENCES customer_order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_invoice_items_order_line
  ON sales_invoice_items (customer_order_item_id) WHERE customer_order_item_id IS NOT NULL;

UPDATE sales_invoice_items sii
   SET customer_order_item_id = m.order_line
  FROM (
    SELECT sii2.id AS invoice_line, MIN(coi.id) AS order_line
      FROM sales_invoice_items sii2
      JOIN sales_invoices si ON si.id = sii2.sales_invoice_id AND si.customer_order_id IS NOT NULL
      JOIN customer_order_items coi
        ON coi.customer_order_id = si.customer_order_id
       AND lower(regexp_replace(btrim(coi.description), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(sii2.description), '\s+', ' ', 'g'))
     WHERE sii2.customer_order_item_id IS NULL
     GROUP BY sii2.id
    HAVING COUNT(*) = 1
  ) m
 WHERE sii.id = m.invoice_line;
