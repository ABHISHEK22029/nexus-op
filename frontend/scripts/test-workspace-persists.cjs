#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   "Every time I log in it asks for the org name and employee count again."

   Reported from the live product. One account has vendors, purchase orders
   and a project, and no company_profile row at all — so the setup screen
   has every right to keep appearing. The question is why the row is
   missing when the person says they filled the form in.

   Three candidates, and they need separating rather than guessing:

     1. The form's save silently fails, so nothing is ever written.
     2. The save writes, but under a different owner than the read uses,
        so it is invisible on the next login.
     3. The save works and the person clicked "Skip for now", which
        deliberately writes nothing.

   This walks the whole thing through a real browser: sign up, fill the
   form, sign out, sign back in. Then it does the same again clicking Skip,
   because the two paths must be told apart before anything is "fixed".
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const onSetup = p => p.evaluate(() => /Set up your workspace/i.test(document.body.innerText));

(async () => {
  console.log('');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });

  /* Every request the page makes to /company-profile, so a failing save
     cannot hide behind a screen that looks like it worked. */
  const calls = [];
  page.on('response', async r => {
    if (r.url().includes('/company-profile')) {
      calls.push(`${r.request().method()} ${r.status()}`);
    }
  });

  const mk = async (label) => {
    const r = await (await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: label, email: `${label}-${stamp}@example.test`, password: 'testpassword123' }),
    })).json();
    if (!r.token) { console.error('register failed:', r); process.exit(1); }
    return r;
  };

  /* A fresh browser session, the way a returning user arrives. */
  const signIn = async (token) => {
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(1800);
  };

  /* ══ A. the person who FILLS THE FORM IN ══════════════════ */
  console.log('  ── fills the form in, then comes back tomorrow');
  const a = await mk('fills');
  await signIn(a.token);
  ok(await onSetup(page), 'a new account is asked to set up its workspace');

  calls.length = 0;
  await page.type('input', `Kirashi ${stamp}`);
  /* The employee count too — it is half of what the person says they keep
     re-entering. */
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^2.10$/.test(b.innerText.trim()))?.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /Start using/i.test(b.innerText))?.click();
  });
  await sleep(2500);
  ok(!(await onSetup(page)), 'the form accepts it and lets them in');
  ok(calls.some(c => c.startsWith('PUT 200')), `the save reached the server → ${calls.join(', ') || 'NO CALL MADE'}`);

  const saved = await (await fetch(`${API}/company-profile`, {
    headers: { Authorization: `Bearer ${a.token}` },
  })).json();
  ok(saved?.name === `Kirashi ${stamp}`, `the server kept the name → "${saved?.name ?? 'nothing'}"`);
  ok(!!saved?.setup_completed_at, `and marked setup complete → ${saved?.setup_completed_at ? 'yes' : 'NO'}`);
  ok(saved?.employee_count === '2–10', `and kept the employee count → "${saved?.employee_count ?? 'nothing'}"`);

  /* The actual complaint: come back later. */
  await signIn(a.token);
  ok(!(await onSetup(page)), 'signing in again does NOT ask a second time');

  /* And their work is still theirs. */
  await fetch(`${API}/vendors`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Supplier ${stamp}`, type: 'Supplier' }),
  });
  await signIn(a.token);
  const vend = await (await fetch(`${API}/vendors?limit=50`, {
    headers: { Authorization: `Bearer ${a.token}` },
  })).json();
  ok((vend.items || vend).some(v => v.name === `Supplier ${stamp}`),
    `a vendor created before signing out is still there after signing back in`);

  /* ══ B. the person who clicks SKIP ════════════════════════ */
  console.log('\n  ── clicks "Skip for now" instead');
  const b = await mk('skips');
  await signIn(b.token);
  ok(await onSetup(page), 'also asked to set up');

  calls.length = 0;
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => /Skip for now/i.test(x.innerText))?.click();
  });
  await sleep(2200);
  ok(calls.some(c => c.startsWith('PUT')),
    `skipping records that the question was asked → ${calls.join(', ') || 'NO REQUEST — it will ask again forever'}`);

  /* The whole point: it must not ask again. */
  await signIn(b.token);
  ok(!(await onSetup(page)), 'and the next sign-in does NOT ask again');

  /* But no name may be invented, or the dashboard stops chasing it. */
  const skipped = await (await fetch(`${API}/company-profile`, {
    headers: { Authorization: `Bearer ${b.token}` },
  })).json();
  ok(!skipped?.name, `no company name was invented → ${JSON.stringify(skipped?.name ?? null)}`);

  const readiness = await (await fetch(`${API}/setup/readiness`, {
    headers: { Authorization: `Bearer ${b.token}` },
  })).json();
  const nameCheck = (readiness.checks || []).find(c => c.key === 'company_name');
  ok(nameCheck && !nameCheck.ok,
    `the dashboard still chases the missing name → ${nameCheck ? `"${nameCheck.label}" flagged` : 'NO SUCH CHECK'}`);

  await browser.close();

  /* ── clean up ───────────────────────────────────────────── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  /* Via the shared purge: activities carry an owner_id foreign key, and
     deleting the user first fails on it. */
  const ids = [a.user.id, b.user.id];
  const { purgeOrg } = require(path.join(base, 'scripts', 'lib', 'purgeOrg'));
  await purgeOrg({ query: (t, p) => c.query(t, p) }, ids);
  await c.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await c.end();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
