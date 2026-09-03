/* Put back the company profile that seed-org.js replaced.

   seed-org sets the organisation identity — name, GSTIN, PAN, address — to
   whichever org it is seeding. On a database that already belongs to a real
   business that is destructive, so it writes the previous row to
   .company_profile.backup.json first. This puts it back.

   Usage: node scripts/restore-profile.js [--show] */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db');

const file = path.join(__dirname, '..', '.company_profile.backup.json');
if (!fs.existsSync(file)) { console.error('no backup at ' + file); process.exit(1); }
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));

if (process.argv.includes('--show')) {
  console.log(JSON.stringify(saved, null, 2));
  process.exit(0);
}

(async () => {
  const { id, ...fields } = saved;
  const cols = Object.keys(fields);
  const { rows } = await db.query('SELECT id FROM company_profile ORDER BY id LIMIT 1');

  if (rows[0]) {
    await db.query(
      `UPDATE company_profile SET ${cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
      [...cols.map(c => fields[c]), rows[0].id]);
  } else {
    await db.query(
      `INSERT INTO company_profile (${cols.map(c => `"${c}"`).join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map(c => fields[c]));
  }

  const { rows: back } = await db.query('SELECT * FROM company_profile ORDER BY id LIMIT 1');
  const lost = cols.filter(c => JSON.stringify(back[0][c] ?? null) !== JSON.stringify(fields[c] ?? null));
  console.log(`restored: "${back[0].name}"`);
  console.log(lost.length ? `⚠ did not come back: ${lost.join(', ')}` : 'every field matches the backup ✅');
  process.exit(lost.length ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
