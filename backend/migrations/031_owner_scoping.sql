-- ══════════════════════════════════════════════════════════
-- 031 — Owner scoping: close the cross-tenant holes (Track G)
--
-- THE PROBLEM
-- Nearly every by-id route runs `WHERE id = $1` with no ownership check, so
-- any logged-in user can read, edit or delete ANOTHER tenant's records by
-- changing a number in the URL. Combined with open self-registration, that
-- is a full cross-tenant breach.
--
-- It could not simply be fixed in the queries, because the system had TWO
-- INCOMPATIBLE TENANCY MODELS:
--     inventory / purchase_orders / grn / vendors   scoped by "projectId"
--     customers / skus / raw_materials / invoices   scoped by owner_id
-- and `scopeProjectAccess` only fired when a projectId was actually present
-- in the request — so omitting it bypassed the guard entirely.
--
-- THE FIX
-- owner_id becomes the single tenancy boundary on every table. project_id
-- stays as a useful dimension (which job consumed this), but it is no longer
-- what protects the data.
--
-- Backfilled from projects.owner_id, so existing rows keep their real owner.
-- ══════════════════════════════════════════════════════════

-- ── 1. Add owner_id to every project-scoped table ──
ALTER TABLE vendors            ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE work_orders        ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE purchase_orders    ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE inventory          ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE grn                ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE bills              ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE boq_items          ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE indents            ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE measurement_book   ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE production_orders  ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE grn_bills          ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
ALTER TABLE activities         ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);

-- ── 2. Backfill from the owning project ──
UPDATE vendors           t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE work_orders       t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE purchase_orders   t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE inventory         t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE grn               t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE bills             t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE boq_items         t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE indents           t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE measurement_book  t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE production_orders t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE grn_bills         t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;
UPDATE activities        t SET owner_id = p.owner_id FROM projects p WHERE t."projectId" = p.id AND t.owner_id IS NULL;

-- Orphans (no project, or a project that no longer exists) fall to the first
-- admin so they remain reachable rather than becoming invisible forever.
DO $$
DECLARE fallback INTEGER;
BEGIN
  SELECT id INTO fallback FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1;
  IF fallback IS NOT NULL THEN
    UPDATE vendors           SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE work_orders       SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE purchase_orders   SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE inventory         SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE grn               SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE bills             SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE boq_items         SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE indents           SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE measurement_book  SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE production_orders SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE grn_bills         SET owner_id = fallback WHERE owner_id IS NULL;
    UPDATE activities        SET owner_id = fallback WHERE owner_id IS NULL;
  END IF;
END $$;

-- ── 3. Index every owner_id — it is now on the hot path of every query ──
CREATE INDEX IF NOT EXISTS vendors_owner_idx           ON vendors (owner_id);
CREATE INDEX IF NOT EXISTS work_orders_owner_idx       ON work_orders (owner_id);
CREATE INDEX IF NOT EXISTS purchase_orders_owner_idx   ON purchase_orders (owner_id);
CREATE INDEX IF NOT EXISTS inventory_owner_idx         ON inventory (owner_id);
CREATE INDEX IF NOT EXISTS grn_owner_idx               ON grn (owner_id);
CREATE INDEX IF NOT EXISTS bills_owner_idx             ON bills (owner_id);
CREATE INDEX IF NOT EXISTS boq_items_owner_idx         ON boq_items (owner_id);
CREATE INDEX IF NOT EXISTS indents_owner_idx           ON indents (owner_id);
CREATE INDEX IF NOT EXISTS measurement_book_owner_idx  ON measurement_book (owner_id);
CREATE INDEX IF NOT EXISTS production_orders_owner_idx ON production_orders (owner_id);
CREATE INDEX IF NOT EXISTS grn_bills_owner_idx         ON grn_bills (owner_id);
CREATE INDEX IF NOT EXISTS activities_owner_idx        ON activities (owner_id);

-- ── 4. New users default to a non-privileged role ──
-- users.role defaulted to 'Admin', so any insert that omitted the role — a
-- seed script, a manual row — silently created an administrator.
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'User';

COMMENT ON COLUMN vendors.owner_id IS 'Tenancy boundary. "projectId" is a dimension, not a security boundary.';
