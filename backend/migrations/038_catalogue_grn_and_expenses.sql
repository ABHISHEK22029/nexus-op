-- ══════════════════════════════════════════════════════════════════
-- 038 — catalogue the two resources that were routed but never listed
--
-- /grn and /expenses had routes, controllers and data (177 expense rows,
-- 4 goods receipts) but no entry in the RESOURCES catalogue in
-- shared/roles.js. permissionsFor() builds the map the UI gates on by
-- walking that catalogue, so both screens were unreachable for EVERY role
-- — the Administrator was shown "your role doesn't cover viewing grn"
-- while the API served the rows without complaint.
--
-- Server-side can() was never wrong: it short-circuits Administrator and
-- falls through to grants for everyone else. Only the map was incomplete,
-- so this was a lockout, never a leak.
--
-- seedRolePermissions() skips any role that already has rows, by design —
-- it must not overwrite what an administrator has configured. That makes it
-- useless for adding a NEW resource to roles that already exist, which is
-- what this migration is for.
--
-- ON CONFLICT DO NOTHING throughout: if an administrator has already
-- granted either resource by hand, their decision stands.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role, resource, actions)
VALUES
  ('Administrator', 'grn',      ARRAY['read','write','delete']::TEXT[]),
  ('Administrator', 'expenses', ARRAY['read','write','delete']::TEXT[]),
  ('Owner',         'grn',      ARRAY['read','write','delete']::TEXT[]),
  ('Owner',         'expenses', ARRAY['read','write','delete']::TEXT[]),
  -- Procurement's own description says "goods receipt"; it was the one
  -- role that most obviously should have had this.
  ('Procurement',   'grn',      ARRAY['read','write','delete']::TEXT[]),
  -- Production reads procurement, so it can see what has landed.
  ('Production',    'grn',      ARRAY['read']::TEXT[]),
  ('Finance',       'expenses', ARRAY['read','write','delete']::TEXT[]),
  ('Finance',       'grn',      ARRAY['read']::TEXT[]),
  ('Viewer',        'grn',      ARRAY['read']::TEXT[]),
  ('Viewer',        'expenses', ARRAY['read']::TEXT[])
ON CONFLICT (role, resource) DO NOTHING;

-- Sales deliberately gets neither: it has no procurement grant beyond
-- reading vendors, and off-PO spend is a finance concern.
