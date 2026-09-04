-- ══════════════════════════════════════════════════════════════════
-- 045 — who someone is, not just what they may click
--
-- The people list held id, name, email, role, active. That is enough to
-- administer permissions and not enough to recognise a person: an
-- administrator looking at "Ravi Kumar — Production" cannot tell which Ravi,
-- what he actually does, or which employee number payroll knows him by.
--
--   employee_code — the works/payroll number the business already uses. The
--                   number people say out loud on the shop floor.
--   job_title     — what they do, in the business's words. "Shop floor
--                   supervisor" is not a role in this product; it is the job
--                   the role exists to support, and the two are not the same
--                   thing. Someone can be a Production role and a Quality
--                   Inspector by trade.
--   phone         — reachable without opening another system.
--   reports_to    — who they answer to. Left as a plain user id rather than
--                   a foreign key with a cascade: deleting a manager must
--                   never delete their team.
--
-- department already existed and was never populated by anything.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_to    INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes         TEXT;

-- One works number per person, but plenty of installs will leave it blank.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_code
  ON users (LOWER(employee_code)) WHERE employee_code IS NOT NULL AND employee_code <> '';

COMMENT ON COLUMN users.job_title IS
  'What this person does, in the business''s words. Distinct from `role`, which is what the software lets them do.';
