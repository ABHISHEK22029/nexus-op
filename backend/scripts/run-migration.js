/* Apply one migration file.  node scripts/run-migration.js 038_...sql
   Wrapped in a transaction so a half-applied migration is not a state the
   database can end up in. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

const name = process.argv[2];
if (!name) { console.error('usage: node scripts/run-migration.js <file.sql>'); process.exit(1); }
const file = path.join(__dirname, '..', 'migrations', name);
if (!fs.existsSync(file)) { console.error('no such migration:', file); process.exit(1); }

(async () => {
  const sql = fs.readFileSync(file, 'utf8');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`✅ applied ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`❌ ${name} rolled back: ${e.message}`);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
})();
