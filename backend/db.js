require('dotenv').config();
const { Pool, types } = require('pg');

// DATE columns (oid 1082) should stay calendar dates, not shift by timezone.
// Without this, node-pg parses a DATE to a local-midnight JS Date and then
// serializes it to UTC — turning 2026-08-01 into "2026-07-31T18:30:00Z" for
// IST users (an off-by-one). Return the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(1082, (v) => v);

/* ── pool sizing ──────────────────────────────────────────────────────
   These were all defaults, and the default idleTimeoutMillis is 10 SECONDS.

   Opening a connection to a hosted Postgres costs ~3.5s here — TLS plus
   authentication across the network. So a pool that throws connections away
   after ten seconds of quiet means almost every action pays that again: 51
   physical connections were opened in a single short test run, and
   /production varied between 4.9s and 15.4s depending on how many of its
   queries happened to need a fresh one.

   That is the worst possible fit for this product's usage. An SME ERP is
   not a high-traffic API; somebody opens a screen, reads it, thinks, and
   clicks again a minute later. Under the default the pool is always cold.

   Five minutes idle keeps a working set warm across a normal session
   without holding connections open all night. keepAlive stops an idle TCP
   connection being dropped by something in the middle, which otherwise
   surfaces as "Connection terminated unexpectedly" — seen while seeding.
   connectionTimeoutMillis makes a failure to connect fail fast rather than
   hanging a request forever. */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  /* Supabase's pooler runs in SESSION mode here and caps the whole project
     at 15 clients. A pool of 10 plus a migration script plus a seeder is
     already over it, and the error is not a timeout — it is a hard
     "(EMAXCONNSESSION) max clients reached in session mode", returned as a
     500 from whichever endpoint asked last. The dashboard hit it first
     because it fanned twelve queries out at once.

     Four, not eight. The pooler is slow to reclaim sessions after a client
     goes away, so in practice fewer than 15 are free at any moment — a pool
     of 8 still produced "max clients reached" under ordinary browser load,
     where several pages each fire their own badge and notification calls.

     Four is not a throughput limit worth worrying about here: warm queries
     run in 30-150ms, so one connection serves roughly 10 requests a second,
     and this is an SME ERP with a handful of concurrent users. Being unable
     to connect at all is far more expensive than queueing briefly. */
  max: Number(process.env.PG_POOL_MAX || 4),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 300000),   // 5 min, was 10s
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 15000),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

/* Counted, not just announced. "Connected" printed 51 times in one test run
   was the clue that the pool was churning; a running total makes that
   visible instead of scrolling past. */
let physicalConnections = 0;
pool.on('connect', () => {
  physicalConnections++;
  console.log(`✅ Connected to Supabase PostgreSQL. (physical connections opened: ${physicalConnections})`);
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PG pool error:', err.message);
});

/* ── query tracing ────────────────────────────────────────────────────
   Set PG_TRACE=1 to log every query with its duration.

   Worth having permanently. Endpoint latency here turned out to be almost
   entirely a function of HOW MANY queries a request makes — each round trip
   to the hosted database costs ~440ms, so 445ms is one query, 880ms is two,
   1.3s is three, and 4.9s is eleven. Without a count per request that is
   invisible, and the temptation is to optimise the SQL when the problem is
   the number of times you ask. */
const TRACE = process.env.PG_TRACE === '1';
let queryCount = 0;

async function query(text, params) {
  if (!TRACE) { queryCount++; return pool.query(text, params); }
  const n = ++queryCount;
  const t0 = Date.now();
  try {
    return await pool.query(text, params);
  } finally {
    const sql = String(text).replace(/\s+/g, ' ').trim().slice(0, 90);
    console.log(`  [pg ${String(n).padStart(4)}] ${String(Date.now() - t0).padStart(5)}ms  ${sql}`);
  }
}

module.exports = {
  query,
  getClient: () => pool.connect(), // for transactions (BEGIN/COMMIT)
  pool,
  stats: () => ({ queries: queryCount, connections: physicalConnections }),
};
