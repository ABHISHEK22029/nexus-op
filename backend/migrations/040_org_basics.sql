-- ══════════════════════════════════════════════════════════════════
-- 040 — the two things worth asking a new business on day one
--
-- The existing onboarding asks for organisation name, trade name, industry,
-- GSTIN, CIN, PAN, address, state code and bank details before it lets you
-- through. That is a wall. Most of it is only needed the first time you
-- print an invoice, and none of it is needed to look around.
--
-- So first run asks two questions — what is the business called, and how
-- many people work there — and gets out of the way. Everything else moves to
-- the setup-readiness banner, which already explains what is missing, what
-- it costs you, and where to fix it, at the moment it starts to matter.
--
-- employee_count is a band, not a number: nobody knows their exact headcount
-- and an ERP has no business insisting. It is stored as text for that reason.
-- setup_completed_at records that someone answered, so the first-run screen
-- shows once rather than nagging on every sign-in.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS employee_count      TEXT;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS setup_completed_at  TIMESTAMPTZ;

-- This deployment already belongs to a real business that has been using the
-- product, so it is not a new install. Marking it complete keeps the
-- first-run screen from appearing in front of someone mid-work.
UPDATE company_profile
   SET setup_completed_at = COALESCE(setup_completed_at, NOW())
 WHERE name IS NOT NULL AND name <> '';
