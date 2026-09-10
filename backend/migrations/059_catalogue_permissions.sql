-- ════════════════════════════════════════════════════════════════════
-- Grant the two new resources to the roles that need them.
--
-- role_permissions is an overlay: where a role has rows here, they replace
-- the built-in definition in shared/roles.js entirely rather than adding to
-- it. All seven built-in roles have rows, so adding a resource to the
-- JavaScript alone changes nothing — the Owner of a brand new organisation
-- was refused their own catalogue, which is how this was noticed.
--
-- The same thing happened when Owner was given `users` in migration 053.
--
--   catalogue   is configuration — who the business is in public. It sits
--               with company-profile, so the Owner has it and nobody else
--               does by default.
--
--   enquiries   is sales work. Whoever follows up a lead is whoever quotes
--               it, so Sales gets it alongside quotations; a salesperson
--               who could send a quotation but not read the enquiry that
--               prompted it would be a strange arrangement.
--
-- Viewer reads everything and writes nothing, which is exactly what it
-- should get here: an enquiry is business information.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role, resource, actions, org_id)
VALUES
  ('Owner',       'catalogue',  ARRAY['read','write'],          NULL),
  ('Owner',       'enquiries',  ARRAY['read','write','delete'], NULL),
  ('Sales',       'enquiries',  ARRAY['read','write'],          NULL),
  ('Viewer',      'enquiries',  ARRAY['read'],                  NULL),
  ('Viewer',      'catalogue',  ARRAY['read'],                  NULL),
  -- Administrator is short-circuited in can(), but its rows drive the
  -- Configurator's display, and a resource missing there looks like an
  -- oversight to whoever is building a custom role.
  ('Administrator', 'catalogue', ARRAY['read','write'],          NULL),
  ('Administrator', 'enquiries', ARRAY['read','write','delete'], NULL)
ON CONFLICT DO NOTHING;
