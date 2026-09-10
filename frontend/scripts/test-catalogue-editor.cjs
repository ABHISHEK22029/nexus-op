#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Editing a product's catalogue entry, through the screen.

   The catalogue could only list a product or hide it. Everything a
   visitor actually reads — the headline shown instead of the internal
   part name, what it is for, the minimum order, the lead time, the
   category, the photographs — existed on the server and could not be
   reached from the UI at all.

   So this walks the whole editor: open a product, change every field,
   upload a photograph, save, and then check the PUBLIC page shows what
   was typed. The last step is the one that matters — an editor that saves
   to a screen nobody sees would pass a lesser test.
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

/* A real PNG, small enough to keep the test quick. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVQoU2NkYGD4z0AEYBxVSF' +
  'JCjIqNKiQpIQBLIQMBiWJ0BAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  console.log('');
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Owner', email: `edit-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  });
  const slug = `edit-${stamp}`;
  await fetch(`${API}/catalogue/settings`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ slug, headline: 'What we make', is_published: true, show_prices: true }),
  });
  /* An internal part name, the kind a fabricator actually types. */
  const sku = await (await fetch(`${API}/skus`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: `VC-01 CRSARM 75X40X6 ${stamp}`, sku_code: `VC-${stamp}`, unit: 'Nos', price: 833 }),
  })).json();
  const skuId = sku.id ?? sku.sku?.id;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
  await page.goto(`${UI}/catalogue`, { waitUntil: 'networkidle2' });
  await sleep(2200);

  ok(await page.evaluate(() => /Edit/.test(document.body.innerText)),
    'the product list offers an Edit control');

  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /^Edit$/.test(b.innerText.trim()))?.click());
  await sleep(1400);
  ok(await page.evaluate(() => /Headline|What it is for/i.test(document.body.innerText)),
    'the editor opens with the catalogue fields');

  /* ── type into every field ── */
  const typed = {
    headline: '11 KV V cross arm — 75 × 40 × 6 mm',
    category: 'Line hardware',
    use_case: 'Distribution poles on 11kV lines',
    moq: '100',
    lead: '3 weeks from drawing approval',
  };
  await page.evaluate((t) => {
    const setVal = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dialog = document.querySelector('[role="dialog"]');
    const byPlaceholder = (p) => dialog.querySelector(`[placeholder="${p}"]`);
    setVal(byPlaceholder('Line hardware'), t.category);
    setVal(byPlaceholder('100'), t.moq);
    setVal(byPlaceholder('Distribution poles on 11kV lines'), t.use_case);
    setVal(byPlaceholder('3 weeks from drawing approval'), t.lead);
    /* The headline box uses the product's own name as its placeholder. */
    const inputs = [...dialog.querySelectorAll('input')];
    const head = inputs.find(i => /CRSARM/.test(i.placeholder || ''));
    if (head) setVal(head, t.headline);
  }, typed);
  await sleep(500);

  /* ── upload a photograph ── */
  const tmp = path.join(require('os').tmpdir(), `cat-${stamp}.png`);
  require('fs').writeFileSync(tmp, PNG);
  const chooser = await page.$('input[type=file]');
  ok(!!chooser, 'the editor has a file input for photographs');
  if (chooser) {
    await chooser.uploadFile(tmp);
    await sleep(2200);
    const shots = await page.evaluate(() =>
      document.querySelectorAll('img[src^="blob:"], img[alt]').length);
    ok(shots > 0, `the photograph appears in the editor after upload (${shots} image element(s))`);
  }

  /* Publish before saving. Save closes the drawer, so a click on the
     publish toggle afterwards lands on nothing. */
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    [...dialog.querySelectorAll('button')].find(b => /Hidden/i.test(b.innerText))?.click();
  });
  await sleep(1600);

  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    [...dialog.querySelectorAll('button')].find(b => /^Save$/.test(b.innerText.trim()))?.click();
  });
  await sleep(2400);

  /* ── did it reach the server? ── */
  const list = await (await fetch(`${API}/catalogue/products`, { headers: auth })).json();
  const row = list.find(p => p.id === skuId);
  ok(row?.headline === typed.headline, `the headline was saved → "${row?.headline}"`);
  ok(row?.catalogue_category === typed.category, `the category was saved → "${row?.catalogue_category}"`);
  ok(String(row?.moq) === typed.moq, `the minimum order was saved → ${row?.moq}`);
  ok(row?.lead_time_note === typed.lead, `the lead time was saved → "${row?.lead_time_note}"`);
  ok(row?.photo_count === 1, `the photograph is attached → ${row?.photo_count}`);

  /* ── and does a stranger see it? ── */
  console.log('\n  ── what a visitor gets');
  const pub = await (await fetch(`${API}/public/catalogue/${slug}`)).json();
  const shown = (pub.products || [])[0];
  ok(shown?.headline === typed.headline,
    `the public page shows the headline, not the part number → "${shown?.headline}"`);
  ok(shown?.use_case === typed.use_case, `and what it is for → "${shown?.use_case}"`);
  ok(shown?.category === typed.category, `and its category → "${shown?.category}"`);
  ok(!!shown?.photo_id, `and a photograph instead of a placeholder → photo_id ${shown?.photo_id}`);
  ok((pub.categories || []).some(c => c.name === typed.category),
    'the category now appears as a filter on the page');

  if (shown?.photo_id) {
    const img = await fetch(`${API}/public/catalogue/photo/${shown.photo_id}`);
    const buf = Buffer.from(await img.arrayBuffer());
    ok(img.ok && buf.equals(PNG), `the image a stranger downloads is the one uploaded (${buf.length} bytes)`);
  }

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 90) : ''}`);
  await browser.close();
  try { require('fs').unlinkSync(tmp); } catch { /* ignore */ }

  /* ── clean up ── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM attachments WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  for (const t of ['catalogue_photos', 'catalogue_settings', 'skus', 'company_profile']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
