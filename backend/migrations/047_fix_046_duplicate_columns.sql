-- ══════════════════════════════════════════════════════════════════════
-- 047 — undo two columns migration 046 should not have added
--
-- 046 added `state` and `bank_account_number` because the readiness banner
-- reported bank details missing and I could not find a state column. Both
-- already existed under different names:
--
--     bank_account_number   duplicates   bank_account_no
--     state                 duplicates   "stateCode"
--
-- The bank one is a straight duplicate. The state one is worse than a
-- duplicate: "stateCode" holds the two-digit GST code, which is what
-- deriveInterstate compares, and a second column holding the state NAME is
-- a second source of truth for one fact — the exact thing that lets a
-- vendor's typed state disagree with its own GSTIN.
--
-- So both are dropped, and "stateCode" is backfilled from the GSTIN, whose
-- first two digits ARE the state code. The name, where a document needs to
-- print it, is looked up from the code.
--
-- Nothing is lost: both columns were added minutes ago by 046 and were
-- never written to by any code path.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE company_profile DROP COLUMN IF EXISTS bank_account_number;
ALTER TABLE company_profile DROP COLUMN IF EXISTS state;

UPDATE company_profile
   SET "stateCode" = LEFT(gstin, 2)
 WHERE COALESCE("stateCode", '') = ''
   AND COALESCE(gstin, '') <> '';
