-- ══════════════════════════════════════════════════════════════════════
-- 055 — a company may define its own roles
--
-- role_definitions and role_permissions were global. Every organisation on
-- the install shared one set, so an Owner widening "Sales" would widen it
-- for every other business — which is why /admin/roles had to stay with the
-- platform administrator, and why an Owner could assign the seven built-in
-- roles and never create an eighth.
--
-- That is a real limit for the product. A fabricator wants "Store keeper";
-- a furniture maker wants "Fitter". Neither is in a list somebody else drew
-- up, and neither should require a developer.
--
-- So a role now belongs to an organisation, or to nobody:
--
--   org_id IS NULL   a built-in role, offered to every organisation
--   org_id = 42      a role organisation 42 created, invisible to others
--
-- A custom role can never be cross_tenant. That flag means "reads every
-- business on the install", and no company gets to award that to itself —
-- it is enforced with a CHECK here as well as in the controller, because a
-- privilege escalation should not depend on one code path being right.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE role_definitions ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS org_id INTEGER;

-- Everything that exists today is built-in and stays available to everyone.
UPDATE role_definitions SET org_id = NULL WHERE org_id IS NOT NULL;

-- A company may not award itself the platform-wide role.
ALTER TABLE role_definitions DROP CONSTRAINT IF EXISTS role_definitions_org_not_cross_tenant;
ALTER TABLE role_definitions ADD  CONSTRAINT role_definitions_org_not_cross_tenant
  CHECK (org_id IS NULL OR cross_tenant IS NOT TRUE);

/* The old primary key was the role name alone, which cannot hold two
   organisations both calling something "Foreman". Identity is now the pair.
   Two partial uniques rather than one on COALESCE(org_id,0), so a built-in
   name stays unique on its own and the planner can use either. */
ALTER TABLE role_definitions DROP CONSTRAINT IF EXISTS role_definitions_pkey CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS role_definitions_builtin_uniq
    ON role_definitions (role) WHERE org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS role_definitions_org_uniq
    ON role_definitions (org_id, role) WHERE org_id IS NOT NULL;

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_pkey CASCADE;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_resource_key CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_builtin_uniq
    ON role_permissions (role, resource) WHERE org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_org_uniq
    ON role_permissions (org_id, role, resource) WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS role_definitions_org_idx ON role_definitions (org_id);
CREATE INDEX IF NOT EXISTS role_permissions_org_idx ON role_permissions (org_id);

COMMENT ON COLUMN role_definitions.org_id IS
  'NULL for a built-in role available to every organisation; otherwise the organisation that created it. A custom role can never be cross_tenant.';
