/* Put a saved company profile back, onto the company it belongs to.

   seed-org.js writes the profile it is about to replace to
   .company_profile.backup.json first. That was written when the whole
   install had ONE profile row; since migration 046 every company has its
   own (company_profile.owner_id). The old version of this script wrote the
   backup over "the first row in the table", which is now some other
   company's identity. This one is told which company, by its id.

   Safe by default:
     · a dry run unless --apply: it prints what it would fill and writes nothing
     · it only fills fields that are empty now; anything the company has
       typed since is left alone
     · never the document prefix or the modules (numbering and screens)
     · only a company (a user whose org is itself), never a member account

   Usage:
     node scripts/restore-profile.js --show
     node scripts/restore-profile.js --owner=687                 (dry run)
     node scripts/restore-profile.js --owner=687 --owner=468 --apply */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db');

const file = path.join(__dirname, '..', '.company_profile.backup.json');
if (!fs.existsSync(file)) { console.error('no backup at ' + file); process.exit(1); }
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const owners = args.filter(a => a.startsWith('--owner=')).map(a => Number(a.slice(8))).filter(Number.isInteger);

/* what a person sees of a value when checking it: enough to recognise,
   not the whole tax or bank number */
const peek = (k, v) => {
  if (v == null || v === '') return '—';
  const s = String(v);
  return /gstin|pan|bank_account_no|phone/i.test(k) && s.length > 6 ? `${s.slice(0, 4)}…${s.slice(-2)}` : s.slice(0, 60);
};
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const NEVER = new Set(['id', 'owner_id', 'doc_prefix', 'modules']);

if (args.includes('--show')) {
  for (const [k, v] of Object.entries(saved)) if (!blank(v)) console.log(`  ${k}: ${peek(k, v)}`);
  process.exit(0);
}
if (!owners.length) {
  console.error('say which company: --owner=<id> (a dry run unless --apply). --show prints the backup.');
  process.exit(1);
}

(async () => {
  const cols = new Set((await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'company_profile'`)).rows.map(r => r.column_name));
  const fields = Object.keys(saved).filter(k => !NEVER.has(k) && cols.has(k) && !blank(saved[k]));
  let failed = 0;

  for (const owner of owners) {
    const { rows: [org] } = await db.query(
      `SELECT id, name, email FROM users WHERE id = $1 AND (org_id IS NULL OR org_id = id)`, [owner]);
    if (!org) { console.log(`\n#${owner}: not a company (no such user, or a member of another company) — skipped`); failed++; continue; }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: [now] } = await client.query(
        'SELECT * FROM company_profile WHERE owner_id = $1 FOR UPDATE', [owner]);
      const fill = fields.filter(k => !now || blank(now[k]));
      const kept = fields.filter(k => now && !blank(now[k]));
      console.log(`\n#${owner} ${org.name} <${org.email.replace(/^(.).*@/, '$1…@')}>: ${now ? 'has a profile row' : 'no profile row yet'}`);
      for (const k of fill) console.log(`   + ${k}: ${peek(k, saved[k])}`);
      for (const k of kept) console.log(`   = ${k}: kept as typed (${peek(k, now[k])})`);
      if (!fill.length) { console.log('   nothing to fill'); await client.query('ROLLBACK'); continue; }
      if (!apply) { await client.query('ROLLBACK'); console.log('   (dry run — nothing written; add --apply to write)'); continue; }

      if (now) {
        await client.query(
          `UPDATE company_profile SET ${fill.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE id = $${fill.length + 1}`,
          [...fill.map(k => saved[k]), now.id]);
      } else {
        await client.query(
          `INSERT INTO company_profile (${fill.map(k => `"${k}"`).join(', ')}, owner_id)
           VALUES (${fill.map((_, i) => `$${i + 1}`).join(', ')}, $${fill.length + 1})`,
          [...fill.map(k => saved[k]), owner]);
      }
      const { rows: [back] } = await client.query('SELECT * FROM company_profile WHERE owner_id = $1', [owner]);
      const off = fill.filter(k => JSON.stringify(back[k] ?? null) !== JSON.stringify(saved[k] ?? null)
        && String(back[k] ?? '') !== String(saved[k] ?? ''));
      if (off.length) throw new Error(`did not read back the same: ${off.join(', ')}`);

      await client.query('COMMIT');
      console.log(`   ✅ restored ${fill.length} fields`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.log(`   ❌ ${e.message} — nothing written for #${owner}`); failed++;
    } finally { client.release(); }
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
