/* ══════════════════════════════════════════════════════════════════════
   066 — exact numbers for money and quantities.

   Every money and quantity column was created as REAL: a 4-byte float with
   about seven significant digits. Whole rupees are exact only up to 2^24 =
   ₹1,67,77,216, and paise start to go well before that. Anything larger was
   rounded on the way into the database, and every SUM of them came back
   rounded too. A tester's invoice
   printed a line of ₹14,25,41,685 as ₹14,25,42,000, and the sub-total,
   GST and round-off disagreed with the screen that had just computed them.

   NUMERIC is exact decimal arithmetic:
     money             NUMERIC(18,2)   to the paisa, up to ₹99,99,99,99,99,99,999
     quantities        NUMERIC(18,4)
     rates / prices    NUMERIC(18,4)   per-kg rates go below a paisa
     percentages       NUMERIC(9,4)
     BOM factors       NUMERIC(18,6)

   A REAL converts to NUMERIC by its shortest exact decimal, so 0.1 stays
   0.1. Values already rounded by REAL cannot be recovered; they stay as
   they were stored.

   db.js parses NUMERIC to a JS number, so the code that read these as
   numbers before still does. 109 columns in 35 tables.
   ══════════════════════════════════════════════════════════════════════ */

ALTER TABLE automation_settings
  ALTER COLUMN "po_approval_threshold" TYPE NUMERIC(18,2) USING "po_approval_threshold"::numeric;

ALTER TABLE bill_line_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE bills
  ALTER COLUMN "grossAmount" TYPE NUMERIC(18,2) USING "grossAmount"::numeric,
  ALTER COLUMN "tds" TYPE NUMERIC(18,2) USING "tds"::numeric,
  ALTER COLUMN "retention" TYPE NUMERIC(18,2) USING "retention"::numeric,
  ALTER COLUMN "netAmount" TYPE NUMERIC(18,2) USING "netAmount"::numeric,
  ALTER COLUMN "billedQuantity" TYPE NUMERIC(18,4) USING "billedQuantity"::numeric,
  ALTER COLUMN "sub_total" TYPE NUMERIC(18,2) USING "sub_total"::numeric,
  ALTER COLUMN "cgst" TYPE NUMERIC(18,2) USING "cgst"::numeric,
  ALTER COLUMN "sgst" TYPE NUMERIC(18,2) USING "sgst"::numeric,
  ALTER COLUMN "igst" TYPE NUMERIC(18,2) USING "igst"::numeric,
  ALTER COLUMN "gst_total" TYPE NUMERIC(18,2) USING "gst_total"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric,
  ALTER COLUMN "tds_rate" TYPE NUMERIC(9,4) USING "tds_rate"::numeric,
  ALTER COLUMN "retention_pct" TYPE NUMERIC(9,4) USING "retention_pct"::numeric,
  ALTER COLUMN "advance_recovery" TYPE NUMERIC(18,2) USING "advance_recovery"::numeric,
  ALTER COLUMN "other_deductions" TYPE NUMERIC(18,2) USING "other_deductions"::numeric,
  ALTER COLUMN "gst_tds" TYPE NUMERIC(18,2) USING "gst_tds"::numeric,
  ALTER COLUMN "gst_tds_rate" TYPE NUMERIC(9,4) USING "gst_tds_rate"::numeric,
  ALTER COLUMN "labour_cess" TYPE NUMERIC(18,2) USING "labour_cess"::numeric,
  ALTER COLUMN "labour_cess_rate" TYPE NUMERIC(9,4) USING "labour_cess_rate"::numeric;

ALTER TABLE boq_items
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric;

ALTER TABLE credit_debit_note_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE credit_debit_notes
  ALTER COLUMN "sub_total" TYPE NUMERIC(18,2) USING "sub_total"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric,
  ALTER COLUMN "cgst" TYPE NUMERIC(18,2) USING "cgst"::numeric,
  ALTER COLUMN "sgst" TYPE NUMERIC(18,2) USING "sgst"::numeric,
  ALTER COLUMN "igst" TYPE NUMERIC(18,2) USING "igst"::numeric,
  ALTER COLUMN "gst_total" TYPE NUMERIC(18,2) USING "gst_total"::numeric,
  ALTER COLUMN "total" TYPE NUMERIC(18,2) USING "total"::numeric;

ALTER TABLE customer_order_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "target_price" TYPE NUMERIC(18,4) USING "target_price"::numeric;

ALTER TABLE customers
  ALTER COLUMN "opening_balance" TYPE NUMERIC(18,2) USING "opening_balance"::numeric;

ALTER TABLE delivery_challan_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE delivery_challans
  ALTER COLUMN "total_value" TYPE NUMERIC(18,2) USING "total_value"::numeric;

ALTER TABLE expenses
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE grn_bill_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE grn_bills
  ALTER COLUMN "sub_total" TYPE NUMERIC(18,2) USING "sub_total"::numeric,
  ALTER COLUMN "freight" TYPE NUMERIC(18,2) USING "freight"::numeric,
  ALTER COLUMN "other_charges" TYPE NUMERIC(18,2) USING "other_charges"::numeric,
  ALTER COLUMN "discount" TYPE NUMERIC(18,2) USING "discount"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric,
  ALTER COLUMN "cgst" TYPE NUMERIC(18,2) USING "cgst"::numeric,
  ALTER COLUMN "sgst" TYPE NUMERIC(18,2) USING "sgst"::numeric,
  ALTER COLUMN "igst" TYPE NUMERIC(18,2) USING "igst"::numeric,
  ALTER COLUMN "gst_total" TYPE NUMERIC(18,2) USING "gst_total"::numeric,
  ALTER COLUMN "round_off" TYPE NUMERIC(18,2) USING "round_off"::numeric,
  ALTER COLUMN "net_amount" TYPE NUMERIC(18,2) USING "net_amount"::numeric,
  ALTER COLUMN "amount_paid" TYPE NUMERIC(18,2) USING "amount_paid"::numeric;

ALTER TABLE inventory
  ALTER COLUMN "unit_cost" TYPE NUMERIC(18,4) USING "unit_cost"::numeric;

ALTER TABLE measurement_book
  ALTER COLUMN "length" TYPE NUMERIC(18,4) USING "length"::numeric,
  ALTER COLUMN "width" TYPE NUMERIC(18,4) USING "width"::numeric,
  ALTER COLUMN "depth" TYPE NUMERIC(18,4) USING "depth"::numeric,
  ALTER COLUMN "measuredQuantity" TYPE NUMERIC(18,4) USING "measuredQuantity"::numeric;

ALTER TABLE milestones
  ALTER COLUMN "plannedPercent" TYPE NUMERIC(9,4) USING "plannedPercent"::numeric,
  ALTER COLUMN "actualPercent" TYPE NUMERIC(9,4) USING "actualPercent"::numeric;

ALTER TABLE po_line_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "unitPrice" TYPE NUMERIC(18,4) USING "unitPrice"::numeric;

ALTER TABLE production_consumption
  ALTER COLUMN "consumed_qty" TYPE NUMERIC(18,4) USING "consumed_qty"::numeric,
  ALTER COLUMN "unit_cost" TYPE NUMERIC(18,4) USING "unit_cost"::numeric;

ALTER TABLE production_orders
  ALTER COLUMN "planned_qty" TYPE NUMERIC(18,4) USING "planned_qty"::numeric;

ALTER TABLE production_output
  ALTER COLUMN "output_qty" TYPE NUMERIC(18,4) USING "output_qty"::numeric,
  ALTER COLUMN "output_weight" TYPE NUMERIC(18,4) USING "output_weight"::numeric;

ALTER TABLE production_scrap
  ALTER COLUMN "scrap_qty" TYPE NUMERIC(18,4) USING "scrap_qty"::numeric,
  ALTER COLUMN "sale_value" TYPE NUMERIC(18,2) USING "sale_value"::numeric;

ALTER TABLE purchase_orders
  ALTER COLUMN "unitPrice" TYPE NUMERIC(18,4) USING "unitPrice"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric;

ALTER TABLE quotations
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric;

ALTER TABLE quote_lines
  ALTER COLUMN "unit_price" TYPE NUMERIC(18,4) USING "unit_price"::numeric;

ALTER TABLE raw_materials
  ALTER COLUMN "standard_rate" TYPE NUMERIC(18,4) USING "standard_rate"::numeric;

ALTER TABLE recurring_profiles
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE sales_invoice_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE sales_invoices
  ALTER COLUMN "sub_total" TYPE NUMERIC(18,2) USING "sub_total"::numeric,
  ALTER COLUMN "discount" TYPE NUMERIC(18,2) USING "discount"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric,
  ALTER COLUMN "cgst" TYPE NUMERIC(18,2) USING "cgst"::numeric,
  ALTER COLUMN "sgst" TYPE NUMERIC(18,2) USING "sgst"::numeric,
  ALTER COLUMN "igst" TYPE NUMERIC(18,2) USING "igst"::numeric,
  ALTER COLUMN "gst_total" TYPE NUMERIC(18,2) USING "gst_total"::numeric,
  ALTER COLUMN "round_off" TYPE NUMERIC(18,2) USING "round_off"::numeric,
  ALTER COLUMN "net_amount" TYPE NUMERIC(18,2) USING "net_amount"::numeric,
  ALTER COLUMN "amount_paid" TYPE NUMERIC(18,2) USING "amount_paid"::numeric;

ALTER TABLE sales_payments
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE sales_quotation_items
  ALTER COLUMN "quantity" TYPE NUMERIC(18,4) USING "quantity"::numeric,
  ALTER COLUMN "rate" TYPE NUMERIC(18,4) USING "rate"::numeric,
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE sales_quotations
  ALTER COLUMN "sub_total" TYPE NUMERIC(18,2) USING "sub_total"::numeric,
  ALTER COLUMN "discount" TYPE NUMERIC(18,2) USING "discount"::numeric,
  ALTER COLUMN "gst_rate" TYPE NUMERIC(9,4) USING "gst_rate"::numeric,
  ALTER COLUMN "cgst" TYPE NUMERIC(18,2) USING "cgst"::numeric,
  ALTER COLUMN "sgst" TYPE NUMERIC(18,2) USING "sgst"::numeric,
  ALTER COLUMN "igst" TYPE NUMERIC(18,2) USING "igst"::numeric,
  ALTER COLUMN "gst_total" TYPE NUMERIC(18,2) USING "gst_total"::numeric,
  ALTER COLUMN "round_off" TYPE NUMERIC(18,2) USING "round_off"::numeric,
  ALTER COLUMN "net_amount" TYPE NUMERIC(18,2) USING "net_amount"::numeric;

ALTER TABLE sku_bom
  ALTER COLUMN "qty_per_unit" TYPE NUMERIC(18,6) USING "qty_per_unit"::numeric;

ALTER TABLE skus
  ALTER COLUMN "price" TYPE NUMERIC(18,4) USING "price"::numeric;

ALTER TABLE vendor_payments
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING "amount"::numeric;

ALTER TABLE work_orders
  ALTER COLUMN "contractValue" TYPE NUMERIC(18,2) USING "contractValue"::numeric;
