#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Two things built without a test behind them, now covered.

   1. The Marketing menu. The structure is checked by navtest.mjs, but that
      reads the definition file — it cannot say whether the rail actually
      renders a Marketing button, whether clicking it lists Enquiries and
      Catalogue, or whether those two really left the Sales menu.

   2. The "All organisations" badge. A cross-tenant role reads every
      organisation's data, which is by design and indistinguishable from a
      leak unless the screen says so. That badge is the whole mitigation,
      so it needs to be shown to appear for an Administrator and NOT for an
      Owner — a warning that shows for everybody is noise, and one that
      shows for nobody is nothing.

   The Administrator account is made by promoting a throwaway user in the
   database, because registration only ever creates Owners.

   Refuses to run against a deployed host, and removes what it creates.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const { sweepStale } = require(path.join(__dirname, '..', '..', 'backend', 'scripts', 'lib', 'testAccounts'));

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BACKEND = path.join(__dirname, '..', '..', 'backend');

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('nav-');

  const make = async (label) => {
    const r = await (await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: label, email: `nav-${label}-${stamp}@example.test`, password: 'testpassword123' }),
    })).json();
    await fetch(`${API}/company-profile`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${label} Co`, gstin: '36AAMCK2569F1Z9', stateCode: '36',
        setup_completed_at: new Date().toISOString() }),
    });
    return { token: r.token, id: r.user.id };
  };
  const owner = await make('owner');
  const admin = await make('admin');

  require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });
  const { Client } = require(path.join(BACKEND, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("UPDATE users SET role = 'Administrator' WHERE id = $1", [admin.id]);
  /* The role lives in the token, so the promoted account needs a fresh one. */
  const relog = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `nav-admin-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  admin.token = relog.token || admin.token;

  const me = async (t) => (await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } })).json();
  const ownerMe = await me(owner.token);
  const adminMe = await me(admin.token);

  console.log('  ── the server decides who is cross-tenant');
  ok(ownerMe.crossTenant === false, `an Owner is not cross-tenant (${ownerMe.crossTenant})`);
  ok(adminMe.crossTenant === true, `an Administrator is (${adminMe.crossTenant}, role "${adminMe.role}")`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });

  const asUser = async (token, url = '/dashboard') => {
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
    await page.goto(`${UI}${url}`, { waitUntil: 'networkidle2' });
    await sleep(1800);
  };

  console.log('\n  ── the Marketing menu, in the rail');
  await asUser(owner.token);
  const rail = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-rail-item, .nav-rail button')].map(b => b.innerText.trim()).filter(Boolean));
  ok(rail.some(l => /Marketing/i.test(l)), `Marketing is in the rail (${rail.join(' · ')})`);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-rail-item, .nav-rail button')]
      .find(x => /Marketing/i.test(x.innerText));
    b?.click();
  });
  await sleep(1200);
  const panel = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-panel a, .nav-panel-row, .nav-panel-items a')].map(a => a.innerText.trim()).filter(Boolean).join(' | '));
  ok(/Enquiries/i.test(panel), `Enquiries is under Marketing (${panel})`);
  ok(/Catalogue/i.test(panel), 'Catalogue is under Marketing');

  await page.goto(`${UI}/customers`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  const salesPanel = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-panel a, .nav-panel-row, .nav-panel-items a')].map(a => a.innerText.trim()).filter(Boolean).join(' | '));
  ok(!/Enquiries/i.test(salesPanel) && !/Catalogue/i.test(salesPanel),
    `and neither is still under Sales (${salesPanel})`);

  console.log('\n  ── landing on /enquiries lights Marketing, not Sales');
  await page.goto(`${UI}/enquiries`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  const active = await page.evaluate(() => {
    const el = document.querySelector('.nav-rail-item.is-active, .nav-rail .is-active');
    return el ? el.innerText.trim() : null;
  });
  ok(/Marketing/i.test(active || ''), `the rail highlights ${active}`);

  console.log('\n  ── the "All organisations" badge');
  await asUser(owner.token);
  const ownerSees = await page.evaluate(() => document.body.innerText);
  ok(!/All organisations/i.test(ownerSees), 'an Owner does not see it — it would be noise');

  await asUser(admin.token);
  await sleep(800);
  const adminSees = await page.evaluate(() => document.body.innerText);
  ok(/All organisations/i.test(adminSees), 'an Administrator does');
  const tip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[title]')].find(e => /All organisations/i.test(e.innerText || ''));
    return el ? el.getAttribute('title') : null;
  });
  ok(/every organisation/i.test(tip || ''),
    `and it explains what that means — "${(tip || '').slice(0, 70)}…"`);

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 90) : ''}`);
  await browser.close();

  for (const u of [owner, admin]) {
    await c.query('DELETE FROM company_profile WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM users WHERE id = $1', [u.id]).catch(() => {});
  }
  await c.end();

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
