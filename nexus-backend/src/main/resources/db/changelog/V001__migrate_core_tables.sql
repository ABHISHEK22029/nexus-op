-- V001__migrate_core_tables.sql
-- Recreates all existing SQLite tables in PostgreSQL
-- Existing data will be loaded separately by migrate_sqlite_to_postgres.js

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- 1. PROJECTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    "clientName" TEXT,
    type        TEXT NOT NULL,
    "startDate" TEXT,
    "endDate"   TEXT,
    status      TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. VENDORS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    id                  SERIAL PRIMARY KEY,
    "projectId"         INTEGER REFERENCES projects(id),
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,
    pan                 TEXT,
    gstin               TEXT,
    class               TEXT,
    capability_tags     TEXT,
    rating              INTEGER,
    status              TEXT DEFAULT 'Active',
    -- legacy fields from original schema
    contact_name        TEXT,
    email               TEXT,
    phone               TEXT,
    address             TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. WORK ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
    id              SERIAL PRIMARY KEY,
    "projectId"     INTEGER REFERENCES projects(id),
    "vendorId"      INTEGER REFERENCES vendors(id),
    name            TEXT NOT NULL,
    "boqId"         INTEGER,
    "startDate"     TEXT,
    "endDate"       TEXT,
    "contractValue" NUMERIC,
    status          TEXT,
    description     TEXT,
    value           NUMERIC,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 4. MILESTONES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
    id                SERIAL PRIMARY KEY,
    "workOrderId"     INTEGER REFERENCES work_orders(id),
    "projectId"       INTEGER REFERENCES projects(id),
    name              TEXT,
    "plannedPercent"  NUMERIC,
    "actualPercent"   NUMERIC,
    status            TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 5. BOQ ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_items (
    id                  SERIAL PRIMARY KEY,
    "projectId"         INTEGER NOT NULL REFERENCES projects(id),
    "itemCode"          TEXT NOT NULL,
    description         TEXT NOT NULL,
    unit                TEXT NOT NULL,
    "estimatedQuantity" NUMERIC NOT NULL,
    rate                NUMERIC NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 6. INDENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indents (
    id                  SERIAL PRIMARY KEY,
    "projectId"         INTEGER REFERENCES projects(id),
    "workOrderId"       INTEGER REFERENCES work_orders(id),
    "boqId"             INTEGER REFERENCES boq_items(id),
    item                TEXT,
    "requestedQuantity" NUMERIC,
    quantity            NUMERIC,
    "requiredDate"      TEXT,
    chainage            TEXT,
    status              TEXT DEFAULT 'Pending',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 7. PURCHASE ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
    id            SERIAL PRIMARY KEY,
    "projectId"   INTEGER REFERENCES projects(id),
    "workOrderId" INTEGER REFERENCES work_orders(id),
    "vendorId"    INTEGER REFERENCES vendors(id),
    "itemName"    TEXT,
    quantity      NUMERIC,
    "indentId"    INTEGER REFERENCES indents(id),
    status        TEXT DEFAULT 'Pending',
    rate          NUMERIC,
    total         NUMERIC,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 8. GRN
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grn (
    id                 SERIAL PRIMARY KEY,
    "projectId"        INTEGER REFERENCES projects(id),
    "workOrderId"      INTEGER REFERENCES work_orders(id),
    "poId"             INTEGER REFERENCES purchase_orders(id),
    "vendorId"         INTEGER REFERENCES vendors(id),
    "vehicleNumber"    TEXT,
    "batchNumber"      TEXT,
    "itemName"         TEXT,
    chainage           TEXT,
    "receivedQuantity" NUMERIC,
    quantity           NUMERIC,
    date               TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 9. MEASUREMENT BOOK
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mb_entries (
    id                 SERIAL PRIMARY KEY,
    "projectId"        INTEGER REFERENCES projects(id),
    "workOrderId"      INTEGER REFERENCES work_orders(id),
    "boqItemId"        INTEGER REFERENCES boq_items(id),
    "boqId"            INTEGER,
    chainage           TEXT,
    length             NUMERIC,
    width              NUMERIC,
    depth              NUMERIC,
    "measuredQuantity" NUMERIC,
    quantity           NUMERIC,
    remarks            TEXT,
    date               TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 10. BILLS (RA Bills)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
    id               SERIAL PRIMARY KEY,
    "projectId"      INTEGER REFERENCES projects(id),
    "workOrderId"    INTEGER REFERENCES work_orders(id),
    "grossAmount"    NUMERIC NOT NULL DEFAULT 0,
    tds              NUMERIC NOT NULL DEFAULT 0,
    retention        NUMERIC NOT NULL DEFAULT 0,
    "netAmount"      NUMERIC NOT NULL DEFAULT 0,
    "retentionPct"   NUMERIC DEFAULT 5,
    "billedQuantity" NUMERIC DEFAULT 0,
    status           TEXT DEFAULT 'Draft',
    date             TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 11. INVENTORY
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
    id          SERIAL PRIMARY KEY,
    "projectId" INTEGER REFERENCES projects(id),
    "itemName"  TEXT NOT NULL,
    quantity    NUMERIC NOT NULL DEFAULT 0,
    unit        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 12. ACTIVITIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
    id          SERIAL PRIMARY KEY,
    "projectId" INTEGER REFERENCES projects(id),
    description TEXT NOT NULL,
    type        TEXT NOT NULL,
    "userId"    INTEGER,
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Shared update_timestamp function (used by later migrations)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
