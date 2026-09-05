-- ══════════════════════════════════════════════════════════════════════
-- 046 — one company profile per organisation, not one for the whole install
--
-- Every other table that holds business data carries owner_id: vendors,
-- customers, inventory, invoices. company_profile did not. It was a single
-- global row, read everywhere as:
--
--     SELECT * FROM company_profile LIMIT 1
--
-- So the second organisation to use this product would print the FIRST
-- organisation's name, GSTIN and bank details on its invoices. It would
-- also never see the first-run screen: App.jsx sends a user to /welcome
-- only when the profile has no name, and the global row already had one.
-- A new account therefore skipped onboarding entirely and silently adopted
-- somebody else's company identity.
--
-- Also adds the two columns the readiness banner has been asking for and
-- that no column ever existed to hold:
--   · state              — printed on the invoice beside the GSTIN
--   · bank_account_number/branch — invoices print "Not configured" without
--     them, and a customer cannot pay an invoice that does not say where
--     to send the money
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS owner_id INTEGER;

-- The existing row belongs to whoever created the install. Attributed to
-- the lowest-numbered active user rather than a hardcoded 1, so this is
-- correct on a database where that account was removed.
UPDATE company_profile
   SET owner_id = (SELECT MIN(id) FROM users WHERE is_active)
 WHERE owner_id IS NULL;

-- One profile per organisation. Partial, so any legacy row that could not
-- be attributed above does not block the index.
CREATE UNIQUE INDEX IF NOT EXISTS company_profile_owner_uniq
    ON company_profile (owner_id)
 WHERE owner_id IS NOT NULL;

ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS state               TEXT;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_branch         TEXT;

-- Backfill state from the GSTIN, whose first two digits ARE the state code.
-- Nobody should have to type a value the GSTIN already states, and a typed
-- one can disagree with it.
UPDATE company_profile SET state = CASE LEFT(gstin, 2)
  WHEN '01' THEN 'Jammu & Kashmir' WHEN '02' THEN 'Himachal Pradesh'
  WHEN '03' THEN 'Punjab'          WHEN '04' THEN 'Chandigarh'
  WHEN '05' THEN 'Uttarakhand'     WHEN '06' THEN 'Haryana'
  WHEN '07' THEN 'Delhi'           WHEN '08' THEN 'Rajasthan'
  WHEN '09' THEN 'Uttar Pradesh'   WHEN '10' THEN 'Bihar'
  WHEN '19' THEN 'West Bengal'     WHEN '21' THEN 'Odisha'
  WHEN '22' THEN 'Chhattisgarh'    WHEN '23' THEN 'Madhya Pradesh'
  WHEN '24' THEN 'Gujarat'         WHEN '27' THEN 'Maharashtra'
  WHEN '29' THEN 'Karnataka'       WHEN '30' THEN 'Goa'
  WHEN '32' THEN 'Kerala'          WHEN '33' THEN 'Tamil Nadu'
  WHEN '34' THEN 'Puducherry'      WHEN '36' THEN 'Telangana'
  WHEN '37' THEN 'Andhra Pradesh'  WHEN '38' THEN 'Ladakh'
  ELSE NULL END
 WHERE state IS NULL AND COALESCE(gstin, '') <> '';
