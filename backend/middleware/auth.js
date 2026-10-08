/* ══════════════════════════════════════════════════════════
   JWT Authentication middleware
   ══════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

// In production a real secret MUST be provided via env. The dev fallback keeps
// local runs working without configuration but should never reach prod.
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-op-dev-secret-change-me';
const TOKEN_TTL  = process.env.JWT_TTL || '12h';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET is not set — using an insecure dev fallback.');
}

function signToken(user) {
  return jwt.sign(
    /* `org` is which organisation this person works for, which is not the
       same question as who they are. Business data is scoped on the
       organisation so that an employee sees the company's customers and
       stock rather than only the rows they typed themselves.

       A founder's organisation is their own id, so a token issued before
       this existed still resolves correctly — see the fallback below. */
    /* iatMs: when it was issued, to the millisecond. The standard iat is in
       whole seconds, so a session started in the same second as a password
       reset could not be told apart from one started after it. */
    { sub: user.id, org: user.org_id ?? user.id, email: user.email, role: user.role, name: user.name, iatMs: Date.now() },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/* Whether a signed token still speaks for its account.

   A token was trusted for its whole 12 hours on its signature alone: a
   password reset left every other session signed in — including a stolen
   one — and switching a person off took effect only when their token ran
   out. Now the account is checked: switched off, or its password changed
   after the token was issued, and the token is refused.

   Read once a minute per account, not on every request; a reset or a
   switch-off on this server clears the entry at once (forgetAccount). If
   the database cannot be reached the request goes on — every route behind
   this needs the database anyway, and failing here would only add a second
   error to the first. */
const ACCOUNT_TTL = 60 * 1000;
const accounts = new Map();
async function accountState(id) {
  const hit = accounts.get(id);
  if (hit && Date.now() - hit.at < ACCOUNT_TTL) return hit;
  const db = require('../db');
  const { rows } = await db.query('SELECT is_active, password_changed_at FROM users WHERE id = $1', [id]);
  const s = {
    at: Date.now(),
    exists: !!rows[0],
    active: !!rows[0] && rows[0].is_active !== false,
    changed: rows[0]?.password_changed_at ? new Date(rows[0].password_changed_at).getTime() : 0,   // ms
  };
  accounts.set(id, s);
  if (accounts.size > 20000) accounts.clear();
  return s;
}
const forgetAccount = (id) => accounts.delete(Number(id));

// Express middleware — rejects requests without a valid Bearer token.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  try {
    const s = await accountState(Number(payload.sub));
    if (!s.exists || !s.active) return res.status(401).json({ error: 'This account has been switched off. Ask your company\'s owner.' });
    const issued = payload.iatMs ?? payload.iat * 1000;   // a token from before iatMs: its second
    if (s.changed && issued < s.changed) return res.status(401).json({ error: 'Your password was changed. Sign in again.' });
  } catch (e) {
    console.error('[auth] account check skipped:', e.message);
  }
  req.user = {
    id: payload.sub,
    /* Falls back to the user's own id for tokens issued before org_id
       existed, which is exactly right: everyone who signed in before this
       was the sole member of their own organisation. So nobody is logged
       out and nothing they own moves. */
    orgId: payload.org ?? payload.sub,
    email: payload.email, role: payload.role, name: payload.name,
  };
  return next();
}

/* Optional role guard: requireRole('Admin', 'Finance')

   Prefer allow(resource, action) from middleware/permissions — naming a
   resource survives the role list changing, naming roles does not.

   Kept for existing call sites, but both sides are normalised now. The
   plain `roles.includes(req.user.role)` this replaced compared raw strings,
   so a user whose role was stored as "Administrator" failed
   requireRole('Admin') — locked out by a rename rather than by a rule. */
function requireRole(...roles) {
  const { normaliseRole } = require('../shared/roles');
  const wanted = new Set(roles.map(normaliseRole));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (!wanted.has(normaliseRole(req.user.role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole, JWT_SECRET, forgetAccount };
