-- ══════════════════════════════════════════════════════════════════
-- 042 — the product stops being one company's product
--
-- 041 removed one company's identity from the column DEFAULTS. This removes
-- it from the places it was written into the data itself.
--
-- 1. doc_prefix. Purchase orders were numbered `Kirashi/FY2026-27/007` by
--    string literal in two files, so every organisation issued POs carrying
--    another company's name — on a document that goes to their vendors. The
--    prefix now comes from here, falling back to the business's own trade
--    name. shared/docNumber.js owns the format.
--
-- 2. loadingScope defaulted to 'Kirashi Scope'. It is a commercial term
--    meaning "who pays to load the truck", and the two answers are the buyer
--    and the vendor. 'Buyer Scope' says the same thing for everybody.
--
-- Existing rows are rewritten only where they carry the literal default that
-- nobody chose. A PO where someone deliberately typed something else is left
-- exactly as it is.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS doc_prefix TEXT;

COMMENT ON COLUMN company_profile.doc_prefix IS
  'Short prefix for document numbers (PO/INV/DC). Blank means derive it from the trade name.';

-- 'Kirashi Scope' -> 'Buyer Scope'. Only the untouched default value.
ALTER TABLE purchase_orders ALTER COLUMN "loadingScope" SET DEFAULT 'Buyer Scope';
UPDATE purchase_orders SET "loadingScope" = 'Buyer Scope' WHERE "loadingScope" = 'Kirashi Scope';

-- The existing deployment is Kirashi, so it keeps its own prefix explicitly
-- rather than by accident. Any other install starts blank and derives one.
UPDATE company_profile SET doc_prefix = 'KIRASHI'
 WHERE doc_prefix IS NULL AND name ILIKE '%kirashi%';
