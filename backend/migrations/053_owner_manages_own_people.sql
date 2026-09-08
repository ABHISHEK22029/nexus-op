-- ══════════════════════════════════════════════════════════════════════
-- 053 — an Owner may manage their own organisation's people
--
-- Roles are loaded from role_definitions/role_permissions at boot, with the
-- definitions in shared/roles.js as the code default. Granting it in code
-- alone would have no effect on this database, whose overlay already exists
-- and does not include it.
--
-- `users` was withheld from Owner deliberately, back when adding a person
-- meant adding them to the PLATFORM. Since migration 052 a user belongs to
-- an organisation and /admin/users is scoped to the caller's, so an Owner
-- sees and edits their own staff and nobody else's. Withholding it now just
-- means the founder of a company cannot add their own employees.
--
-- Read and write, not delete: deactivating somebody is reversible and keeps
-- their history attached to their name; deleting them is neither.
--
-- Administrator remains cross_tenant and cannot be handed out by anyone who
-- does not already hold it — enforced in AdminController.createUser, not
-- here, because a permission row cannot express "may grant, except this".
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role, resource, actions)
VALUES ('Owner', 'users', ARRAY['read','write'])
ON CONFLICT (role, resource) DO UPDATE
  SET actions = ARRAY['read','write'];
