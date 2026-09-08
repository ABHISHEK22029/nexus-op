-- ══════════════════════════════════════════════════════════════════════
-- 052 — an organisation is a group of people, not a single login
--
-- There was no organisation. Every business table carries owner_id, and
-- owner_id has always meant "the user who created this row" — so each
-- account was its own island. Add an employee and they would create data
-- their own employer could not see, and see none of the company's own
-- customers, vendors or stock.
--
-- That is why the flow a founder expects does not exist: sign up, name the
-- company, add your people, give them roles. The people can be added; they
-- simply do not end up in the same company.
--
-- The smallest correct change is to say which organisation a user belongs
-- to, and to scope data by THAT rather than by whoever happened to type it
-- in. An organisation is identified by the id of the person who created it,
-- so no new identifier is invented and every existing owner_id keeps
-- pointing at exactly the right organisation.
--
--   founder            org_id = their own id
--   employee added     org_id = the founder's id
--
-- Nothing about existing rows changes meaning: every current user is a
-- founder of a one-person organisation, which is what they already were.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id INTEGER;

-- Everyone who exists today founded their own organisation.
UPDATE users SET org_id = id WHERE org_id IS NULL;

ALTER TABLE users ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS users_org_id_idx ON users (org_id);

COMMENT ON COLUMN users.org_id IS
  'The organisation this user belongs to, identified by the id of the user who created it. A founder''s org_id equals their own id. Business data is scoped on this, not on the id of whoever created the row.';

-- The company profile belongs to the organisation, so its owner_id is an
-- org_id too. Already true — every profile was created by a founder — but
-- stated so the meaning does not drift.
COMMENT ON COLUMN company_profile.owner_id IS
  'The organisation this profile describes (users.org_id).';
