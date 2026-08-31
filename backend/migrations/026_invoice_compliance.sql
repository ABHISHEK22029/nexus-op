-- ══════════════════════════════════════════════════════════
-- 026 — Invoice compliance (Phase 1A)
--
-- Our tax invoices are missing three fields that Rule 46 of the CGST Rules
-- makes MANDATORY (place of supply, ship-to/consignee, reverse-charge
-- declaration), plus bank details on every document. A missing mandatory
-- field can invalidate the buyer's Input Tax Credit claim, which means the
-- customer's accounts team rejects the invoice and does not pay.
--
-- It also fixes a correctness bug: `interstate` (CGST+SGST vs IGST) was
-- derived from the customer's default state. Under GST the split follows the
-- PLACE OF SUPPLY, i.e. where the goods actually ship. A fabricator billing a
-- head office but delivering to a site in another state was charging the
-- wrong tax.
--
-- All additive. No data is dropped or rewritten.
-- ══════════════════════════════════════════════════════════

-- ── 1. Company profile: how customers pay us, and who we legally are ──
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS bank_name                 TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no           TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc                 TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch               TEXT,
  ADD COLUMN IF NOT EXISTS upi_id                    TEXT,
  -- Udyam matters commercially: it entitles the SME to the MSMED Act
  -- 45-day payment protection. Printing it on the invoice is free leverage.
  ADD COLUMN IF NOT EXISTS udyam_msme_no             TEXT,
  ADD COLUMN IF NOT EXISTS cin                       TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_no          TEXT,
  ADD COLUMN IF NOT EXISTS logo_url                  TEXT,
  ADD COLUMN IF NOT EXISTS website                   TEXT,
  ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_terms             TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer_note       TEXT;

-- ── 2. Customers: ship-to is a separate address from bill-to ──
-- Apollo's registered office and the hospital site the doors go to are
-- different places, often in different states.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS shipping_address     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state       TEXT,
  ADD COLUMN IF NOT EXISTS pan                  TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days   INTEGER,
  ADD COLUMN IF NOT EXISTS credit_limit         NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS tags                 TEXT;

-- ── 3. Sales invoices: the Rule 46 fields + address snapshots ──
-- Snapshots matter: if a customer later moves office, previously issued
-- invoices must keep showing the address they were issued with.
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS place_of_supply      TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_code TEXT,
  ADD COLUMN IF NOT EXISTS reverse_charge       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS due_date             DATE,
  ADD COLUMN IF NOT EXISTS bill_to_name         TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_address      TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_gstin        TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_state        TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_name         TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_address      TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_gstin        TEXT,
  ADD COLUMN IF NOT EXISTS ship_to_state        TEXT,
  ADD COLUMN IF NOT EXISTS terms                TEXT,
  ADD COLUMN IF NOT EXISTS eway_bill_no         TEXT,
  -- Dormant e-invoice slots. E-invoicing is mandatory only above Rs 5 crore
  -- turnover, and the IRN + signed QR are returned by the government IRP
  -- (via API or a GSP) — we never mint them ourselves. Reserving the columns
  -- now means switching it on later is an integration, not a schema rewrite.
  ADD COLUMN IF NOT EXISTS irn                  TEXT,
  ADD COLUMN IF NOT EXISTS irn_ack_no           TEXT,
  ADD COLUMN IF NOT EXISTS irn_ack_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS irn_qr_payload       TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_status      TEXT DEFAULT 'not_applicable';

-- Overdue lookups (payment reminders, ageing) scan by status + due date.
CREATE INDEX IF NOT EXISTS sales_invoices_due_idx
  ON sales_invoices (status, due_date);

-- ── 4. Backfill: keep existing invoices self-consistent ──
-- Existing rows get their bill-to snapshot from the customer they point at,
-- and place of supply defaults to the customer's state (the best available
-- evidence for invoices raised before we tracked it explicitly).
UPDATE sales_invoices si
SET bill_to_name    = COALESCE(si.bill_to_name,    c.name),
    bill_to_address = COALESCE(si.bill_to_address, c.billing_address),
    bill_to_gstin   = COALESCE(si.bill_to_gstin,   c.gstin),
    bill_to_state   = COALESCE(si.bill_to_state,   c.state),
    place_of_supply = COALESCE(si.place_of_supply, c.state)
FROM customers c
WHERE si.customer_id = c.id
  AND si.bill_to_name IS NULL;
