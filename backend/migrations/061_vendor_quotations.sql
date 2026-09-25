-- 061_vendor_quotations.sql
--
-- Vendors send their quotations as files: an Excel sheet, a PDF, sometimes a
-- Word document. Until now those lived in somebody's inbox, and comparing
-- three of them meant opening three attachments side by side and retyping
-- the numbers into a spreadsheet — which is where the comparison went wrong,
-- because the retyping is the error-prone part.
--
-- Two tables:
--   vendor_quotations       one uploaded file, parsed
--   vendor_quotation_lines  the rows we managed to read out of it
--
-- The FILE ITSELF is kept in `attachments`, as everything else in this
-- product is, and referenced from here. That matters more than it sounds:
-- a parsed number that nobody can trace back to the page it came from is
-- not evidence, so every quotation keeps its original for the eye icon to
-- open.

CREATE TABLE IF NOT EXISTS vendor_quotations (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id),
  vendor_id      INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  -- Free text as well as the link: a vendor may quote before they exist as a
  -- record, and refusing the upload until somebody creates the vendor first
  -- is how files go back to living in the inbox.
  vendor_name    TEXT,
  rfq_ref        TEXT,                    -- what this was quoted against
  attachment_id  INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
  filename       TEXT,
  mime           TEXT,
  source_kind    TEXT,                    -- excel | pdf | word
  quote_ref      TEXT,                    -- the vendor's own number, if stated
  quote_date     DATE,
  currency       TEXT DEFAULT 'INR',
  subtotal       NUMERIC(14,2),
  tax_total      NUMERIC(14,2),
  grand_total    NUMERIC(14,2),
  -- How much of the file we understood. A partly-read quotation is usable,
  -- but it must not be silently treated as complete.
  parse_status   TEXT NOT NULL DEFAULT 'parsed',   -- parsed | partial | failed
  parse_note     TEXT,
  raw_text       TEXT,                    -- what we extracted, for the review pane
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotation_lines (
  id                   SERIAL PRIMARY KEY,
  vendor_quotation_id  INTEGER NOT NULL REFERENCES vendor_quotations(id) ON DELETE CASCADE,
  owner_id             INTEGER NOT NULL REFERENCES users(id),
  line_no              INTEGER,
  description          TEXT,
  hsn                  TEXT,
  uom                  TEXT,
  quantity             NUMERIC(14,3),
  rate                 NUMERIC(14,2),
  amount               NUMERIC(14,2),
  -- A key for lining the same item up across vendors: normalised description,
  -- or the HSN when one is given. Held on the row so the comparison does not
  -- have to re-derive it every time it runs.
  match_key            TEXT,
  -- Whether the figures came straight off a spreadsheet cell or were read out
  -- of a line of text. The comparison shows the difference, because a number
  -- pulled from prose deserves a second look before it wins an order.
  confidence           TEXT NOT NULL DEFAULT 'high'   -- high | medium | low
);

CREATE INDEX IF NOT EXISTS vendor_quotations_owner_idx ON vendor_quotations(owner_id);
CREATE INDEX IF NOT EXISTS vendor_quotations_vendor_idx ON vendor_quotations(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_quotation_lines_q_idx ON vendor_quotation_lines(vendor_quotation_id);
CREATE INDEX IF NOT EXISTS vendor_quotation_lines_match_idx ON vendor_quotation_lines(owner_id, match_key);
