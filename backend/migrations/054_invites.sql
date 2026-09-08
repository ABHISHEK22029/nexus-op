-- ══════════════════════════════════════════════════════════════════════
-- 054 — invite somebody by email; they set their own password
--
-- Adding a person meant the owner inventing a temporary password and then
-- telling them what it was — over WhatsApp, usually. That password is known
-- to two people from the moment it exists, and in practice nobody ever
-- changes it.
--
-- An invite instead: the owner enters a name, an email and a role. The
-- account is created in THEIR organisation with THAT role, but cannot be
-- signed into until the person follows a one-time link and chooses their
-- own password. The owner never knows it.
--
-- The link is not mailed by the server. Sending mail from an application
-- needs SPF and DKIM before it stops going to spam, and arrives from an
-- address nobody recognises — the same reasoning as emailing an invoice.
-- The owner copies the link and sends it however they already talk to their
-- staff.
--
-- Token stored hashed, for the same reason a password is: a leaked database
-- should not hand out working invite links. Expiry is deliberate — an
-- invite that works forever is a credential nobody remembers issuing.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by        INTEGER;

-- A pending account has no password yet. It cannot be signed into: login
-- requires is_active AND a password hash, and this leaves both unusable.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE INDEX IF NOT EXISTS users_invite_token_idx
    ON users (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

COMMENT ON COLUMN users.invite_token_hash IS
  'SHA-256 of the one-time invite token. Cleared when the invite is accepted. Never stores the token itself.';
