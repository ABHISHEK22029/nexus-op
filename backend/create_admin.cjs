#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   create_admin.cjs — insert (or update) a single admin user.

   Usage:
     node create_admin.cjs <email> <password> [name] [role]

   Example:
     node create_admin.cjs admin@nexusop.com "S3cure!pass" "Site Admin" Admin

   Requires DATABASE_URL in backend/.env (already configured).
   Ensures the users table exists, then upserts the user with a
   bcrypt-hashed password. Re-running with the same email updates
   the password (handy for resets).
   ══════════════════════════════════════════════════════════ */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const [, , email, password, name = 'Administrator', role = 'Admin'] = process.argv;

if (!email || !password) {
  console.error('Usage: node create_admin.cjs <email> <password> [name] [role]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    // Ensure the table exists (mirrors migrations/004_auth.sql).
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name          TEXT,
        role          TEXT NOT NULL DEFAULT 'Admin',
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        last_login    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));`
    );

    const hash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             is_active = TRUE
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), hash, name, role]
    );

    const u = result.rows[0];
    console.log('✅ Admin user ready:');
    console.log(`   id:    ${u.id}`);
    console.log(`   email: ${u.email}`);
    console.log(`   name:  ${u.name}`);
    console.log(`   role:  ${u.role}`);
    console.log('\nYou can now sign in at /login with these credentials.');
  } catch (err) {
    console.error('❌ Failed to create admin:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
