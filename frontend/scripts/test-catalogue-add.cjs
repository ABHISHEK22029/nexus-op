#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Adding a product — the WHOLE product, in one form.

   The first version of this dialog asked four questions and told you the
   rest "comes next", which is not adding a product: it is starting one
   and making somebody finish it on a second screen. A person sitting down
   to list something has the photograph, the size, the minimum order and
   the lead time in front of them already.

   So this fills in every field, attaches two photographs BEFORE the
   product exists, submits once, and then checks the server and the public
   page — never the dialog that was just closed.

   The photograph ordering is the interesting part: uploads need a product
   id, so the files are held locally and sent after creation. If that
   sequencing is wrong the product appears with no pictures and nothing
   says so.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==',
  'base64');

const VALUES = {
  code: 'VC-01', unit: 'Nos', price: '833', hsn: '7308',
  headline: '11 KV V cross arm — 75 × 40 × 6 mm',
  category: 'Line hardware',
  use: 'Distribution poles on 11kV lines',
  moq: '100', lead: '3 weeks from approval',
};

(async () => {
  console.log('');
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'O', email: `add-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  });
  const slug = `add-${stamp}`;
  await fetch(`${API}/catalogue/settings`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ slug, headline: 'What we make', is_published: true, show_prices: true }),
  });

  const NAME = `11 KV V cross arm ${stamp}`;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
  await page.goto(`${UI}/catalogue`, { waitUntil: 'networkidle2' });
  await sleep(2200);

  ok(await page.evaluate(() => /Add your first product/i.test(document.body.innerText)),
    'the empty state offers to add one');
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /Add your first product|Add product/i.test(b.innerText))?.click());
  await sleep(1300);

  const fieldCount = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return [...d.querySelectorAll('input,textarea')].filter(i => i.type !== 'file').length;
  });
  ok(fieldCount >= 10, `the form asks for the whole product, not a stub (${fieldCount} fields)`);
  ok(await page.evaluate(() => /Photograph/i.test(document.querySelector('[role="dialog"]').innerText)),
    'photographs are attached here, not on a second screen');

  /* Two photographs, chosen before the product exists. */
  const a = path.join(os.tmpdir(), `a-${stamp}.png`);
  const b = path.join(os.tmpdir(), `b-${stamp}.png`);
  fs.writeFileSync(a, PNG); fs.writeFileSync(b, PNG);
  const chooser = await page.$('[role="dialog"] input[type=file]');
  await chooser.uploadFile(a, b);
  await sleep(1300);
  ok(await page.evaluate(() => document.querySelectorAll('[role="dialog"] img').length === 2),
    'both preview immediately, before anything is saved');
  ok(await page.evaluate(() => /MAIN/.test(document.querySelector('[role="dialog"]').innerText)),
    'and the first is marked as the main one');

  const missing = await page.evaluate((v, name) => {
    const d = document.querySelector('[role="dialog"]');
    const miss = [];
    const put = (el, val, what) => {
      if (!el) { miss.push(what); return; }
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    /* By aria-label, not placeholder. The headline's placeholder mirrors
       whatever the name box holds, so "the input mentioning cross arm"
       matched the NAME field and overwrote it — the product was created
       under the wrong name and every later check looked for one that did
       not exist. */
    const by = (l) => d.querySelector(`[aria-label="${l}"]`);
    put(by('Name'), name, 'name');
    put(by('Code'), v.code, 'code');
    put(by('Unit'), v.unit, 'unit');
    put(by('Rate'), v.price, 'rate');
    put(by('HSN'), v.hsn, 'hsn');
    put(by('Headline'), v.headline, 'headline');
    put(by('What it is for'), v.use, 'use case');
    put(by('Category'), v.category, 'category');
    put(by('Minimum order'), v.moq, 'moq');
    put(by('Lead time'), v.lead, 'lead time');
    return miss;
  }, VALUES, NAME);
  ok(missing.length === 0, `every field is present${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);

  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find(b => /Add product/i.test(b.innerText))?.click());
  await sleep(4200);

  /* ── the server, not the dialog ── */
  console.log('\n  ── what actually reached the server');
  const list = await (await fetch(`${API}/catalogue/products`, { headers: auth })).json();
  const made = list.find(p => p.name === NAME);
  ok(!!made, `the product exists → ${made?.sku_code}`);
  ok(made?.headline === VALUES.headline, `headline → "${made?.headline}"`);
  ok(made?.catalogue_category === VALUES.category, `category → "${made?.catalogue_category}"`);
  ok(String(made?.moq) === VALUES.moq, `minimum order → ${made?.moq}`);
  ok(made?.lead_time_note === VALUES.lead, `lead time → "${made?.lead_time_note}"`);
  ok(Number(made?.price) === 833, `rate → ₹${made?.price}`);
  ok(made?.photo_count === 2, `both photographs uploaded after creation → ${made?.photo_count}`);
  ok(made?.is_published === true, 'and it is listed, because the box was ticked');

  console.log('\n  ── and what a stranger gets');
  const pub = await (await fetch(`${API}/public/catalogue/${slug}`)).json();
  const shown = (pub.products || [])[0];
  ok(shown?.headline === VALUES.headline, 'the public page shows the headline');
  ok(shown?.use_case === VALUES.use, 'and what it is for');
  ok(shown?.category === VALUES.category, 'and the category');
  ok(!!shown?.photo_id, 'and a photograph rather than a placeholder');
  ok((pub.categories || []).some(c => c.name === VALUES.category), 'which is offered as a filter');

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 80) : ''}`);
  await browser.close();
  for (const f of [a, b]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['catalogue_photos', 'attachments', 'catalogue_settings', 'skus', 'company_profile']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
