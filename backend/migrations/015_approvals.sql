-- 015_approvals.sql — Phase 1: approval workflows (threshold gating on POs)
-- Idempotent.
CREATE TABLE IF NOT EXISTS automation_settings (
  owner_id              INTEGER PRIMARY KEY REFERENCES users(id),
  po_approval_threshold REAL DEFAULT 0,          -- 0 = no approval needed
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status TEXT;   -- Not Required | Pending Approval | Approved | Rejected
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_remark TEXT;
