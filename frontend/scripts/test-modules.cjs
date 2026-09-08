#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Switching the contracting screens off, and back on.

   Bill of Quantities, the Measurement Book, Indents and RA bills are
   civil-contracting features — Indents even carry a `chainage` field,
   distance along a road. Good for a contractor, meaningless to a furniture
   maker, and every organisation saw all of them.

   A switch rather than a deletion, so the two things that must be true are:

     · off actually removes them from the menu and the routes
     · off DELETES NOTHING — switch it back on and the records are there

   The second is the one worth testing hardest. A preference that quietly
   destroys data is not a preference.
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

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Founder', email: `mod-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  if (!reg.token) { console.error('register failed:', reg); process.exit(1); }
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };

  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({
      name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString(),
      modules: { contracting: true },
    }),
  });

  /* Something to lose. A BOQ line belongs to a project, so make one.
     clientName is NOT NULL — leaving it out failed the create, and the
     empty BOQ list that followed looked like the switch had eaten the
     data when nothing had ever been written. */
  const proj = await (await fetch(`${API}/projects`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      name: `Site ${stamp}`, clientName: `Client ${stamp}`, type: 'Civil', status: 'Active',
    }),
  })).json();
  if (!proj.id) { console.error('project create failed:', proj); process.exit(1); }
  const boq = await (await fetch(`${API}/boq`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      projectId: proj.id, itemCode: `BQ-${stamp}`, description: `Earthwork ${stamp}`,
      unit: 'Cum', estimatedQuantity: 100, rate: 250,
    }),
  })).json();
  ok(!!boq.id || boq.success, `a BOQ line exists before the switch is touched`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  const menuHas = async (label) => {
    await page.goto(`${UI}/production`, { waitUntil: 'networkidle2' });
    await sleep(1800);
    /* The panel is not a <nav> element, so scoping the search to one found
       nothing and reported a present menu entry as missing. The whole
       document is the honest place to look — the BOQ screen itself is not
       open, so a match can only be the menu. */
    return page.evaluate((l) => new RegExp(l, 'i').test(document.body.innerText), label);
  };

  /* ── on: the screens are there ─────────────────────────── */
  console.log('\n  ── with contracting on');
  ok(await menuHas('Bill of quantities'), 'Bill of quantities is in the Production menu');
  await page.goto(`${UI}/boq`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  ok(await page.evaluate(() => !/Not switched on/i.test(document.body.innerText)),
    'and the screen opens');

  /* ── switch it off ─────────────────────────────────────── */
  console.log('\n  ── switched off in Configure → Modules');
  await page.goto(`${UI}/configurator/modules`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  ok(await page.evaluate(() => /Contracting/i.test(document.body.innerText)),
    'the Modules screen lists Contracting');
  ok(await page.evaluate(() => /does not delete anything/i.test(document.body.innerText)),
    'and says plainly that switching off deletes nothing');

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^on$/i.test(b.innerText.trim()))?.click();
  });
  await sleep(2500);

  const saved = await (await fetch(`${API}/company-profile`, { headers: auth })).json();
  ok(saved.modules?.contracting === false, `the setting is stored → ${JSON.stringify(saved.modules)}`);

  /* ── off: gone from the menu and the route ─────────────── */
  ok(!(await menuHas('Bill of quantities')), 'Bill of quantities is no longer in the menu');
  await page.goto(`${UI}/boq`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  const offText = await page.evaluate(() => document.body.innerText);
  ok(/Not switched on/i.test(offText),
    'opening the URL directly explains it is switched off rather than showing an empty page');
  ok(/Nothing has been deleted/i.test(offText), 'and says the records are still there');
  ok(!/Not part of your role/i.test(offText),
    'and does NOT call it a permission problem — it is not one');

  /* ── the data survived ─────────────────────────────────── */
  console.log('\n  ── and nothing was deleted');
  const stillThere = await (await fetch(`${API}/boq?limit=50`, { headers: auth })).json();
  const rows = Array.isArray(stillThere) ? stillThere : (stillThere.items || []);
  ok(rows.some(b => b.description === `Earthwork ${stamp}`),
    `the BOQ line is untouched behind the switch (${rows.length} rows)`);

  /* ── back on ───────────────────────────────────────────── */
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth, body: JSON.stringify({ modules: { contracting: true } }),
  });
  ok(await menuHas('Bill of quantities'), 'switching it back on restores the menu entry');
  await page.goto(`${UI}/boq`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  ok(await page.evaluate(() => !/Not switched on/i.test(document.body.innerText)),
    'and the screen opens again, with the data still in it');

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 110) : ''}`);
  await browser.close();

  /* ── clean up ──────────────────────────────────────────── */
  const { Client } = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'pg'));
  require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'dotenv'))
    .config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM boq_items WHERE "itemCode" = $1', [`BQ-${stamp}`]).catch(() => {});
  await c.query('DELETE FROM projects WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM company_profile WHERE owner_id = $1', [reg.user.id]);
  await c.query('DELETE FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  const { rows: left } = await c.query('SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  await c.end();
  ok(Number(left[0].c) === 0, 'test organisation removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
