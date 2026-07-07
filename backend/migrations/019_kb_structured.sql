-- 019_kb_structured.sql — rich structured content for KB articles
-- structured = { overview, whatYouNeed[], steps[{title,detail}], keyPoints[], tips[], faqs[{q,a}] }
-- The article page renders these as sections (steps → numbered stepper); body
-- is kept as a prose mirror for full-text search + Ask AI grounding. Idempotent.
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS structured JSONB;
