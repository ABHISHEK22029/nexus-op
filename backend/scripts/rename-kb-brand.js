#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The in-app help articles still said "Nexus-OP": they were seeded before
   the rename, and the seed files were corrected but the rows never were.
   This puts "Maks Ops" in their place: title, summary, body and the
   structured content (keywords too), and moves the one article whose
   address had the old name (why-nexus-op → why-maks-ops), as the seed now
   has it. The search index follows by itself (the kb_articles trigger).

     node scripts/rename-kb-brand.js            dry run: says what would change
     node scripts/rename-kb-brand.js --apply    changes it, in one transaction

   Safe to run again: a second run finds nothing to change.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config();
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const OLD = /Nexus-OP/g;
const NEW = 'Maks Ops';
const SLUGS = { 'why-nexus-op': 'why-maks-ops' };

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN');
    const rows = (await c.query(
      `SELECT id, slug, title, summary, body, keywords, structured::text AS structured
         FROM kb_articles
        WHERE (slug || ' ' || title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, '') || ' '
               || coalesce(keywords, '') || ' ' || coalesce(structured::text, '')) ILIKE '%nexus%'
        ORDER BY id FOR UPDATE`)).rows;

    let fields = 0;
    for (const r of rows) {
      const next = {};
      for (const f of ['title', 'summary', 'body', 'keywords', 'structured']) {
        if (r[f] && OLD.test(r[f])) { next[f] = r[f].replace(OLD, NEW); }
        OLD.lastIndex = 0;
      }
      if (SLUGS[r.slug]) next.slug = SLUGS[r.slug];
      const changed = Object.keys(next);
      if (!changed.length) continue;
      fields += changed.length;
      console.log(`#${r.id} ${r.slug}: ${changed.join(', ')}${next.title ? `  → "${next.title}"` : ''}`);
      if (APPLY) {
        const sets = changed.map((f, i) => `"${f}" = $${i + 2}${f === 'structured' ? '::jsonb' : ''}`);
        await c.query(`UPDATE kb_articles SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [r.id, ...changed.map((f) => next[f])]);
      }
    }

    if (APPLY) {
      const left = (await c.query(
        `SELECT count(*)::int n FROM kb_articles
          WHERE (slug || ' ' || title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, '') || ' '
                 || coalesce(keywords, '') || ' ' || coalesce(structured::text, '')) ILIKE '%nexus%'`)).rows[0].n;
      if (left) throw new Error(`${left} article(s) still mention Nexus after the update; nothing was changed`);
      await c.query('COMMIT');
      console.log(`\n✅ ${fields} field(s) in ${rows.length} article(s) updated; no article mentions Nexus now`);
    } else {
      await c.query('ROLLBACK');
      console.log(`\n(dry run) ${fields} field(s) in ${rows.length} article(s) would change. Run with --apply to do it.`);
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
