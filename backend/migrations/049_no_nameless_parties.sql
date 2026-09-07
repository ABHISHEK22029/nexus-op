-- ══════════════════════════════════════════════════════════════════════
-- 049 — a vendor or customer must actually have a name
--
-- vendors.name is already NOT NULL, which does not help: vendor 39 holds an
-- EMPTY STRING. It renders as a blank row in the directory, cannot be picked
-- from a dropdown by sight, and has two real purchase orders against it.
--
-- The form has required a name since the minimal vendor form landed. The
-- database did not, so anything reaching the API directly — an import, a
-- script, an older build — could still write one.
--
-- Deferred so a transaction that is briefly inconsistent mid-way is not
-- rejected, and NOT VALID so the existing empty row does not block the
-- migration: vendor 39 belongs to a real account with real orders against
-- it, and only the person who buys from them knows their name. It is left
-- for a human, and the constraint stops any more appearing.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE vendors   DROP CONSTRAINT IF EXISTS vendors_name_not_blank;
ALTER TABLE vendors   ADD  CONSTRAINT vendors_name_not_blank
  CHECK (COALESCE(TRIM(name), '') <> '') NOT VALID;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_name_not_blank;
ALTER TABLE customers ADD  CONSTRAINT customers_name_not_blank
  CHECK (COALESCE(TRIM(name), '') <> '') NOT VALID;
