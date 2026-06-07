require('dotenv').config();
const { Pool } = require('pg');

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
  pool,
};
