# Nexus-OP — Module Field Specification & Implementation Guide
> Complete field inventory · Gap analysis · DB migration reference · 14 modules · 300+ fields

## Overall Gap Summary

| Module | Existing fields | Missing fields | New tables needed | Priority |
|--------|----------------|---------------|-------------------|----------|
| 01 · Organization Setup | 0 | 25 | 1 | Critical |
| 02 · Projects | 4 | 25 | 0 | Critical |
| 03 · Vendors | 6 | 50 | 3 (bank/sites/contacts) | Critical |
| 04 · Purchase Orders | 8 | 35 | 1 (po_line_items) | Critical |
| 05 · GRN | 10 | 17 | 1 (grn_photos) | High |
| 06 · Indent | 5 | 20 | 0 | Critical |
| 07 · BOQ | 5 | 14 | 0 | Critical |
| 08 · Measurement Book | 7 | 21 | 1 (mb_photos) | Critical |
| 09 · RA Bills | 8 | 23 | 1 (bill_mb_items) | Critical |
| 10 · Work Orders | 5 | 15 | 1 (wo_boq_scope) | High |
| 11 · Inventory | 4 | 18 | 1 (inventory_movements) | Critical |
| 12 · Milestones | 3 | 21 | 2 (photos/deps) | Critical |
| 13 · Expenses | 0 | 30 | 2 (expenses/recurring) | High |
| 14 · Users & RBAC | 0 | 20 | 3 (users/roles/assignments) | Critical |
| TOTAL | ~65 | 300+ | 16 | |

---

## MODULE 01 — Organization Setup

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT,
  industry TEXT,
  logo_url TEXT,
  reg_number TEXT,
  gstin VARCHAR(15),
  pan VARCHAR(10),
  addr_line1 TEXT,
  addr_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode VARCHAR(6),
  country TEXT DEFAULT 'India',
  phone TEXT,
  email TEXT,
  currency TEXT DEFAULT 'INR',
  fy_start TEXT DEFAULT 'April',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  gst_type TEXT,
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  epf_number TEXT,
  esi_number TEXT,
  labour_license TEXT,
  default_retention NUMERIC DEFAULT 5,
  default_tds TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 02 — Projects (4 existing → add 26 cols)

ALTER TABLE projects ADD COLUMN code TEXT;
ALTER TABLE projects ADD COLUMN client_name TEXT;
ALTER TABLE projects ADD COLUMN client_phone TEXT;
ALTER TABLE projects ADD COLUMN client_email TEXT;
ALTER TABLE projects ADD COLUMN manager_id UUID;
ALTER TABLE projects ADD COLUMN engineer_id UUID;
ALTER TABLE projects ADD COLUMN start_date DATE;
ALTER TABLE projects ADD COLUMN end_date DATE;
ALTER TABLE projects ADD COLUMN actual_end_date DATE;
ALTER TABLE projects ADD COLUMN contract_number TEXT;
ALTER TABLE projects ADD COLUMN tender_ref TEXT;
ALTER TABLE projects ADD COLUMN contract_value NUMERIC;
ALTER TABLE projects ADD COLUMN contingency NUMERIC;
ALTER TABLE projects ADD COLUMN latitude NUMERIC;
ALTER TABLE projects ADD COLUMN longitude NUMERIC;
ALTER TABLE projects ADD COLUMN site_address TEXT;
ALTER TABLE projects ADD COLUMN state TEXT;
ALTER TABLE projects ADD COLUMN district TEXT;
ALTER TABLE projects ADD COLUMN chainage_range TEXT;
ALTER TABLE projects ADD COLUMN funding_agency TEXT;
ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT 'Normal';
ALTER TABLE projects ADD COLUMN tags JSONB DEFAULT '[]';
ALTER TABLE projects ADD COLUMN created_by UUID;
ALTER TABLE projects ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE projects ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;

---

## MODULE 03 — Vendors (6 existing → add 44 cols + 3 new tables)

-- Main table additions (44 columns)
ALTER TABLE vendors ADD COLUMN salutation TEXT;
ALTER TABLE vendors ADD COLUMN contact_first TEXT;
ALTER TABLE vendors ADD COLUMN contact_last TEXT;
ALTER TABLE vendors ADD COLUMN contact_designation TEXT;
ALTER TABLE vendors ADD COLUMN display_name TEXT;
ALTER TABLE vendors ADD COLUMN mobile TEXT;
ALTER TABLE vendors ADD COLUMN whatsapp TEXT;
ALTER TABLE vendors ADD COLUMN website TEXT;
ALTER TABLE vendors ADD COLUMN language TEXT DEFAULT 'English';
ALTER TABLE vendors ADD COLUMN gstin VARCHAR(15);
ALTER TABLE vendors ADD COLUMN pan VARCHAR(10);
ALTER TABLE vendors ADD COLUMN tan TEXT;
ALTER TABLE vendors ADD COLUMN gst_treatment TEXT;
ALTER TABLE vendors ADD COLUMN is_msme BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN msme_number TEXT;
ALTER TABLE vendors ADD COLUMN tds_section TEXT;
ALTER TABLE vendors ADD COLUMN tds_rate NUMERIC;
ALTER TABLE vendors ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE vendors ADD COLUMN payment_terms TEXT DEFAULT 'Due on Receipt';
ALTER TABLE vendors ADD COLUMN retention_pct NUMERIC DEFAULT 5;
ALTER TABLE vendors ADD COLUMN opening_balance NUMERIC DEFAULT 0;
ALTER TABLE vendors ADD COLUMN ap_account TEXT;
ALTER TABLE vendors ADD COLUMN portal_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN max_contract_val NUMERIC;
ALTER TABLE vendors ADD COLUMN credit_limit NUMERIC;
ALTER TABLE vendors ADD COLUMN addr_line2 TEXT;
ALTER TABLE vendors ADD COLUMN city TEXT;
ALTER TABLE vendors ADD COLUMN state TEXT;
ALTER TABLE vendors ADD COLUMN pincode VARCHAR(6);
ALTER TABLE vendors ADD COLUMN country TEXT DEFAULT 'India';
ALTER TABLE vendors ADD COLUMN service_radius INTEGER;
ALTER TABLE vendors ADD COLUMN epf_number TEXT;
ALTER TABLE vendors ADD COLUMN esi_number TEXT;
ALTER TABLE vendors ADD COLUMN labour_license TEXT;
ALTER TABLE vendors ADD COLUMN iso_cert TEXT;
ALTER TABLE vendors ADD COLUMN iso_expiry DATE;
ALTER TABLE vendors ADD COLUMN contractor_class TEXT;
ALTER TABLE vendors ADD COLUMN safety_rating CHAR(1);
ALTER TABLE vendors ADD COLUMN empanelled_at DATE;
ALTER TABLE vendors ADD COLUMN agreement_expiry DATE;
ALTER TABLE vendors ADD COLUMN performance_score NUMERIC;
ALTER TABLE vendors ADD COLUMN is_blacklisted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN blacklist_reason TEXT;
ALTER TABLE vendors ADD COLUMN deleted_at TIMESTAMPTZ;

-- NEW: vendor_bank_accounts
CREATE TABLE vendor_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  micr_code VARCHAR(9),
  branch_name TEXT,
  cheque_url TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NEW: vendor_contact_persons
CREATE TABLE vendor_contact_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  salutation TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  email TEXT,
  mobile TEXT,
  whatsapp TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 04 — Purchase Orders (8 existing → add 30 cols + po_line_items table)

ALTER TABLE purchase_orders ADD COLUMN po_number TEXT;
ALTER TABLE purchase_orders ADD COLUMN po_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE purchase_orders ADD COLUMN reference TEXT;
ALTER TABLE purchase_orders ADD COLUMN indent_id UUID;
ALTER TABLE purchase_orders ADD COLUMN work_order_id UUID;
ALTER TABLE purchase_orders ADD COLUMN delivery_type TEXT DEFAULT 'Organisation';
ALTER TABLE purchase_orders ADD COLUMN delivery_address TEXT;
ALTER TABLE purchase_orders ADD COLUMN expected_delivery DATE;
ALTER TABLE purchase_orders ADD COLUMN payment_terms TEXT;
ALTER TABLE purchase_orders ADD COLUMN shipment_pref TEXT;
ALTER TABLE purchase_orders ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE purchase_orders ADD COLUMN notes TEXT;
ALTER TABLE purchase_orders ADD COLUMN terms TEXT;
ALTER TABLE purchase_orders ADD COLUMN approved_by UUID;
ALTER TABLE purchase_orders ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN dispatched_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN cancel_reason TEXT;
ALTER TABLE purchase_orders ADD COLUMN created_by UUID;
ALTER TABLE purchase_orders ADD COLUMN sub_total NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN total_discount NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN total_gst NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN tds_section TEXT;
ALTER TABLE purchase_orders ADD COLUMN tds_amount NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN adjustment NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN grand_total NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN advance_paid NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN balance NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE purchase_orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE purchase_orders ADD COLUMN deleted_at TIMESTAMPTZ;

-- NEW: po_line_items
CREATE TABLE po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  boq_item_id UUID,
  description TEXT NOT NULL,
  item_code TEXT,
  hsn_code TEXT,
  unit TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  rate NUMERIC NOT NULL,
  discount_pct NUMERIC DEFAULT 0,
  gst_rate NUMERIC DEFAULT 18,
  taxable_amount NUMERIC DEFAULT 0,
  cgst_amount NUMERIC DEFAULT 0,
  sgst_amount NUMERIC DEFAULT 0,
  igst_amount NUMERIC DEFAULT 0,
  line_total NUMERIC DEFAULT 0,
  gl_account TEXT,
  sort_order INTEGER DEFAULT 0
);

---

## MODULE 05 — GRN (10 existing → add 17 cols + grn_photos)

ALTER TABLE grn ADD COLUMN grn_number TEXT;
ALTER TABLE grn ADD COLUMN grn_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE grn ADD COLUMN challan_number TEXT;
ALTER TABLE grn ADD COLUMN challan_date DATE;
ALTER TABLE grn ADD COLUMN vehicle_number TEXT;
ALTER TABLE grn ADD COLUMN driver_name TEXT;
ALTER TABLE grn ADD COLUMN received_by UUID;
ALTER TABLE grn ADD COLUMN boq_item_id UUID;
ALTER TABLE grn ADD COLUMN unit TEXT;
ALTER TABLE grn ADD COLUMN ordered_qty NUMERIC;
ALTER TABLE grn ADD COLUMN rejected_qty NUMERIC DEFAULT 0;
ALTER TABLE grn ADD COLUMN shortfall_qty NUMERIC DEFAULT 0;
ALTER TABLE grn ADD COLUMN shortfall_reason TEXT;
ALTER TABLE grn ADD COLUMN qc_status TEXT DEFAULT 'Pending';
ALTER TABLE grn ADD COLUMN qc_inspector UUID;
ALTER TABLE grn ADD COLUMN qc_remarks TEXT;
ALTER TABLE grn ADD COLUMN storage_location TEXT;
ALTER TABLE grn ADD COLUMN challan_file_url TEXT;
ALTER TABLE grn ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE grn_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  caption TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 06 — Indent (5 existing → add 19 cols)

ALTER TABLE indents ADD COLUMN indent_number TEXT;
ALTER TABLE indents ADD COLUMN indent_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE indents ADD COLUMN boq_item_id UUID;
ALTER TABLE indents ADD COLUMN raised_by UUID;
ALTER TABLE indents ADD COLUMN site_engineer UUID;
ALTER TABLE indents ADD COLUMN item_code TEXT;
ALTER TABLE indents ADD COLUMN unit TEXT;
ALTER TABLE indents ADD COLUMN net_required NUMERIC;
ALTER TABLE indents ADD COLUMN required_by DATE;
ALTER TABLE indents ADD COLUMN urgency TEXT DEFAULT 'Routine';
ALTER TABLE indents ADD COLUMN purpose TEXT;
ALTER TABLE indents ADD COLUMN preferred_vendor UUID;
ALTER TABLE indents ADD COLUMN estimated_rate NUMERIC;
ALTER TABLE indents ADD COLUMN estimated_total NUMERIC;
ALTER TABLE indents ADD COLUMN approved_by UUID;
ALTER TABLE indents ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE indents ADD COLUMN rejection_reason TEXT;
ALTER TABLE indents ADD COLUMN po_id UUID;
ALTER TABLE indents ADD COLUMN remarks TEXT;

---

## MODULE 07 — BOQ (5-6 existing → add 14 cols)

ALTER TABLE boq_items ADD COLUMN chapter TEXT;
ALTER TABLE boq_items ADD COLUMN specification TEXT;
ALTER TABLE boq_items ADD COLUMN contract_value NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN executed_qty NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN executed_value NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN progress_pct NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN pending_qty NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN procured_qty NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN procured_value NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN is_variation BOOLEAN DEFAULT FALSE;
ALTER TABLE boq_items ADD COLUMN vo_reference TEXT;
ALTER TABLE boq_items ADD COLUMN remarks TEXT;
ALTER TABLE boq_items ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

---

## MODULE 08 — Measurement Book (7 existing → add 21 cols + mb_photos)

ALTER TABLE mb_entries ADD COLUMN mb_number TEXT;
ALTER TABLE mb_entries ADD COLUMN mb_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE mb_entries ADD COLUMN "projectId" UUID;
ALTER TABLE mb_entries ADD COLUMN description TEXT;
ALTER TABLE mb_entries ADD COLUMN chainage_from TEXT;
ALTER TABLE mb_entries ADD COLUMN chainage_to TEXT;
ALTER TABLE mb_entries ADD COLUMN no_of_units INTEGER;
ALTER TABLE mb_entries ADD COLUMN unit TEXT;
ALTER TABLE mb_entries ADD COLUMN rate NUMERIC;
ALTER TABLE mb_entries ADD COLUMN measured_by UUID;
ALTER TABLE mb_entries ADD COLUMN witness_by UUID;
ALTER TABLE mb_entries ADD COLUMN client_rep TEXT;
ALTER TABLE mb_entries ADD COLUMN status TEXT DEFAULT 'Draft';
ALTER TABLE mb_entries ADD COLUMN approved_by UUID;
ALTER TABLE mb_entries ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE mb_entries ADD COLUMN rejection_reason TEXT;
ALTER TABLE mb_entries ADD COLUMN latitude NUMERIC;
ALTER TABLE mb_entries ADD COLUMN longitude NUMERIC;
ALTER TABLE mb_entries ADD COLUMN bill_id UUID;
ALTER TABLE mb_entries ADD COLUMN is_billed BOOLEAN DEFAULT FALSE;
ALTER TABLE mb_entries ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE mb_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mb_id UUID NOT NULL REFERENCES mb_entries(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  caption TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 09 — RA Bills (8 existing → add 23 cols + bill_mb_items)

ALTER TABLE bills ADD COLUMN bill_number TEXT;
ALTER TABLE bills ADD COLUMN bill_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE bills ADD COLUMN period_from DATE;
ALTER TABLE bills ADD COLUMN period_to DATE;
ALTER TABLE bills ADD COLUMN ra_number INTEGER;
ALTER TABLE bills ADD COLUMN project_id UUID;
ALTER TABLE bills ADD COLUMN work_order_id UUID;
ALTER TABLE bills ADD COLUMN vendor_id UUID;
ALTER TABLE bills ADD COLUMN gross_amount NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN cumulative_previous NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN current_amount NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN retention_amount NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN advance_recovery NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN tds_section TEXT;
ALTER TABLE bills ADD COLUMN tds_amount NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN other_deductions NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN deduction_reason TEXT;
ALTER TABLE bills ADD COLUMN net_payable NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN submitted_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN submitted_by UUID;
ALTER TABLE bills ADD COLUMN approved_by UUID;
ALTER TABLE bills ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN rejection_reason TEXT;
ALTER TABLE bills ADD COLUMN payment_mode TEXT;
ALTER TABLE bills ADD COLUMN payment_reference TEXT;
ALTER TABLE bills ADD COLUMN payment_date DATE;
ALTER TABLE bills ADD COLUMN paid_amount NUMERIC DEFAULT 0;

CREATE TABLE bill_mb_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  mb_entry_id UUID NOT NULL,
  boq_item_id UUID,
  description TEXT,
  unit TEXT,
  quantity NUMERIC,
  rate NUMERIC,
  amount NUMERIC DEFAULT 0
);

---

## MODULE 10 — Work Orders (5 existing → add 15 cols + wo_boq_scope)

Fields to add: wo_number, wo_date, scope_description, start_date, end_date,
contract_type (Labour/Material/Composite), contract_value, advance_amount,
retention_pct, tds_section, status_notes, completed_at, created_by, updated_at, deleted_at

CREATE TABLE wo_boq_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL,
  boq_item_id UUID NOT NULL,
  scoped_quantity NUMERIC,
  completed_quantity NUMERIC DEFAULT 0
);

---

## MODULE 11 — Inventory (4 existing → add 18 cols + inventory_movements)

Fields to add: item_code, hsn_code, category, unit, min_stock_level (alert threshold),
max_stock_level, reorder_point, last_received_date, last_issued_date, avg_rate,
total_value (qty × avg_rate), boq_item_id, project_id (multi-project), location, remarks, updated_at

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL,
  movement_type TEXT NOT NULL,  -- RECEIPT / ISSUE / RETURN / ADJUSTMENT
  reference_type TEXT,          -- GRN / INDENT / MANUAL
  reference_id UUID,
  quantity NUMERIC NOT NULL,
  rate NUMERIC,
  value NUMERIC,
  performed_by UUID,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 12 — Milestones (3 existing → add 21 cols + milestone_photos + milestone_dependencies)

Fields to add: milestone_number, project_id, work_order_id, planned_date, actual_date,
planned_value (₹ linked to contract), actual_value, completion_pct, status (Pending/Achieved/Delayed/Waived),
delay_reason, client_acknowledged (boolean), client_ack_date, payment_trigger (boolean),
payment_amount, approved_by, approved_at, latitude, longitude, created_by, created_at, updated_at

CREATE TABLE milestone_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE milestone_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL,
  depends_on_milestone_id UUID NOT NULL
);

---

## MODULE 13 — Expenses (0 existing → entirely new)

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  project_id UUID,
  work_order_id UUID,
  category TEXT NOT NULL,  -- Labour/Travel/Equipment/Misc/Site Overhead
  sub_category TEXT,
  description TEXT NOT NULL,
  vendor_id UUID,
  vendor_name TEXT,
  amount NUMERIC NOT NULL,
  gst_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  payment_mode TEXT,
  payment_reference TEXT,
  receipt_url TEXT,
  incurred_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'Draft',
  rejection_reason TEXT,
  is_billable BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_period TEXT,
  budget_head TEXT,
  gl_account TEXT,
  remarks TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

---

## MODULE 14 — Users & RBAC (0 existing → entirely new)

Roles: Admin / Project Manager / Site Engineer / Finance / Procurement / Viewer

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  employee_id TEXT,
  designation TEXT,
  department TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- Admin/PM/Engineer/Finance/Procurement/Viewer
  description TEXT,
  permissions JSONB DEFAULT '{}'
);

CREATE TABLE user_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);
