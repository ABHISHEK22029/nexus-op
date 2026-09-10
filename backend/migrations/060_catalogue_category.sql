-- ════════════════════════════════════════════════════════════════════
-- A category on each published product.
--
-- The public page had a search box and nothing else, which is fine for six
-- products and useless for a hundred: a visitor who wants line hardware
-- has to already know the word for it. Filters need something real to
-- filter on, and nothing on `skus` was suitable — HSN is a tax code, not a
-- shelf, and the internal name is written for whoever fabricates the item.
--
-- Deliberately free text rather than a lookup table. A fabricator's
-- categories are their own — "Line hardware", "Transformer fittings" — and
-- forcing them into a shared list would mean either a list that fits
-- nobody or a table nobody maintains. The page shows whichever ones
-- actually have published products behind them.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE skus ADD COLUMN IF NOT EXISTS catalogue_category TEXT;

-- The public page groups by category among published products only, so the
-- index matches the query rather than the column.
CREATE INDEX IF NOT EXISTS skus_catalogue_category_idx
  ON skus (owner_id, catalogue_category)
  WHERE is_published AND catalogue_category IS NOT NULL;
