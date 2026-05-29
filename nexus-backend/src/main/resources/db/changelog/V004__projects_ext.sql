-- V004__projects_ext.sql
-- Module 02: Projects — extend from 4 fields to 29 fields

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name        TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_number    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value     NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_type      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state              TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS district           TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location           TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude           NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude          NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_start      DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_end        DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_start       DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_end         DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_length_km    NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_budget       NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id         INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_contact     TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS engineer_in_charge TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority           TEXT DEFAULT 'Normal';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags               TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes              TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
