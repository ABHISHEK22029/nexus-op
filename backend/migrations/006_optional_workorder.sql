-- 006_optional_workorder.sql — make workOrderId optional for SME flexibility
-- A simple fabrication shop may not use work orders at all. Indents, goods
-- receipts and measurements should be recordable against just a project.
-- Idempotent (DROP NOT NULL is a no-op if already nullable).

ALTER TABLE indents          ALTER COLUMN "workOrderId" DROP NOT NULL;
ALTER TABLE measurement_book ALTER COLUMN "workOrderId" DROP NOT NULL;
ALTER TABLE grn              ALTER COLUMN "workOrderId" DROP NOT NULL;
ALTER TABLE purchase_orders  ALTER COLUMN "workOrderId" DROP NOT NULL;
