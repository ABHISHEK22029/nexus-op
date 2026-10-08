-- 070 — "Forgot password?": a code by email, and sessions that end on a reset
--
-- There was no way back in for someone who forgot their password: a team
-- member had to ask their owner, and an owner had nobody to ask.
--
-- A reset code is six digits, emailed to the registered address. Only its
-- HMAC is stored, so the table never holds a usable code. Each one works for
-- 15 minutes, once, and allows 5 wrong guesses; asking for a new one retires
-- the old. requested_ip is kept for rate limiting and for the account owner's
-- own record of where a request came from.
--
-- password_changed_at lets a session started BEFORE a reset be refused
-- after it: a stolen session should not outlive the password it came from.

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  used_at       TIMESTAMPTZ,
  requested_ip  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_codes_user_idx ON password_reset_codes (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
