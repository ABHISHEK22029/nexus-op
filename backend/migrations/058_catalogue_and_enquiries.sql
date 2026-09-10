-- ════════════════════════════════════════════════════════════════════
-- Public catalogue and enquiries.
--
-- A business publishes some of its products at a link it can paste into a
-- WhatsApp group. A stranger opens it, puts things in a basket and sends an
-- enquiry. It lands in Sales, and somebody rings them.
--
-- The plan that specified this was written when company_profile was a
-- single row with no owner, so it concluded one deployment per client and
-- a subdomain each. That is no longer true: company_profile carries
-- owner_id and users carry org_id, so one deployment serves every business
-- and the slug in the path is what says whose catalogue you are looking
-- at. Everything below is therefore owner-scoped, exactly like the rest of
-- the product.
-- ════════════════════════════════════════════════════════════════════

-- ── the catalogue's own settings, one per organisation ──────────────
CREATE TABLE IF NOT EXISTS catalogue_settings (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id),
  -- The public identifier. Lower-case, hyphenated, unique across every
  -- organisation because it alone decides whose catalogue /c/<slug> shows.
  slug           TEXT NOT NULL,
  headline       TEXT,
  subhead        TEXT,
  -- Off by default. Nothing becomes public because a table was created.
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Also off by default. Fabricated goods are priced against a drawing and
  -- a tonnage; a number on a public page invites an argument later.
  show_prices    BOOLEAN NOT NULL DEFAULT FALSE,
  enquiry_email  TEXT,
  whatsapp_number TEXT,
  theme_accent   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalogue_settings_owner_uniq
  ON catalogue_settings (owner_id);
-- Case-insensitive: /c/Kirashi and /c/kirashi must not be two businesses.
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_settings_slug_uniq
  ON catalogue_settings (LOWER(slug));

-- ── which products appear, and how they read to a stranger ──────────
ALTER TABLE skus ADD COLUMN IF NOT EXISTS catalogue_slug   TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS is_published     BOOLEAN NOT NULL DEFAULT FALSE;
-- The internal name is for the people who fabricate it. The headline is
-- for the person deciding whether to enquire.
ALTER TABLE skus ADD COLUMN IF NOT EXISTS headline         TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS use_case         TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS moq              NUMERIC;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS lead_time_note   TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS sort_order       INTEGER NOT NULL DEFAULT 0;

-- Unique per organisation, not globally: two businesses may both sell a
-- "ms-angle-50x50x6" and neither should have to rename theirs.
CREATE UNIQUE INDEX IF NOT EXISTS skus_catalogue_slug_uniq
  ON skus (owner_id, LOWER(catalogue_slug))
  WHERE catalogue_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS skus_published_idx
  ON skus (owner_id, is_published) WHERE is_published;

-- ── photos ──────────────────────────────────────────────────────────
-- Points at attachments rather than storing bytes again, so the existing
-- upload path is reused and a photo has one home.
CREATE TABLE IF NOT EXISTS catalogue_photos (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id),
  sku_id        INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  attachment_id INTEGER NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  alt_text      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalogue_photos_sku_idx ON catalogue_photos (sku_id, sort_order);

-- ── enquiries: a stranger's basket ──────────────────────────────────
-- customer_id stays NULL on purpose. A stranger is not a customer. The
-- customers row is created at the moment somebody decides the enquiry is
-- real, or the customer list fills with tyre-kickers and every report
-- built on it becomes noise.
CREATE TABLE IF NOT EXISTS enquiries (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  ref          TEXT,
  name         TEXT NOT NULL,
  company      TEXT,
  phone        TEXT,
  email        TEXT,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'New',
  source       TEXT NOT NULL DEFAULT 'catalogue',
  customer_id  INTEGER REFERENCES customers(id),
  quotation_id INTEGER REFERENCES sales_quotations(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS enquiries_owner_status_idx ON enquiries (owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS enquiry_items (
  id          SERIAL PRIMARY KEY,
  enquiry_id  INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  sku_id      INTEGER REFERENCES skus(id),
  description TEXT NOT NULL,
  quantity    NUMERIC,
  unit        TEXT,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS enquiry_items_enquiry_idx ON enquiry_items (enquiry_id, sort_order);
