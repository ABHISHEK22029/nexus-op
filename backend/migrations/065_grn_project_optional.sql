-- 065 — a goods receipt need not belong to a project.
--
-- 036 made a purchase order's project optional and 039 did the same for
-- production orders and indents, so a fabricator buying for stock could
-- raise a PO with no project. Receiving it was still refused: grn."projectId"
-- kept its NOT NULL, so the material for a project-less PO could never be
-- booked in, and the stock never went up. The receipt now takes the PO's
-- project when it has one, and none when it does not.
--
-- Contracting documents (bills, BOQ, measurement book, work orders,
-- milestones) do belong to a project and keep their constraint.

ALTER TABLE grn ALTER COLUMN "projectId" DROP NOT NULL;
