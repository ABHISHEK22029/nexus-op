/* ══════════════════════════════════════════════════════════
   cache.js — optional Redis response cache (per-user, self-invalidating)
   • Enabled only when REDIS_URL is set; otherwise every call no-ops and
     requests fall straight through to the DB (zero behaviour change).
   • Never crashes the app: if ioredis isn't installed or Redis is down,
     it degrades to "no cache" silently.
   • Freshness: each user has a version counter. Writes bump the version,
     so the next read is a guaranteed miss → fresh data. Cached entries also
     carry a short TTL as a safety net. This keeps the system in sync.
   ══════════════════════════════════════════════════════════ */
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 4000,
      lazyConnect: false,
    });
    redis.on('error', (e) => console.error('[cache] redis error:', e.message));
    redis.on('connect', () => console.log('[cache] ✅ Redis connected'));
  } catch (e) {
    console.error('[cache] Redis init failed (running without cache):', e.message);
    redis = null;
  }
}

const enabled = () => !!redis;

// Per-user cache version — bumped on any write to force fresh reads.
async function version(uid) {
  if (!redis) return '0';
  try { return (await redis.get(`ver:${uid}`)) || '0'; } catch { return '0'; }
}
async function bump(uid) {
  if (!redis) return;
  try { await redis.incr(`ver:${uid}`); } catch { /* ignore */ }
}
async function get(key) {
  if (!redis) return null;
  try { const v = await redis.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function set(key, value, ttlSeconds = 45) {
  if (!redis) return;
  try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch { /* ignore */ }
}

module.exports = { enabled, version, bump, get, set };
