-- V005__vendors_ext.sql
-- Module 03: Vendors — extend from 9 fields to 53 fields + 3 new tables

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS display_name        TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_code         TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS mobile              TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS whatsapp            TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS website             TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gstin               VARCHAR(15);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan                 VARCHAR(10);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_treatment       TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tds_section         TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tds_rate            NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'INR';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS retention_pct       NUMERIC DEFAULT 5;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms       TEXT DEFAULT 'Due on Receipt';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS credit_limit        NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_msme             BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS msme_number         TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS msme_type           TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_blacklisted      BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS blacklist_reason    TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS addr_line1          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS addr_line2          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city                TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS state               TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pincode             VARCHAR(6);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS latitude            NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS longitude           NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contractor_class    TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS capability_scope    TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS safety_rating       CHAR(1);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS quality_score       INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS on_time_pct         NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS defect_rate_pct     NUMERIC;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS agreement_date      DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS agreement_expiry    DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS empanelled_at       DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS iso_cert            TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS iso_expiry          DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS epf_number          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS esi_number          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS labour_license      TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS labour_license_exp  DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pf_registered       BOOLEAN DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ;

CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: vendor bank accounts (multiple per vendor)
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
    id               SERIAL PRIMARY KEY,
    vendor_id        INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    bank_name        TEXT NOT NULL,
    account_holder   TEXT NOT NULL,
    account_number   TEXT NOT NULL,
    account_type     TEXT NOT NULL,
    ifsc_code        VARCHAR(11) NOT NULL,
    micr_code        VARCHAR(9),
    branch_name      TEXT,
    branch_address   TEXT,
    cheque_url       TEXT,
    is_primary       BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- New table: vendor contact persons (multiple per vendor)
CREATE TABLE IF NOT EXISTS vendor_contacts (
    id           SERIAL PRIMARY KEY,
    vendor_id    INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    salutation   TEXT,
    first_name   TEXT,
    last_name    TEXT,
    role         TEXT,
    email        TEXT,
    mobile       TEXT,
    whatsapp     TEXT,
    is_primary   BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- New table: vendor ↔ project site mapping
CREATE TABLE IF NOT EXISTS vendor_sites (
    id              SERIAL PRIMARY KEY,
    vendor_id       INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_label      TEXT,
    mobilised_date  DATE,
    demobilised_date DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE(vendor_id, project_id)
);
