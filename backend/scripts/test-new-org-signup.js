#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A brand new organisation signs up. What do they actually get?

   The claim to test is "a fresh platform start". Three ways that can fail
   and two of them are silent:

     1. Registration is refused outright (it is closed by default).
     2. They land straight on the dashboard, never seeing the first-run
        screen, because company_profile was a single global row that
        already had a name in it.
     3. They see the existing organisation's customers and vendors.

   Creates a throwaway account, walks it through, and deletes it — the
   account, its profile, and anything it made.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const stamp = Date.now().toString(36);
const EMAIL = `orgtest-${stamp}@example.test`;
const PASSWORD = 'testpassword123';
const ORG = `Test Fabricators ${stamp.toUpperCase()}`;

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 100) }; }
  return { status: res.status, ok: res.ok, body };
};

(async () => {
  console.log(`\n  signing up ${EMAIL}\n`);

  /* ── 1. can they even register? ── */
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Owner', email: EMAIL, password: PASSWORD }),
  });
  ok(reg.ok, `POST /auth/register accepted (${reg.status})` +
    (reg.ok ? '' : ` — ${reg.body.error || ''}${reg.body.detail ? ': ' + reg.body.detail : ''}`));

  if (!reg.ok) {
    console.log('\n  Self-registration is closed. Set ALLOW_SELF_REGISTRATION=true');
    console.log('  (open signup) or SIGNUP_TOKEN=<secret> (invite-only) to enable it.\n');
    process.exit(1);
  }
  const token = reg.body.token;

  /* ── 2. do they get a BLANK profile, not the existing company's? ── */
  const prof = await call('/company-profile', {}, token);
  ok(prof.ok, `GET /company-profile answers (${prof.status})`);
  ok(!prof.body.name,
    `their profile has no company name yet → ${JSON.stringify(prof.body.name)}`);
  ok(!prof.body.gstin,
    `and no GSTIN inherited from the existing organisation → ${JSON.stringify(prof.body.gstin)}`);

  /* This is what App.jsx checks to decide whether to send them to /welcome.
     A name here means they skip onboarding entirely. */
  const wouldSeeWelcome = !prof.body.setup_completed_at && !prof.body.name;
  ok(wouldSeeWelcome, 'the app would route them to the first-run screen at /welcome');

  /* ── 3. is the platform actually empty for them? ── */
  for (const [path, label] of [
    ['/customers', 'customers'], ['/vendors', 'vendors'],
    ['/inventory', 'stock rows'], ['/sales-quotations', 'quotations'],
  ]) {
    const r = await call(`${path}?limit=5`, {}, token);
    const rows = Array.isArray(r.body) ? r.body : (r.body.items || []);
    ok(rows.length === 0, `${label}: they see none of the existing org's data (${rows.length})`);
  }

  /* ── 4. the first-run screen saves org name and headcount ── */
  const setup = await call('/company-profile', {
    method: 'PUT',
    body: JSON.stringify({
      name: ORG, employee_count: '11-50',
      setup_completed_at: new Date().toISOString(),
    }),
  }, token);
  ok(setup.ok, `saving the first-run answers works (${setup.status})`);
  ok(setup.body?.name === ORG, `their organisation name is stored → ${JSON.stringify(setup.body?.name)}`);
  ok(setup.body?.employee_count === '11-50', `headcount band is stored → ${JSON.stringify(setup.body?.employee_count)}`);

  /* ── 5. and it did NOT overwrite the original organisation ── */
  const { rows: profiles } = await db.query(
    'SELECT id, owner_id, name FROM company_profile ORDER BY id');
  ok(profiles.length >= 2, `a separate profile row was created (${profiles.length} total)`);
  const original = profiles.find(p => p.name && p.name !== ORG);
  ok(!!original, `the original organisation is untouched → ${original?.name}`);

  /* ── 6. they would no longer be sent to /welcome ── */
  const after = await call('/company-profile', {}, token);
  ok(!!after.body.setup_completed_at && !!after.body.name,
    'after setup they go straight to the dashboard');

  /* ── clean up ── */
  const { rows: [u] } = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [EMAIL]);
  if (u) {
    await db.query('DELETE FROM company_profile WHERE owner_id = $1', [u.id]);
    await db.query('DELETE FROM users WHERE id = $1', [u.id]);
  }
  const { rows: left } = await db.query('SELECT COUNT(*) c FROM users WHERE LOWER(email) = LOWER($1)', [EMAIL]);
  ok(Number(left[0].c) === 0, 'test account removed — database left as found');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
