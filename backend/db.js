require('dotenv').config();
const { Pool, types } = require('pg');

// DATE columns (oid 1082) should stay calendar dates, not shift by timezone.
// Without this, node-pg parses a DATE to a local-midnight JS Date and then
// serializes it to UTC — turning 2026-08-01 into "2026-07-31T18:30:00Z" for
// IST users (an off-by-one). Return the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
});

pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL.');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PG pool error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(), // for transactions (BEGIN/COMMIT)
  pool,
};
