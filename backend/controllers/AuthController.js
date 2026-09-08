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

// GET /auth/me -> current user (requires authenticate middleware)
async function me(req, res) {
  try {
    const result = await db.query(
      `SELECT id, email, name, role, org_id FROM users WHERE id = $1 AND is_active = TRUE`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Session no longer valid' });
    /* Ship the permission map with the identity. The UI must never keep its
       own copy of the rules — a second copy is a copy that drifts, and a
       drifted permission table is worse than none because it gets trusted.
       Here the UI can only ever render what the server already agreed to. */
    const { role, label, permissions } = permissionsFor(result.rows[0].role);
    return res.json({ ...result.rows[0], role, roleLabel: label, permissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { login, register, me };
