#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Two things built without a test behind them, now covered.

   1. The menu as it is used (26 Nov 2026). navtest.mjs reads the
      definition; this reads the rail as rendered: Marketing folded into
      Sales (Enquiries and Catalogue are where an order starts), Money for
      what is owed both ways, Settings with its Admin group, Help small at
      the foot, + New for the documents made most often, and the Guide
      switched off (lib/features).

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
      body: JSON.stringify({ name: `${label} Co`, gstin: '36ABCDE1234F1Z9', stateCode: '36',
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

  const railNow = () => page.evaluate(() => ({
    items: [...document.querySelectorAll('.nav-rail-item')].map(b => b.innerText.trim()).filter(Boolean),
    foot: [...document.querySelectorAll('.nav-rail-foot')].map(b => b.innerText.trim()).filter(Boolean),
    lit: (document.querySelector('.nav-rail-item.is-active, .nav-rail-foot.is-active')?.innerText || '').trim(),
  }));
  const panelNow = () => page.evaluate(() =>
    [...document.querySelectorAll('.nav-panel a, .nav-panel-row, .nav-panel-items a')].map(a => a.innerText.trim()).filter(Boolean).join(' | '));
  const clickRail = (label) => page.evaluate((l) => {
    [...document.querySelectorAll('.nav-rail-item, .nav-rail-foot')].find(x => x.innerText.trim() === l)?.click();
  }, label);

  console.log('\n  ── the rail, as it is used');
  await asUser(owner.token);
  const r = await railNow();
  ok(['Home', 'Sales', 'Purchases', 'Money', 'Settings'].every(l => r.items.includes(l)), `the rail (${r.items.join(' · ')})`);
  ok(!r.items.some(l => /Marketing|Configurator/i.test(l)), 'no Marketing or Configurator of their own');
  ok(r.foot.includes('Help') && !r.items.includes('Help'), `Help sits at the foot (${r.foot.join(' · ')})`);
  ok(!(await page.$('.nav-rail-guide')) && !(await page.$('.tut-panel')), 'the Guide is switched off, and no tour pops up');

  await clickRail('Sales');
  await sleep(1500);
  const sales = await panelNow();
  ok(/Enquiries/.test(sales) && /Catalogue/.test(sales), `Enquiries and Catalogue are under Sales (${sales})`);
  ok(['Customers', 'Quotations', 'Orders', 'Delivery challans', 'Invoices'].every(l => sales.includes(l)), 'with the rest of selling, in the order it happens');
  ok(/\/customer-orders/.test(await page.evaluate(() => location.pathname)), 'Sales opens on Orders');

  await page.goto(`${UI}/enquiries`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok((await railNow()).lit === 'Sales', `landing on /enquiries lights Sales (${(await railNow()).lit})`);

  await clickRail('Money');
  await sleep(1800);
  const money = await page.evaluate(() => location.pathname + location.search);
  ok(money === '/receivables?view=unpaid' && (await railNow()).lit === 'Money', `Money opens on what is to collect (${money})`);
  const mp = await panelNow();
  ok(/To collect/.test(mp) && /To pay/.test(mp), `and has both ways (${mp})`);

  await clickRail('Help');
  await sleep(1500);
  ok(/^\/knowledge/.test(await page.evaluate(() => location.pathname)) && (await railNow()).lit === 'Help', 'Help opens the knowledge base and lights');

  console.log('\n  ── + New');
  const newBtn = await page.$('[data-rail-new]');
  ok(!!newBtn, '+ New is in the rail');
  if (newBtn) {
    await newBtn.click(); await sleep(400);
    const items = await page.$$eval('[data-new-item]', els => els.map(e => e.getAttribute('data-new-item')));
    ok(['Quotation', 'Order', 'Delivery challan', 'Invoice', 'Purchase order'].every(l => items.includes(l)), `it offers ${items.join(', ')}`);
    const box = await page.$eval('.nav-rail-new-menu', el => { const b = el.getBoundingClientRect(); return { l: b.left, w: b.width, vw: innerWidth }; });
    ok(box.w > 120 && box.l + box.w <= box.vw, 'the menu opens in full view, beside the rail');
    await page.keyboard.press('Escape'); await sleep(200);
    ok(!(await page.$('.nav-rail-new-menu')), 'Esc closes it');
    await newBtn.click(); await sleep(300);
    await page.click('[data-new-item="Quotation"]');
    await sleep(2500);
    ok(/\/sales-quotations\?new=1/.test(await page.evaluate(() => location.pathname + location.search)), 'Quotation goes to quotations…');
    ok(!!(await page.$('form')), '…with the form already open');
  }

  console.log('\n  ── Settings');
  await clickRail('Settings');
  await sleep(1500);
  const ownerSettings = await panelNow();
  const short = (t) => [...new Set(t.split(' | ').map(x => x.split('\n')[0]))].join(' · ');
  ok(['Company profile', 'Document numbering', 'Team', 'Import data'].every(l => ownerSettings.includes(l)), `Settings: the company, its people, its data (${short(ownerSettings)})`);
  /* adminOnly is the Administrator and the company's Owner — as it was
     under Configurator. The Owner runs the company and sets up its roles. */
  ok(/Users & roles/.test(ownerSettings) && /Roles & permissions/.test(ownerSettings), 'and the Admin group, for the Owner who runs the company');
  await asUser(admin.token);
  await clickRail('Settings');
  await sleep(1500);
  const adminSettings = await panelNow();
  ok(/Users & roles/.test(adminSettings) && /Roles & permissions/.test(adminSettings) && /Change history/.test(adminSettings),
    'and for an Administrator, with Change history');

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
