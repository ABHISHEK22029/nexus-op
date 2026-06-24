-- Optional, user-configurable deduction heads (off by default)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS gst_tds REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS gst_tds_rate REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS labour_cess REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS labour_cess_rate REAL DEFAULT 0;
