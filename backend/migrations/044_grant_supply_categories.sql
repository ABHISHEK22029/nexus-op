-- ══════════════════════════════════════════════════════════════════
-- 044 — grant the new resource to the roles that already exist
--
-- seedRolePermissions() skips any role that already has rows, by design: it
-- must not overwrite what an administrator has configured. That makes it
-- unable to add a NEW resource to existing roles, which is what this is for
-- (same reason as migration 038).
--
-- Sales and Procurement both get write. A category is created in the act of
-- classifying — somebody typing "Fire doors" against a customer should not
-- first have to go and administer a list — so the roles that classify are
-- the roles that create.
--
-- ON CONFLICT DO NOTHING: an administrator who has already decided
-- something different keeps their decision.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role, resource, actions)
VALUES
  ('Administrator', 'supply-categories', ARRAY['read','write','delete']::TEXT[]),
  ('Owner',         'supply-categories', ARRAY['read','write','delete']::TEXT[]),
  ('Sales',         'supply-categories', ARRAY['read','write','delete']::TEXT[]),
  ('Procurement',   'supply-categories', ARRAY['read','write','delete']::TEXT[]),
  ('Production',    'supply-categories', ARRAY['read']::TEXT[]),
  ('Finance',       'supply-categories', ARRAY['read']::TEXT[]),
  ('Viewer',        'supply-categories', ARRAY['read']::TEXT[])
ON CONFLICT (role, resource) DO NOTHING;
