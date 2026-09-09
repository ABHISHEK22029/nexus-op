-- ════════════════════════════════════════════════════════════════════
-- Backfill owner_id on rows written before their handler set it.
--
-- Three lists were given an ownership condition (purchase orders, goods
-- receipts, the activity feed) and three creates were taught to write an
-- owner. Rows created before that carry owner_id NULL, and a NULL matches
-- no organisation — so scoping the list turns "visible to everyone",
-- which was the leak, into "visible to nobody", which is worse for the
-- business that owns them.
--
-- Every orphan is attributable through its project, which has always
-- carried an owner. Order matters: purchase orders first, because goods
-- receipts prefer to inherit from the order they belong to.
-- ════════════════════════════════════════════════════════════════════

UPDATE purchase_orders po
   SET owner_id = p.owner_id
  FROM projects p
 WHERE po."projectId" = p.id
   AND po.owner_id IS NULL
   AND p.owner_id IS NOT NULL;

-- A receipt belongs to whoever owns the order it was received against;
-- its project is the fallback for a receipt recorded without one.
UPDATE grn g
   SET owner_id = po.owner_id
  FROM purchase_orders po
 WHERE g."poId" = po.id
   AND g.owner_id IS NULL
   AND po.owner_id IS NOT NULL;

UPDATE grn g
   SET owner_id = p.owner_id
  FROM projects p
 WHERE g."projectId" = p.id
   AND g.owner_id IS NULL
   AND p.owner_id IS NOT NULL;

UPDATE activities a
   SET owner_id = p.owner_id
  FROM projects p
 WHERE a."projectId" = p.id
   AND a.owner_id IS NULL
   AND p.owner_id IS NOT NULL;

-- Activity rows with no project cannot be attributed to anyone, so they
-- are deliberately left alone rather than guessed at. They stay out of
-- every feed. They are log entries, not business records, and destroying
-- an audit trail to tidy a column is not a trade worth making — but the
-- count is worth knowing, so: run
--   SELECT COUNT(*) FROM activities WHERE owner_id IS NULL;
-- to see how many remain.
