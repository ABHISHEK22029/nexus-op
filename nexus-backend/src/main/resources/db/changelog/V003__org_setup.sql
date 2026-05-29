-- V003__org_setup.sql
-- Module 01: Organization Setup (ENTIRE MODULE MISSING)

CREATE TABLE IF NOT EXISTS organizations (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    display_name        TEXT,
    industry            TEXT,
    logo_url            TEXT,
    reg_number          TEXT,
    gstin               VARCHAR(15),
    pan                 VARCHAR(10),
    addr_line1          TEXT,
    addr_line2          TEXT,
    city                TEXT,
    state               TEXT,
    pincode             VARCHAR(6),
    country             TEXT DEFAULT 'India',
    phone               TEXT,
    email               TEXT,
    currency            TEXT DEFAULT 'INR',
    fy_start            TEXT DEFAULT 'April',
    timezone            TEXT DEFAULT 'Asia/Kolkata',
    gst_type            TEXT,
    date_format         TEXT DEFAULT 'DD/MM/YYYY',
    epf_number          TEXT,
    esi_number          TEXT,
    labour_license      TEXT,
    default_retention   NUMERIC DEFAULT 5,
    default_tds         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
