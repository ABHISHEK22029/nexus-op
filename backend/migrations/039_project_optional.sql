-- ══════════════════════════════════════════════════════════════════
-- 039 — a project is optional
--
-- "Project" arrived from the construction side of this product, where it is
-- the contract you won and everything genuinely hangs off it: a BOQ, a
-- measurement book, milestones, running-account bills.
--
-- It does not belong on the fabrication side. A fabricator selling brackets
-- to a customer has an ORDER, not a project — and being forced to pick one
-- before anything worked was the single biggest reason the product felt
-- unreliable: eighteen screens went blank when the wrong project was
-- selected, and the dashboard refused outright without one.
--
-- So a project becomes an optional grouping, used when work really does run
-- long, and ignored otherwise. This migration removes the NOT NULL that
-- stopped a production order existing without one.
--
-- Deliberately narrow. work_orders, bills and boq_items keep their NOT NULL:
-- those are the construction-billing screens where a project is the whole
-- point, and loosening them would be a change in meaning rather than a
-- removal of an obstacle.
--
-- inventory."projectId" was already made nullable by 034, for the same
-- reason from the other direction — stock became company-level once the
-- ledger existed.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE production_orders ALTER COLUMN "projectId" DROP NOT NULL;

-- Indents are a material requisition — "the shop floor needs 400kg of angle".
-- That is an ordinary fabrication event with no project in it.
ALTER TABLE indents ALTER COLUMN "projectId" DROP NOT NULL;

-- Partial indexes so the common "everything not tied to a project" listing
-- does not degrade into a sequential scan as these tables grow.
CREATE INDEX IF NOT EXISTS idx_production_orders_owner_noproject
  ON production_orders (owner_id) WHERE "projectId" IS NULL;
CREATE INDEX IF NOT EXISTS idx_indents_owner_noproject
  ON indents (owner_id) WHERE "projectId" IS NULL;
