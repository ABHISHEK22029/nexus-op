#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The company logo, uploaded as a file.

   The point of this test is not that an upload returns 200 — it is that
   the bytes that come back are the bytes that went in, and that they come
   back to ONE organisation. A letterhead is the company's identity on a
   tax document; serving tenant A's mark to tenant B is the same class of
   mistake as serving their bank account.

   So: two organisations, each uploading their own image, then each asking
   for a logo and checking which one they get.

   Refuses to run against a deployed host, and deletes both accounts and
   everything they created on the way out.
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { sweepStale } = require('../scripts/lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

/* Two visibly different 1x1 PNGs — different bytes, so "did I get my own
   image back" is a real question and not a coincidence. */
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64');
const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

async function register(label) {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: label, email: `logo-${label}-${stamp}@example.test`, password: 'testpassword123' }),
  });
  const j = await r.json();
  if (!j.token) throw new Error(`register ${label} failed: ${JSON.stringify(j).slice(0, 120)}`);
  return { token: j.token, id: j.user.id };
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function uploadLogo(token, bytes, filename, type = 'image/png') {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type }), filename);
  return fetch(`${API}/company-profile/logo`, { method: 'POST', headers: auth(token), body: fd });
}

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('logo-');

  const A = await register('alpha');
  const B = await register('beta');

  console.log('  ── uploading');
  let r = await uploadLogo(A.token, PNG_A, 'alpha.png');
  const meta = await r.json();
  ok(r.status === 200 && meta.uploaded, `org A uploads a logo (${meta.mime}, ${meta.size_bytes} bytes)`);

  r = await uploadLogo(B.token, PNG_B, 'beta.png');
  ok(r.status === 200, 'org B uploads a different logo');

  console.log('\n  ── each organisation gets its OWN logo back');
  r = await fetch(`${API}/company-profile/logo`, { headers: auth(A.token) });
  const gotA = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && gotA.equals(PNG_A), 'org A gets byte-identical bytes back');
  ok(!gotA.equals(PNG_B), 'and not org B’s image');

  r = await fetch(`${API}/company-profile/logo`, { headers: auth(B.token) });
  const gotB = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && gotB.equals(PNG_B), 'org B gets its own, not org A’s');

  ok(r.headers.get('content-type') === 'image/png', `served with its real content type (${r.headers.get('content-type')})`);
  ok(/private/.test(r.headers.get('cache-control') || ''), `cached privately, never shared (${r.headers.get('cache-control')})`);

  console.log('\n  ── replacing, not accumulating');
  await uploadLogo(A.token, PNG_B, 'alpha-v2.png');
  r = await fetch(`${API}/company-profile/logo`, { headers: auth(A.token) });
  const replaced = Buffer.from(await r.arrayBuffer());
  ok(replaced.equals(PNG_B), 'a second upload replaces the first');
  const st = await (await fetch(`${API}/company-profile/logo/status`, { headers: auth(A.token) })).json();
  ok(st.exists === true, 'status reports one logo present');

  console.log('\n  ── what it refuses');
  r = await uploadLogo(A.token, Buffer.from('not an image at all'), 'notes.txt', 'text/plain');
  ok(r.status === 400, `a text file is refused (${r.status})`);
  r = await uploadLogo(A.token, Buffer.alloc(2 * 1024 * 1024 + 1024, 1), 'huge.png');
  ok(r.status === 413, `an oversized image is refused with a size message (${r.status})`);
  r = await fetch(`${API}/company-profile/logo`);
  ok(r.status === 401 || r.status === 403, `an unauthenticated request gets nothing (${r.status})`);

  console.log('\n  ── removing');
  r = await fetch(`${API}/company-profile/logo`, { method: 'DELETE', headers: auth(A.token) });
  ok(r.status === 200, 'org A removes its logo');
  r = await fetch(`${API}/company-profile/logo`, { headers: auth(A.token) });
  ok(r.status === 404, 'and then there is none');
  r = await fetch(`${API}/company-profile/logo`, { headers: auth(B.token) });
  ok(r.status === 200, 'org B’s logo is untouched by org A deleting theirs');

  /* ── clean up: leave the database as it was found ── */
  const base = path.join(__dirname, '..');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const u of [A, B]) {
    await c.query('DELETE FROM attachments WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM company_profile WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM users WHERE id = $1', [u.id]).catch(() => {});
  }
  const { rows } = await c.query(
    'SELECT COUNT(*)::int n FROM attachments WHERE owner_id = ANY($1)', [[A.id, B.id]]);
  await c.end();
  ok(rows[0].n === 0, 'test data removed — nothing left behind');

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
