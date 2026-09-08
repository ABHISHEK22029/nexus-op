-- ══════════════════════════════════════════════════════════════════════
-- 056 — a company turns on the parts of the product it actually uses
--
-- Four screens are civil-contracting: Bill of Quantities, the Measurement
-- Book, Indents (which carry a `chainage` field — distance along a road)
-- and RA bills, which bill a running account against measured work. They
-- are good features for a contractor and meaningless to a furniture maker,
-- and every organisation saw all of them.
--
-- Deleting them would have been cleaner to look at and would have thrown
-- away working software some customer wants. So they become a switch.
--
-- A PREFERENCE, NOT A PERMISSION. Turning a module off hides its screens
-- and its menu entries; it does not refuse the API, and no data is deleted
-- or hidden. A business that switches contracting off and back on finds its
-- BOQ exactly where it left it. Anything that must not be reached is a
-- matter for roles, which is a different mechanism with different
-- guarantees, and conflating the two would make both harder to reason about.
--
-- Existing organisations keep contracting ON, so nothing changes for anyone
-- today. New ones start with it off, because the common case is a business
-- that does not lay roads.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Every profile that exists today predates the switch and has been seeing
-- these screens all along. Leaving them on is the only change-free answer.
UPDATE company_profile
   SET modules = COALESCE(modules, '{}'::jsonb) || '{"contracting": true}'::jsonb
 WHERE NOT (modules ? 'contracting');

COMMENT ON COLUMN company_profile.modules IS
  'Which optional feature areas this organisation has switched on, e.g. {"contracting": true}. A preference that hides screens and menu entries — never a permission, and never a reason to hide or delete data.';
