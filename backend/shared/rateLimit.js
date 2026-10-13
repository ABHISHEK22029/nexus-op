/* ══════════════════════════════════════════════════════════
   rateLimit — how often one visitor may knock on the public doors.

   Sign-in, sign-up, accepting an invite and the public catalogue and quote
   pages had no limit at all: a password could be guessed without end, and
   a few hundred anonymous enquiries would hold the app's four database
   connections. This counts requests per key (the visitor's address, and for
   sign-in the email too) in a sliding window, in memory — one server, so
   one count.

   On by default only on the live server (Render) or when RATE_LIMITS=on.
   A local server for the test suites registers dozens of throwaway accounts
   from one address an hour, which is exactly what this exists to refuse.
   ══════════════════════════════════════════════════════════ */

const enabled = () => process.env.RATE_LIMITS === 'on' || (!!process.env.RENDER && process.env.RATE_LIMITS !== 'off');

const buckets = new Map();   // name → Map(key → [timestamps])

function hit(name, key, windowMs) {
  let b = buckets.get(name);
  if (!b) { b = new Map(); buckets.set(name, b); }
  const now = Date.now();
  const recent = (b.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  b.set(key, recent);
  if (b.size > 20000) for (const [k, v] of b) if (!v.some((t) => now - t < windowMs)) b.delete(k);
  return recent.length;
}

/**
 * Express middleware. Each rule: { name, max, windowMs, key(req) → string|null }.
 * A request over any rule's limit is answered 429 with `message`.
 */
function limit(rules, message = 'Too many attempts. Wait a few minutes and try again.') {
  return (req, res, next) => {
    if (!enabled()) return next();
    for (const r of rules) {
      const k = r.key(req);
      if (k == null) continue;
      if (hit(r.name, k, r.windowMs) > r.max) {
        res.set('Retry-After', String(Math.ceil(r.windowMs / 1000)));
        return res.status(429).json({ error: message });
      }
    }
    return next();
  };
}

const ip = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const emailOf = (req) => {
  const e = String(req.body?.email || '').trim().toLowerCase();
  return e || null;
};

module.exports = { limit, ip, emailOf, _enabled: enabled };
