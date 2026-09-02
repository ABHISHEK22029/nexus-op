-- ══════════════════════════════════════════════════════════════
-- 035 — a sales order that can hold the actual deal
--
-- customer_orders had nine columns: customer, number, PO ref, date, status,
-- notes. No totals, no discount, no payment terms, no promised ship date,
-- no terms and conditions. The order value was computed on the fly by
-- summing its lines, which means the ORDER never agreed a price — it only
-- ever reported what its lines happened to add up to.
--
-- That is the difference between a list of items and a commercial
-- agreement. A customer who negotiated 8% off, 30-day terms and delivery by
-- the 15th had none of that recorded anywhere; the invoice was where those
-- first appeared, by which point they were being re-typed from memory or
-- from an email.
--
-- Compared against what Zoho Books puts on a Sales Order, which is a
-- reasonable benchmark for what Indian SMEs expect the document to hold.
--
-- TOTALS ARE STORED, NOT DERIVED. Once a customer has agreed a figure, that
-- figure is a fact about the agreement. Recomputing it from lines means a
-- later price change silently rewrites what was agreed — and the argument
-- that follows has no evidence on either side.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE customer_orders
  -- Commitments to the customer
  ADD COLUMN IF NOT EXISTS expected_shipment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_terms          TEXT,      -- 'Due on Receipt', 'Net 30'…
  ADD COLUMN IF NOT EXISTS payment_terms_days     INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_method        TEXT,
  ADD COLUMN IF NOT EXISTS salesperson            TEXT,

  -- The money, as agreed
  ADD COLUMN IF NOT EXISTS sub_total              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount               NUMERIC DEFAULT 0,
  -- Percent or flat. Zoho offers both because both are how deals are struck
  -- ("5% off" and "knock off ₹5,000" are different negotiations).
  ADD COLUMN IF NOT EXISTS discount_type          TEXT DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS gst_rate               NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS interstate             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cgst                   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst                   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst                   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_total              NUMERIC DEFAULT 0,

  /* TDS and TCS are mutually exclusive and pull in opposite directions:
     TDS is deducted BY the customer from what they pay us, TCS is collected
     BY us on top. Storing them in one signed column would make every report
     that reads it guess which one it was looking at. */
  ADD COLUMN IF NOT EXISTS tax_deduction_type     TEXT,      -- 'TDS' | 'TCS' | NULL
  ADD COLUMN IF NOT EXISTS tax_deduction_rate     NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_deduction_amount   NUMERIC DEFAULT 0,

  -- A free adjustment line, labelled. Real invoices carry freight, packing
  -- and round-offs that belong to no item.
  ADD COLUMN IF NOT EXISTS adjustment_label       TEXT DEFAULT 'Adjustment',
  ADD COLUMN IF NOT EXISTS adjustment             NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total                  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_in_words        TEXT,

  ADD COLUMN IF NOT EXISTS terms                  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW();

-- Line items need to hold a line's own money and tax classification.
ALTER TABLE customer_order_items
  ADD COLUMN IF NOT EXISTS hsn           TEXT,
  ADD COLUMN IF NOT EXISTS rate          NUMERIC,
  ADD COLUMN IF NOT EXISTS discount      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS tax_rate      NUMERIC,
  ADD COLUMN IF NOT EXISTS amount        NUMERIC,
  ADD COLUMN IF NOT EXISTS sort_order    INTEGER DEFAULT 0;

/* `target_price` was the only price a line had, and the name says what it
   was for — a target, not an agreed rate. Copy it into `rate` so existing
   orders keep their numbers, and leave the old column in place: something
   may still read it, and dropping a column to tidy up is how a report
   starts returning nulls a week later. */
UPDATE customer_order_items
SET rate = COALESCE(rate, target_price)
WHERE rate IS NULL AND target_price IS NOT NULL;

/* Cast to numeric before rounding. quantity and target_price are `real`,
   and Postgres has no ROUND(double precision, integer) — only the numeric
   overload — so the unqualified version fails outright:
       function round(double precision, integer) does not exist
   Worth noting the whole script rolled back on that error rather than
   half-applying, which is the behaviour to rely on: one statement failing
   left the table exactly as it was. */
UPDATE customer_order_items
SET amount = ROUND((COALESCE(quantity, 0) * COALESCE(rate, 0))::numeric, 2)
WHERE amount IS NULL;

-- Backfill order totals from the lines, so existing orders show a figure
-- instead of a blank where the total should be.
UPDATE customer_orders co
SET sub_total = t.sum_amount,
    total     = t.sum_amount
FROM (
  SELECT customer_order_id, ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS sum_amount
  FROM customer_order_items GROUP BY customer_order_id
) t
WHERE t.customer_order_id = co.id
  AND COALESCE(co.total, 0) = 0;

-- 'Draft' lets an order be built up before it is committed to, which is the
-- state Zoho's "Save as Draft" produces. Existing rows keep their status.
COMMENT ON COLUMN customer_orders.status IS 'Draft | Open | In Procurement | Delivered | Closed';
