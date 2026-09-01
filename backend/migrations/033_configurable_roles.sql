-- ══════════════════════════════════════════════════════════════
-- 033 — roles become configurable data instead of code constants
--
-- shared/roles.js defines seven roles and what each may do. That is the
-- right default, but it means changing a permission requires a developer
-- and a deploy — which is not how an ERP is administered. A fabrication
-- company will want its own shapes ("Store Keeper", "Site Supervisor")
-- without waiting on us.
--
-- So the grants move into the database, seeded from exactly the code
-- defaults. Two deliberate safety properties:
--
--   1. THE CODE REMAINS THE FALLBACK. If these tables are missing or empty,
--      can() uses the compiled-in defaults. A failed migration degrades to
--      the previous behaviour rather than to an app where nobody can do
--      anything.
--
--   2. SYSTEM ROLES CANNOT BE DELETED, AND Administrator CANNOT BE EDITED.
--      An admin who removes their own ability to manage users has locked
--      the company out of its own installation with no recovery path short
--      of a database console.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_definitions (
  role         TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  description  TEXT,
  -- System roles ship with the product: editable (except Administrator),
  -- never deletable, because code and docs refer to them by name.
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Sees across every workspace. Only the platform role should have this;
  -- it is the tenancy flag, deliberately separate from capability.
  cross_tenant BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role      TEXT NOT NULL REFERENCES role_definitions(role) ON DELETE CASCADE,
  resource  TEXT NOT NULL,
  -- Subset of read / write / delete. An empty array means explicitly none,
  -- which is different from an absent row only in intent — both deny.
  actions   TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (role, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- An audit trail for permission changes. Who widened access, and when, is
-- the first question asked after something is seen that shouldn't have been.
CREATE TABLE IF NOT EXISTS role_change_log (
  id          SERIAL PRIMARY KEY,
  actor_id    INTEGER,
  actor_email TEXT,
  role        TEXT,
  action      TEXT NOT NULL,          -- created | updated | deleted | assigned
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed the seven built-ins ─────────────────────────────────
-- Seeded here rather than from application code so a fresh database is
-- usable before the server ever starts. ON CONFLICT DO NOTHING makes this
-- safe to re-run and means it never overwrites an admin's later edits.

INSERT INTO role_definitions (role, label, description, is_system, cross_tenant, sort_order) VALUES
  ('Administrator', 'Administrator',
   'Full access across every workspace, including user management. The platform role.',
   TRUE, TRUE, 10),
  ('Owner', 'Owner',
   'Runs their own workspace end to end — sales, buying, production, money. Cannot see other workspaces or manage platform users.',
   TRUE, FALSE, 20),
  ('Sales', 'Sales',
   'Quotes customers, takes orders, raises invoices. Reads stock and production to answer "when can you deliver".',
   TRUE, FALSE, 30),
  ('Procurement', 'Procurement',
   'Buys material — vendors, purchase orders, indents, goods receipt. Cannot approve its own purchase orders.',
   TRUE, FALSE, 40),
  ('Production', 'Production',
   'Runs the shop floor — work orders, production, projects. Reads material availability; cannot buy.',
   TRUE, FALSE, 50),
  ('Finance', 'Finance',
   'Invoices, bills, payments and credit notes. Approves purchase orders.',
   TRUE, FALSE, 60),
  ('Viewer', 'Viewer',
   'Reads everything, changes nothing. For auditors, consultants and the bank.',
   TRUE, FALSE, 70)
ON CONFLICT (role) DO NOTHING;

-- Permissions are seeded by the application on first boot from
-- shared/roles.js, so the two can never disagree at the point of seeding.
-- See seedRolePermissions() there.
