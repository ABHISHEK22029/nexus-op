-- 018_knowledge_base.sql — shared Knowledge Base for Ask AI + Smart Knowledge
-- Postgres full-text search now (robust, no external embedding key needed);
-- can upgrade to pgvector later. Idempotent.

CREATE TABLE IF NOT EXISTS kb_articles (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  category      TEXT,                     -- Sales | Procurement | Production | Billing | Setup ...
  article_type  TEXT DEFAULT 'Guide',     -- Guide | How-to | Reference | FAQ
  summary       TEXT,
  body          TEXT,                     -- markdown
  tags          TEXT[],
  keywords      TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  view_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_tsv    tsvector
);
CREATE INDEX IF NOT EXISTS kb_articles_tsv_idx ON kb_articles USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS kb_articles_cat_idx ON kb_articles (category);

-- Maintain the tsvector (title + summary + body + keywords), title weighted highest.
CREATE OR REPLACE FUNCTION kb_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title,   '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.keywords,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body,    '')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kb_tsv_trg ON kb_articles;
CREATE TRIGGER kb_tsv_trg BEFORE INSERT OR UPDATE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION kb_tsv_update();

-- Optional feedback (mirrors the Arvada KB feedback model).
CREATE TABLE IF NOT EXISTS kb_feedback (
  id          SERIAL PRIMARY KEY,
  article_id  INTEGER REFERENCES kb_articles(id) ON DELETE CASCADE,
  rating      TEXT,       -- good | bad
  comment     TEXT,
  user_id     INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
