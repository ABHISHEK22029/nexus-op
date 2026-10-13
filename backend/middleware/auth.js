/* ══════════════════════════════════════════════════════════
   JWT Authentication middleware
   ══════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

/* The secret every session is signed with. The fallback string is in the
   public repo, so a deployed server that fell back to it would accept a
   session anybody could forge. Deployed without JWT_SECRET, the server
   makes up a random one for this run instead: everyone is signed out on a
   restart, which is a nuisance, not a hole. /health says which it is.
   Refusing to start would have been cleaner and would take the site down. */
const deployed = !!process.env.RENDER || process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET
  || (deployed ? require('crypto').randomBytes(48).toString('base64') : 'nexus-op-dev-secret-change-me');
const SECRET_SOURCE = process.env.JWT_SECRET ? 'configured' : deployed ? 'temporary' : 'development';
const TOKEN_TTL  = process.env.JWT_TTL || '12h';

if (SECRET_SOURCE === 'temporary') {
  console.warn('[auth] JWT_SECRET is not set: using a random secret for this run. Everyone will be signed out on restart. Set JWT_SECRET.');
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
  const { rows } = await db.query('SELECT is_active, password_changed_at, role, org_id FROM users WHERE id = $1', [id]);
  const s = {
    at: Date.now(),
    exists: !!rows[0],
    active: !!rows[0] && rows[0].is_active !== false,
    changed: rows[0]?.password_changed_at ? new Date(rows[0].password_changed_at).getTime() : 0,   // ms
    role: rows[0]?.role ?? null,
    org: rows[0] ? (rows[0].org_id ?? id) : null,
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
  let account = null;
  try {
    const s = await accountState(Number(payload.sub));
    account = s;
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
  /* The role and organisation as they are NOW, not as they were when the
     token was signed: a demoted person kept their old powers for the rest
     of a 12-hour session. Read with the account check, once a minute. */
  if (account?.role) req.user.role = account.role;
  if (account?.org != null) req.user.orgId = account.org;
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

module.exports = { signToken, authenticate, requireRole, JWT_SECRET, SECRET_SOURCE, forgetAccount };
