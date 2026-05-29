-- V002__ui_config.sql
-- Dynamic UI Configuration Engine
-- Run a SQL UPDATE on this table to instantly change React UI without redeploy

CREATE TABLE IF NOT EXISTS ui_config (
    id          SERIAL PRIMARY KEY,
    config_key  TEXT NOT NULL UNIQUE,
    module      TEXT NOT NULL,
    component   TEXT NOT NULL,
    config_type TEXT NOT NULL,
    -- config_type options:
    --   field_label | field_placeholder | field_hint | field_visibility
    --   section_visibility | feature_flag | dropdown_options
    --   button_text | page_title | image | banner | table_columns
    value       JSONB NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    updated_by  TEXT DEFAULT 'system',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ui_config_module
    ON ui_config(module, is_active);

CREATE INDEX IF NOT EXISTS idx_ui_config_component
    ON ui_config(component, is_active);

-- Auto-update updated_at timestamp
CREATE TRIGGER trg_ui_config_updated_at
    BEFORE UPDATE ON ui_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- pg_notify trigger: fires when any config is changed
-- Spring Boot listens on channel 'ui_config_changed'
-- → broadcasts change via WebSocket → React updates live
CREATE OR REPLACE FUNCTION notify_ui_config_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'ui_config_changed',
        json_build_object(
            'config_key', NEW.config_key,
            'module',     NEW.module,
            'component',  NEW.component,
            'updated_at', NOW()
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ui_config_notify
    AFTER INSERT OR UPDATE ON ui_config
    FOR EACH ROW EXECUTE FUNCTION notify_ui_config_change();
