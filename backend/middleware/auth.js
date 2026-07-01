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
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Express middleware — rejects requests without a valid Bearer token.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Optional role guard: requireRole('Admin', 'Finance')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole, JWT_SECRET };
