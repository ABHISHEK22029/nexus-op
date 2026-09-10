#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The catalogue, through a browser, from both sides.

   The business publishes it in Configure → Catalogue. Then a SEPARATE
   browser context with no token — a genuine stranger, the way somebody
   arriving from a WhatsApp link is — opens the page, adds to the basket
   and sends an enquiry. Then the business finds it in Sales → Enquiries
   and converts it.

   The stranger's context matters. Testing the public page in the same
   session that just published it would prove nothing: the token would be
   sitting in localStorage, and every request would carry it.
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
  console.log('');
  /* ── set the business up over the API; the UI part under test is the
        publishing screen and the public page, not the sign-up form ── */
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Owner', email: `cui-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ name: `Kirashi ${stamp}`, phone: '9866644456', setup_completed_at: new Date().toISOString() }),
  });
  const sku = await (await fetch(`${API}/skus`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: `11 KV V cross arm ${stamp}`, sku_code: `VC-${stamp}`, unit: 'Nos', price: 8500 }),
  })).json();
  const skuId = sku.id ?? sku.sku?.id;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const jsErrors = [];

  /* ══ the business publishes ══════════════════════════════ */
  console.log('  ── the business publishes its catalogue');
  const owner = await browser.newPage();
  owner.on('pageerror', e => jsErrors.push(`owner: ${e.message}`));
  await owner.setViewport({ width: 1500, height: 1000 });
  await owner.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await owner.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
  await owner.goto(`${UI}/configurator/catalogue`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  ok(await owner.evaluate(() => /catalogue/i.test(document.body.innerText)),
    'Configure → Catalogue opens');

  const slug = `kirashi-${stamp}`;
  await owner.evaluate((s) => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const byPlaceholder = (p) => [...document.querySelectorAll('input')].find(i => i.placeholder === p);
    set(byPlaceholder('your-company'), s);
    set(byPlaceholder('What you make, in your words'), 'Fabricated galvanized materials');
    set(byPlaceholder('A line of detail underneath'), '11kV line hardware, made to JBVNL spec');
  }, slug);
  await sleep(400);
  await owner.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Save$/.test(b.innerText.trim()))?.click());
  await sleep(1600);

  /* publish the catalogue, then the product */
  await owner.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Publish$/.test(b.innerText.trim()))?.click());
  await sleep(1600);
  ok(await owner.evaluate(() => /is live/i.test(document.body.innerText)),
    'publishing turns it live and says so');

  const link = await owner.evaluate(() => (document.body.innerText.match(/https?:\/\/\S+\/c\/[a-z0-9-]+/) || [])[0]);
  ok(!!link && link.includes(`/c/kirashi-`), `the shareable link is shown → ${link || 'NOT SHOWN'}`);

  await owner.evaluate(() => [...document.querySelectorAll('button')].find(b => /Hidden/i.test(b.innerText))?.click());
  await sleep(1500);
  ok(await owner.evaluate(() => /Listed/i.test(document.body.innerText)),
    'a product can be listed from the same screen');

  /* ══ a stranger opens it ═════════════════════════════════ */
  console.log('\n  ── a stranger with no token opens the link');
  const ctx = await browser.createBrowserContext();   // separate cookie/storage jar
  const guest = await ctx.newPage();
  guest.on('pageerror', e => jsErrors.push(`guest: ${e.message}`));
  await guest.setViewport({ width: 1300, height: 950 });
  await guest.goto(`${UI}/c/${slug}`, { waitUntil: 'networkidle2' });
  await sleep(2200);

  const hasToken = await guest.evaluate(() => !!localStorage.getItem('nexus_token'));
  ok(!hasToken, 'the visitor genuinely has no token in this context');

  const text = await guest.evaluate(() => document.body.innerText);
  ok(/Fabricated galvanized materials/i.test(text), 'the hero shows the business\'s own headline');
  ok(new RegExp(`Kirashi ${stamp}`, 'i').test(text), 'and the business\'s name, not ours');
  ok(/11 KV V cross arm/i.test(text), 'the published product is on the page');
  ok(!/8,?500/.test(text), 'the price is withheld — show_prices is off');
  ok(!/Sign in|Log in|Dashboard|Purchases/i.test(text), 'no app navigation leaks onto the public page');

  /* add to the basket and send */
  await guest.evaluate(() => [...document.querySelectorAll('button')].find(b => /Add to enquiry/i.test(b.innerText))?.click());
  await sleep(1200);
  ok(await guest.evaluate(() => /Your enquiry/i.test(document.body.innerText)),
    'adding opens the enquiry basket');

  await guest.evaluate(() => {
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const p = (ph) => [...document.querySelectorAll('input')].find(i => i.placeholder === ph);
    set(p('Your name *'), 'Ramesh Kumar');
    set(p('Company'), 'Sahasra Infra');
    set(p('Phone'), '9866644456');
  });
  await sleep(400);
  await guest.evaluate(() => [...document.querySelectorAll('button')].find(b => /Send enquiry/i.test(b.innerText))?.click());
  await sleep(2500);
  const afterSend = await guest.evaluate(() => document.body.innerText);
  ok(/ENQ-\d{4}/.test(afterSend), `the visitor is given a reference → ${(afterSend.match(/ENQ-\d{4}/) || [])[0]}`);

  /* ══ it lands in Sales ═══════════════════════════════════ */
  console.log('\n  ── it lands in Sales → Enquiries');
  await owner.goto(`${UI}/enquiries`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  const inbox = await owner.evaluate(() => document.body.innerText);
  ok(/Sahasra Infra/.test(inbox), 'the enquiry is in the inbox under their company name');
  ok(/New/.test(inbox), 'and is marked new');

  /* Click the row that carries the handler, not an inner div. The row is
     the shallowest element holding both the company and the ENQ reference. */
  await owner.evaluate(() => {
    const rows = [...document.querySelectorAll('div')]
      .filter(d => /Sahasra Infra/.test(d.innerText) && /ENQ-\d{4}/.test(d.innerText));
    const row = rows[rows.length - 1] || rows[0];
    row?.click();
  });
  await sleep(1600);
  ok(await owner.evaluate(() => /Convert to quotation/i.test(document.body.innerText)),
    'opening it offers Convert to quotation');

  await owner.evaluate(() => [...document.querySelectorAll('button')].find(b => /Convert to quotation/i.test(b.innerText))?.click());
  await sleep(2600);
  const url = owner.url();
  ok(/sales-quotations/.test(url), `converting hands off to the quotation builder → ${url.replace(UI, '')}`);

  const customers = await (await fetch(`${API}/customers?limit=50`, { headers: auth })).json();
  ok((customers.items || customers).some(c => c.name === 'Sahasra Infra'),
    'and the customer now exists — created at conversion, not before');

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 100) : ''}`);
  await browser.close();

  /* ── clean up ───────────────────────────────────────────── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM enquiry_items WHERE enquiry_id IN (SELECT id FROM enquiries WHERE owner_id = $1)', [reg.user.id]).catch(() => {});
  for (const t of ['enquiries', 'catalogue_photos', 'catalogue_settings']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  const { purgeOrg } = require(path.join(base, 'scripts', 'lib', 'purgeOrg'));
  await purgeOrg({ query: (t, p) => c.query(t, p) }, reg.user.id);
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
