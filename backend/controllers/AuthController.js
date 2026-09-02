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
      `SELECT id, email, password_hash, name, role, is_active
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

    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };
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
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, role, is_active)
       VALUES (LOWER($1), $2, $3, 'User', TRUE)
       RETURNING id, email, name, role`,
      [email, hash, name]
    );
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
      `SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = TRUE`,
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
