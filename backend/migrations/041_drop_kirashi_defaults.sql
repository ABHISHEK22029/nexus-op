-- ══════════════════════════════════════════════════════════════════
-- 041 — a new business is not Kirashi
--
-- Every identity column on company_profile carried one specific company's
-- real data as its DEFAULT:
--
--     name       'Kirashi Business Synergies Private Limited'
--     tradeName  'Kirashi'
--     address    '6-148/1, Bowrampet, ... Telangana 500043'
--     phone      '+91 9030498359'
--     email      'info@kirashi.in'
--     gstin      '36AAMCK2569F1Z9'
--     pan        'AAMCK2569F'
--     stateCode  '36'
--
-- Any row inserted without naming those columns inherited them. The
-- first-run screen asks for a name and inserts it — and the row came back
-- carrying Kirashi's trade name, address, GSTIN and PAN. The top bar then
-- showed "Kirashi" to a business that had just told the product it was
-- called something else, which is how this was found.
--
-- The trade name on screen is the least of it. gstin and pan appear on every
-- tax invoice this product generates. A second business issuing invoices
-- under Kirashi's GSTIN is not a cosmetic defect: it is one company's tax
-- identity on another company's legal documents, and it would have happened
-- silently on the very first invoice.
--
-- Kept: fyStart 'April' is the Indian financial year and right for every
-- business here. default_payment_terms_days 30 is a neutral convention.
-- Dropped: everything that identifies a particular company.
--
-- The existing row is untouched — Kirashi's own data stays exactly as it is.
-- This only stops the values being handed to anybody else.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE company_profile ALTER COLUMN name        DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN "tradeName" DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN address     DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN phone       DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN email       DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN gstin       DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN pan         DROP DEFAULT;
ALTER TABLE company_profile ALTER COLUMN "stateCode" DROP DEFAULT;

-- name was NOT NULL with a default, so the default was doing the work of
-- making inserts succeed. Without it, a partially-filled profile needs the
-- column to be nullable — a business that has not told us its name yet has
-- no name, and inventing one is what got us here.
ALTER TABLE company_profile ALTER COLUMN name DROP NOT NULL;
