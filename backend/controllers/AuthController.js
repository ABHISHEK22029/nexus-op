/* ══════════════════════════════════════════════════════════
   AuthController — login / current user
   ══════════════════════════════════════════════════════════ */
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { permissionsFor } = require('../shared/roles');

// POST /auth/login  { email, password } -> { token, user }
async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await db.query(
      /* org_id must come back here, or signToken stamps the token with
         the person's own id as their organisation — and an employee then
         sees only what they typed themselves, not their employer's. */
      `SELECT id, email, password_hash, name, role, is_active, org_id
         FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const user = result.rows[0];
    // Generic message — do not reveal whether the email exists.
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    /* An invited account has no password until the person accepts. Relying
       on bcrypt.compare to reject a null hash is trusting a library to fail
       in the direction we want; this states it. Same generic message, so a
       pending invite is not distinguishable from a wrong password. */
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]).catch(() => {});

    /* org_id has to survive this trim. Selecting it and then dropping it
       here left signToken with nothing, so the token said the person's
       organisation was themselves — and an employee saw only the rows they
       had typed, not their employer's. */
    const safeUser = {
      id: user.id, email: user.email, name: user.name, role: user.role,
      org_id: user.org_id ?? user.id,
    };
    return res.json({ token: signToken(safeUser), user: safeUser });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
}

// POST /auth/register  { name, email, password } -> { token, user }
// Open self-service signup. New accounts get the 'User' role (their own
// empty workspace); the admin role is never self-assignable here.
/* ══════════════════════════════════════════════════════════
   Self-registration is CLOSED by default.

   This endpoint was public. Anyone who found the URL created an account,
   and that account resolved to Owner — full access to its own workspace.
   Combined with the unscoped write endpoints, an anonymous person could
   register and then modify another company's orders.

   Two ways in now, both deliberate:
     · ALLOW_SELF_REGISTRATION=true   — for a demo or a trial deployment
     · SIGNUP_TOKEN=<secret>          — shared with people you actually want,
                                        passed as `signupToken` in the body

   Neither set means no self-registration, and an administrator creates
   accounts instead. That is the right default for an ERP holding one
   company's order book and pricing.
   ══════════════════════════════════════════════════════════ */
function registrationMode() {
  if (String(process.env.ALLOW_SELF_REGISTRATION).toLowerCase() === 'true') return 'open';
  if (process.env.SIGNUP_TOKEN) return 'token';
  return 'closed';
}

async function register(req, res) {
  const { name, email, password, signupToken } = req.body || {};

  const mode = registrationMode();
  if (mode === 'closed') {
    return res.status(403).json({
      error: 'Self-registration is disabled',
      detail: 'Ask an administrator to create your account (Configurator → People).',
    });
  }
  if (mode === 'token' && signupToken !== process.env.SIGNUP_TOKEN) {
    // Same shape as a wrong password: never reveal whether the token exists.
    return res.status(403).json({ error: 'Invalid or missing signup token' });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  try {
    const exists = await db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    /* Registering creates an ORGANISATION, not just a login. The person who
       does it is its owner: they name the company on the first-run screen,
       and they are the one who adds staff and gives them roles. Stored as
       'Owner' rather than the old 'User', which was a legacy string that
       merely resolved to Owner and showed up in the Configurator's health
       banner as something to tidy up.
     *
     * NOT 'Administrator' — that role is cross_tenant and reads every
     * organisation on the install. Handing it to whoever signs up would let
     * any stranger read every other business's data.
     *
     * org_id is the founder's own id, which is not known until the row
     * exists. A data-modifying CTE cannot do this in one statement:
     * Postgres runs WITH sub-statements against the same snapshot, so an
     * UPDATE in the outer query cannot see the row the INSERT just made.
     * Two statements in one transaction, so an account is never left
     * belonging to organisation zero. */
    const client = await db.getClient();
    let result;
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO users (email, password_hash, name, role, is_active, org_id)
         VALUES (LOWER($1), $2, $3, 'Owner', TRUE, 0) RETURNING id`,
        [email, hash, name]);
      result = await client.query(
        `UPDATE users SET org_id = id WHERE id = $1
         RETURNING id, email, name, role, org_id`,
        [ins.rows[0].id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    const user = result.rows[0];
    return res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

/* ══════════════════════════════════════════════════════════
   Accepting an invite.

   Unauthenticated by necessity — the person has no password yet, which is
   the whole point. The token IS the authentication, so it is treated like
   one: looked up by its SHA-256 digest, single use, and expired after seven
   days.

   What it does NOT do is let the invitee choose anything but their
   password. The organisation and the role were decided by whoever invited
   them and are not in the request body; accepting an invite must not be a
   way to pick your own permissions.
   ══════════════════════════════════════════════════════════ */

// GET /auth/invite/:token -> { name, email, organisation, role } or 404
async function inviteInfo(req, res) {
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(req.params.token || '')).digest('hex');
    const { rows } = await db.query(
      `SELECT u.name, u.email, u.role, u.invite_expires_at, c.name AS org_name
         FROM users u
         LEFT JOIN company_profile c ON c.owner_id = u.org_id
        WHERE u.invite_token_hash = $1`, [hash]);
    const inv = rows[0];
    /* One message for "no such invite" and "expired". Distinguishing them
       tells someone holding a stale link that it was once real. */
    if (!inv || (inv.invite_expires_at && new Date(inv.invite_expires_at) < new Date())) {
      return res.status(404).json({ error: 'This invitation is not valid any more. Ask for a new one.' });
    }
    return res.json({
      name: inv.name, email: inv.email, role: inv.role,
      organisation: inv.org_name || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /auth/accept-invite  { token, password } -> { token, user }
async function acceptInvite(req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const client = await db.getClient();
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    await client.query('BEGIN');

    /* FOR UPDATE so two submissions of the same link cannot both succeed —
       the second waits, then finds the token already cleared. */
    const { rows } = await client.query(
      `SELECT id, email, name, role, org_id, invite_expires_at
         FROM users WHERE invite_token_hash = $1 FOR UPDATE`, [hash]);
    const user = rows[0];
    if (!user || (user.invite_expires_at && new Date(user.invite_expires_at) < new Date())) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This invitation is not valid any more. Ask for a new one.' });
    }

    const bcrypt = require('bcryptjs');
    const pwHash = await bcrypt.hash(password, 10);
    await client.query(
      `UPDATE users
          SET password_hash = $1, invite_token_hash = NULL, invite_expires_at = NULL,
              is_active = TRUE, last_login = NOW()
        WHERE id = $2`, [pwHash, user.id]);
    await client.query('COMMIT');

    const safeUser = {
      id: user.id, email: user.email, name: user.name, role: user.role,
      org_id: user.org_id ?? user.id,
    };
    return res.json({ token: signToken(safeUser), user: safeUser });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: err.message });
  } finally { client.release(); }
}

// GET /auth/me -> current user (requires authenticate middleware)
async function me(req, res) {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.org_id, COALESCE(c.modules, '{}'::jsonb) AS modules
         FROM users u
         LEFT JOIN company_profile c ON c.owner_id = u.org_id
        WHERE u.id = $1 AND u.is_active = TRUE`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Session no longer valid' });
    /* Ship the permission map with the identity. The UI must never keep its
       own copy of the rules — a second copy is a copy that drifts, and a
       drifted permission table is worse than none because it gets trusted.
       Here the UI can only ever render what the server already agreed to. */
    const { role, label, permissions } = permissionsFor(result.rows[0].role, result.rows[0].org_id);
    return res.json({ ...result.rows[0], role, roleLabel: label, permissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { login, register, me, inviteInfo, acceptInvite };
