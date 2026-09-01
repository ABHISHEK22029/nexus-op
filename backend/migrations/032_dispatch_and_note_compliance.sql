-- ══════════════════════════════════════════════════════════════
-- 032 — dispatch + credit/debit note compliance
--
-- Two gaps that only show up once real goods move and real notes get
-- issued, both of which we're about to start testing:
--
--   1. DELIVERY CHALLANS had no e-way bill fields. Under GST Rule 138 a
--      consignment over ₹50,000 cannot legally move without an e-way bill,
--      and the number has to travel WITH the goods. A challan that can't
--      carry it is a challan the driver gets stopped over.
--
--      They also had no ship-to address, so the document was printing the
--      customer's BILLING address as the delivery address — which for any
--      customer whose site differs from their registered office (i.e. most
--      project customers) sends the truck to the wrong place.
--
--   2. CREDIT/DEBIT NOTES carried the original invoice number but not its
--      DATE. Section 34 read with Rule 53(1A) requires both — the date is
--      what ties the note to a tax period for the GSTR-1 credit note table.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Dispatch ──────────────────────────────────────────────
ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS eway_bill_no      TEXT,
  ADD COLUMN IF NOT EXISTS eway_bill_date    DATE,
  -- Snapshotted, not joined. Where the goods went on the day they went is a
  -- historical fact; the customer editing their address next year must not
  -- silently rewrite where last year's truck was sent.
  ADD COLUMN IF NOT EXISTS ship_to_name      TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_address   TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_state     TEXT,
  ADD COLUMN IF NOT EXISTS transporter_name  TEXT,
  ADD COLUMN IF NOT EXISTS transporter_gstin TEXT,
  ADD COLUMN IF NOT EXISTS driver_name       TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone      TEXT;

-- Backfill ship-to from the customer record as it stands today. Prefer the
-- shipping address; fall back to billing where no separate site is on file
-- (which is the correct reading — same address means same address).
UPDATE delivery_challans dc
SET ship_to_name    = COALESCE(dc.ship_to_name, c.name),
    ship_to_address = COALESCE(dc.ship_to_address, NULLIF(c.shipping_address, ''), c.billing_address),
    ship_to_state   = COALESCE(dc.ship_to_state, NULLIF(c.shipping_state, ''), c.state)
FROM customers c
WHERE c.id = dc.customer_id AND dc.ship_to_address IS NULL;

-- ── 2. Credit / debit notes ──────────────────────────────────
ALTER TABLE credit_debit_notes
  ADD COLUMN IF NOT EXISTS ref_date DATE;

-- Recover the original invoice date where the note points at a sales invoice.
UPDATE credit_debit_notes n
SET ref_date = si.invoice_date
FROM sales_invoices si
WHERE n.ref_date IS NULL
  AND n.ref_type = 'sales_invoice'
  AND si.id = n.ref_id;

-- ── 3. Quotation terms default ───────────────────────────────
-- A quotation with no terms is how disputes start. Nothing enforced here;
-- the document simply prints the company default when the quote is silent.
ALTER TABLE sales_quotations
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;
