-- 069 — a customer can accept a quotation online; a quotation promises a date
--
-- "How do you know a quotation was accepted?" Today someone has to be told
-- and change the status by hand. A quotation can now carry a private link
-- (accept_token) the customer opens without an account, to accept or decline
-- it, with a note. The answer is recorded once, with when and by whom.
--
-- "Estimated delivery once an order is placed": the quotation states a
-- promised delivery — a number of days after the order, suggested from the
-- products' lead times — and the order it becomes carries the date
-- (customer_orders.expected_shipment_date, which already exists).

ALTER TABLE sales_quotations
  ADD COLUMN IF NOT EXISTS accept_token        TEXT,
  ADD COLUMN IF NOT EXISTS link_sent_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_name       TEXT,
  ADD COLUMN IF NOT EXISTS response_note       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_days       INTEGER CHECK (delivery_days IS NULL OR delivery_days BETWEEN 0 AND 730),
  ADD COLUMN IF NOT EXISTS delivery_note       TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sales_quotations_accept_token_uidx
  ON sales_quotations (accept_token) WHERE accept_token IS NOT NULL;
