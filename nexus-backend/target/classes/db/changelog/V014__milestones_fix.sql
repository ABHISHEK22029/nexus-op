-- V014__milestones_fix.sql
-- Module 12: Milestones — CRITICAL FIX
-- actual_pct and planned_pct don't exist → Dashboard S-curve uses Math.random()
-- This migration adds the real columns that fix the fake S-curve

ALTER TABLE milestones ADD COLUMN IF NOT EXISTS project_id         INTEGER REFERENCES projects(id);
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS code               TEXT;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS milestone_type     TEXT DEFAULT 'Physical';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS planned_start      DATE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS planned_end        DATE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS actual_start       DATE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS actual_end         DATE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS planned_pct        NUMERIC DEFAULT 0;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS actual_pct         NUMERIC DEFAULT 0;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS cumulative_planned NUMERIC DEFAULT 0;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS cumulative_actual  NUMERIC DEFAULT 0;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS delay_reason       TEXT;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS delay_days         INTEGER DEFAULT 0;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS financial_value    NUMERIC;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS parent_id          INTEGER REFERENCES milestones(id);
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS progress_remarks   TEXT;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS updated_by         INTEGER;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_milestones_updated_at
    BEFORE UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Milestone progress photos
CREATE TABLE IF NOT EXISTS milestone_photos (
    id          SERIAL PRIMARY KEY,
    milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    photo_url   TEXT NOT NULL,
    caption     TEXT,
    uploaded_by INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Milestone dependencies (predecessor → successor graph)
CREATE TABLE IF NOT EXISTS milestone_deps (
    id              SERIAL PRIMARY KEY,
    milestone_id    INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    depends_on_id   INTEGER NOT NULL REFERENCES milestones(id),
    lag_days        INTEGER DEFAULT 0,
    UNIQUE(milestone_id, depends_on_id)
);
