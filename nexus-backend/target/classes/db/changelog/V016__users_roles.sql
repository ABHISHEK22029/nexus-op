-- V016__users_roles.sql
-- Module 14: Users, Roles & Permissions — ENTIRE MODULE MISSING
-- Currently: role = useState("Admin") — zero authentication

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    is_system   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the 7 default system roles from the spec
INSERT INTO roles (name, description) VALUES
    ('SUPER_ADMIN',     'Full platform access including org settings'),
    ('ADMIN',           'Full project operations access'),
    ('PROJECT_MANAGER', 'Manages specific assigned projects'),
    ('SITE_ENGINEER',   'Field operations — GRN, MB, milestone updates'),
    ('FINANCE',         'Financial approvals and reporting'),
    ('VENDOR',          'External vendor portal access'),
    ('VIEWER',          'Read-only access to dashboards and reports')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id       INTEGER REFERENCES roles(id),
    designation   TEXT,
    department    TEXT,
    employee_id   TEXT,
    phone         TEXT,
    avatar_url    TEXT,
    status        TEXT DEFAULT 'Active',
    -- status: Active | Inactive | Invited | Suspended
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed one default admin user (password: admin123 — change immediately)
-- bcrypt hash of 'admin123'
INSERT INTO users (full_name, email, password_hash, role_id, status)
VALUES (
    'System Admin',
    'admin@nexusop.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCAgzOdkVeH1ggJ8NqHLH.y',
    (SELECT id FROM roles WHERE name = 'SUPER_ADMIN'),
    'Active'
) ON CONFLICT (email) DO NOTHING;

-- Per-project role overrides (user can be PM on one project, viewer on another)
CREATE TABLE IF NOT EXISTS user_project_roles (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role_id     INTEGER NOT NULL REFERENCES roles(id),
    assigned_by INTEGER REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, project_id)
);
