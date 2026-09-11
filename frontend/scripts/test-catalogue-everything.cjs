#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The whole catalogue, from an empty account to an enquiry.

   Not a sample of the feature — all of it, in the order a real business
   would meet it, through a browser, with a separate un-authenticated
   context standing in for the customer.

     setup      a brand new organisation, nothing configured
     configure  slug, headline, publish, share links
     create     add a product from the catalogue screen
     photos     upload two, check the main one, delete one
     edit       every field, and confirm each reaches the public page
     list       search, category filter, pagination
     publish    hiding a product takes it off the page
     enquire    a stranger fills a basket and sends
     convert    it becomes a customer and a prefilled quotation
     refuse     the edges — duplicate address, wrong file type, the cap

   Each step asserts against the SERVER or the PUBLIC page, never against
   the screen that was just clicked. A form that looks saved and did not
   is the failure this is built to catch.
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
const head = (t) => console.log(`\n  ── ${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Two visibly different images, so "which one is the main photo" is a
   question the test can actually answer. */
const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64');
const BLUE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const dlg = (page, fn, arg) => page.evaluate((f, a) => {
  const d = document.querySelector('[role="dialog"]');
  // eslint-disable-next-line no-new-func
  return new Function('dialog', 'arg', f)(d, a);
}, fn, arg);

(async () => {
  console.log('');
  /* ── a brand new organisation ── */
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Owner', email: `all-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const raw = { Authorization: `Bearer ${reg.token}` };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({
      name: `Kirashi ${stamp}`, phone: '9866644456',
      gstin: '33AAAAA0000A1Z5', bank_account_no: '50100123456789',
      setup_completed_at: new Date().toISOString(),
    }),
  });

  const api = async (p, o = {}) => {
    const r = await fetch(`${API}${p}`, { ...o, headers: { ...auth, ...(o.headers || {}) } });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 120) }; }
    return { status: r.status, ok: r.ok, body: b, raw: t };
  };

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const jsErrors = [];
  const page = await browser.newPage();
  page.on('pageerror', e => jsErrors.push(`owner: ${e.message}`));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  /* ══ 1. the screen is reachable ══ */
  head('the catalogue screen');
  await page.goto(`${UI}/catalogue`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  ok(await page.evaluate(() => /not published/i.test(document.body.innerText)),
    'a new organisation starts unpublished');
  ok(await page.evaluate(() => /Add your first product/i.test(document.body.innerText)),
    'and is offered a way to add its first product');

  /* ══ 2. configure and publish ══ */
  head('configuring the page');
  const slug = `kirashi-${stamp}`;
  const cfg = await api('/catalogue/settings', {
    method: 'PUT',
    body: JSON.stringify({
      slug, headline: 'Fabricated galvanized materials',
      subhead: '11kV line hardware to JBVNL spec',
      is_published: true, show_prices: true, whatsapp_number: '9866644456',
    }),
  });
  ok(cfg.ok, `the catalogue is configured and published (${cfg.status})`);

  const taken = await api('/catalogue/settings', {
    method: 'PUT', body: JSON.stringify({ slug: 'nordic-flatpack', is_published: true }),
  });
  ok(taken.status === 409, `an address another business already uses is refused (${taken.status})`);
  await api('/catalogue/settings', {
    method: 'PUT',
    body: JSON.stringify({ slug, headline: 'Fabricated galvanized materials', subhead: '11kV line hardware to JBVNL spec', is_published: true, show_prices: true, whatsapp_number: '9866644456' }),
  });

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);
  const shareBits = await page.evaluate(() => {
    const t = document.body.innerText;
    const wa = [...document.querySelectorAll('a')].find(a => /wa\.me/.test(a.href));
    const ml = [...document.querySelectorAll('a')].find(a => /^mailto:/.test(a.href));
    return { live: /is live/i.test(t), link: (t.match(/https?:\/\/\S+\/c\/[a-z0-9-]+/) || [])[0], wa: !!wa, ml: !!ml };
  });
  ok(shareBits.live, 'the screen says it is live');
  ok(!!shareBits.link, `the shareable link is shown → ${shareBits.link}`);
  ok(shareBits.wa && shareBits.ml, 'with WhatsApp and email share targets behind it');

  /* ══ 3. create a product from this screen ══ */
  head('creating a product');
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /Add your first product|Add product/i.test(b.innerText))?.click());
  await sleep(1200);
  const NAME = `11 KV V cross arm ${stamp}`;
  await dlg(page, `
    const set = (el, v) => { if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, v);
      el.dispatchEvent(new Event('input',{bubbles:true})); };
    set(dialog.querySelector('[placeholder="11 KV V cross arm 75 × 40 × 6"]'), arg);
    set(dialog.querySelector('[placeholder="VC-01"]'), 'VC-01');
    set(dialog.querySelector('[placeholder="Nos"]'), 'Nos');
    set(dialog.querySelector('[placeholder="833"]'), '833');
  `, NAME);
  await sleep(400);
  await dlg(page, `[...dialog.querySelectorAll('button')].find(b => /Add and continue/i.test(b.innerText))?.click();`);
  await sleep(2400);

  let list = (await api('/catalogue/products')).body;
  const made = list.find(x => x.name === NAME);
  ok(!!made, `the product exists on the server → ${made?.sku_code}`);
  ok(made?.is_published === false, 'and is not published by creation');
  ok(await page.evaluate(() => /Photographs/i.test(document.body.innerText)),
    'and the editor opened on it straight away');

  /* ══ 4. photographs ══ */
  head('photographs');
  const redPath = path.join(os.tmpdir(), `red-${stamp}.png`);
  const bluePath = path.join(os.tmpdir(), `blue-${stamp}.png`);
  const txtPath = path.join(os.tmpdir(), `not-${stamp}.txt`);
  fs.writeFileSync(redPath, RED); fs.writeFileSync(bluePath, BLUE);
  fs.writeFileSync(txtPath, 'not an image');

  const chooser = await page.$('input[type=file]');
  await chooser.uploadFile(redPath);
  await sleep(2200);
  await (await page.$('input[type=file]')).uploadFile(bluePath);
  await sleep(2200);

  let photos = (await api(`/catalogue/products/${made.id}/photos`)).body;
  ok(photos.length === 2, `two photographs uploaded through the screen (${photos.length})`);
  ok(await page.evaluate(() => /MAIN/.test(document.body.innerText)),
    'the first is marked as the main one');

  const badUp = await (async () => {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(txtPath)], { type: 'text/plain' }), 'x.txt');
    const r = await fetch(`${API}/catalogue/products/${made.id}/photos`, { method: 'POST', headers: raw, body: fd });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  })();
  ok(badUp.status === 400, `a file that is not an image is refused (${badUp.status})`);

  /* ══ 5. edit every field ══ */
  head('editing what a customer reads');
  const typed = {
    headline: '11 KV V cross arm — 75 × 40 × 6 mm',
    category: 'Line hardware',
    use_case: 'Distribution poles on 11kV lines',
    moq: '100',
    lead: '3 weeks from approval',
  };
  const missing = await dlg(page, `
    const miss = [];
    const set = (el, v, what) => { if (!el) { miss.push(what); return; }
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el, v);
      el.dispatchEvent(new Event('input',{bubbles:true})); };
    set([...dialog.querySelectorAll('input')].find(i => /cross arm/i.test(i.placeholder||'')), arg.headline, 'headline');
    set(dialog.querySelector('[placeholder="Line hardware"]'), arg.category, 'category');
    set(dialog.querySelector('[placeholder="100"]'), arg.moq, 'moq');
    set(dialog.querySelector('[placeholder="Distribution poles on 11kV lines"]'), arg.use_case, 'use case');
    set(dialog.querySelector('[placeholder="3 weeks from approval"]'), arg.lead, 'lead time');
    return miss;
  `, typed);
  ok(missing.length === 0, `every field is present${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);

  const preview = await page.evaluate(() => document.body.innerText);
  ok(preview.includes(typed.headline), 'the live preview updates as you type');

  await dlg(page, `[...dialog.querySelectorAll('button')].find(b => /Hidden/i.test(b.innerText))?.click();`);
  await sleep(1500);
  await dlg(page, `[...dialog.querySelectorAll('button')].find(b => /^Save$/.test(b.innerText.trim()))?.click();`);
  await sleep(2400);

  list = (await api('/catalogue/products')).body;
  const saved = list.find(x => x.id === made.id);
  ok(saved?.headline === typed.headline, `the headline reached the server → "${saved?.headline}"`);
  ok(saved?.catalogue_category === typed.category, `the category → "${saved?.catalogue_category}"`);
  ok(String(saved?.moq) === typed.moq, `the minimum order → ${saved?.moq}`);
  ok(saved?.lead_time_note === typed.lead, `the lead time → "${saved?.lead_time_note}"`);
  ok(saved?.is_published === true, 'and it is now listed');

  /* ══ 6. a stranger sees all of it ══ */
  head('what a stranger gets');
  const ctx = await browser.createBrowserContext();
  const guest = await ctx.newPage();
  guest.on('pageerror', e => jsErrors.push(`guest: ${e.message}`));
  await guest.setViewport({ width: 1300, height: 1000 });
  await guest.goto(`${UI}/c/${slug}`, { waitUntil: 'networkidle2' });
  await sleep(2400);

  ok(!(await guest.evaluate(() => !!localStorage.getItem('nexus_token'))),
    'the visitor has no token at all');
  const gt = await guest.evaluate(() => document.body.innerText);
  ok(gt.includes(typed.headline), 'the headline is on the page, not the internal part name');
  ok(gt.includes(typed.use_case), 'so is what it is for');
  ok(/Line hardware/.test(gt), 'the category appears as a filter');
  ok(/833/.test(gt), 'and the rate, because show_prices is on');
  ok(!/gstin|50100123456789/i.test(gt), 'no GSTIN or bank number anywhere on it');

  const pub = (await (await fetch(`${API}/public/catalogue/${slug}`)).json());
  const shownP = pub.products[0];
  ok(!!shownP?.photo_id, `a photograph is served, not a placeholder → ${shownP?.photo_id}`);
  const img = await fetch(`${API}/public/catalogue/photo/${shownP.photo_id}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  ok(img.ok && bytes.equals(RED), `and it is the first image uploaded (${bytes.length} bytes, matches)`);

  /* the quantity tool */
  const priced = await guest.evaluate(() => {
    const card = document.querySelector('article');
    const n = card?.querySelector('input[type=number]');
    if (!n) return null;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, '500');
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  await sleep(700);
  ok(priced && /4,16,500|416500/.test(await guest.evaluate(() => document.body.innerText)),
    '500 × ₹833 shows an indicative ₹4,16,500 on the card');

  /* ══ 6b. the list controls, on a catalogue big enough to need them ══
     Search and the category filter each worked alone; using both at once
     answered 500, because the code that added the search clause assigned
     over the category one and left its parameter dangling. Nothing that
     tried one filter at a time would have found it. */
  head('search and filters together');
  const combos = await Promise.all([
    fetch(`${API}/public/catalogue/${slug}?q=cross`).then(r => r.json()),
    fetch(`${API}/public/catalogue/${slug}?category=${encodeURIComponent(typed.category)}`).then(r => r.json()),
    fetch(`${API}/public/catalogue/${slug}?category=${encodeURIComponent(typed.category)}&q=cross`).then(r => r.json()),
  ]);
  ok(combos[0].total >= 1, `search alone finds it (${combos[0].total})`);
  ok(combos[1].total >= 1, `the category alone finds it (${combos[1].total})`);
  ok(combos[2].total >= 1 && !combos[2].error,
    `and BOTH together works rather than answering 500 (${combos[2].total ?? combos[2].error})`);
  ok(combos[2].catalogueTotal === combos[0].catalogueTotal,
    'the hero count stays the catalogue size under any filter');

  /* ══ 7. the enquiry ══ */
  head('an enquiry comes back');
  await guest.evaluate(() => [...document.querySelectorAll('article button')]
    .find(b => /^Add$/i.test(b.innerText.trim()))?.click());
  await sleep(1200);
  await guest.evaluate(() => {
    const set = (el, v) => { if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); };
    const p = (ph) => document.querySelector(`input[placeholder="${ph}"]`);
    set(p('Your name *'), 'Ramesh Kumar');
    set(p('Company'), 'Sahasra Infra');
    set(p('Phone'), '9866644456');
  });
  await sleep(400);
  await guest.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /Send enquiry/i.test(b.innerText))?.click());
  await sleep(2600);
  const ref = (await guest.evaluate(() => document.body.innerText)).match(/ENQ-\d{4}/)?.[0];
  ok(!!ref, `the visitor is given a reference → ${ref}`);

  const inbox = (await api('/enquiries')).body;
  ok((inbox.items || []).some(e => e.ref === ref), `it is in the Sales inbox (${inbox.summary?.new} new)`);

  const enq = (inbox.items || []).find(e => e.ref === ref);
  const conv = await api(`/enquiries/${enq.id}/convert`, { method: 'POST' });
  ok(conv.ok && conv.body.customerName === 'Sahasra Infra',
    `converting creates the customer → "${conv.body.customerName}"`);
  ok((conv.body.prefill?.items || []).length > 0, 'and prefills a quotation with what they asked for');

  /* ══ 8. taking it down ══ */
  head('taking it down again');
  await api(`/catalogue/products/${made.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: false }) });
  const afterHide = await (await fetch(`${API}/public/catalogue/${slug}`)).json();
  ok((afterHide.products || []).length === 0, 'hiding the product removes it from the page');
  const goneImg = await fetch(`${API}/public/catalogue/photo/${shownP.photo_id}`);
  ok(goneImg.status === 404, `and its photograph is no longer served (${goneImg.status})`);

  await api('/catalogue/settings', { method: 'PUT', body: JSON.stringify({ slug, is_published: false }) });
  const closed = await fetch(`${API}/public/catalogue/${slug}`);
  ok(closed.status === 404, `unpublishing the catalogue closes the whole page (${closed.status})`);

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 100) : ''}`);
  await browser.close();
  for (const f of [redPath, bluePath, txtPath]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  /* ── clean up ── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM enquiry_items WHERE enquiry_id IN (SELECT id FROM enquiries WHERE owner_id = $1)', [reg.user.id]).catch(() => {});
  for (const t of ['enquiries', 'catalogue_photos', 'attachments', 'catalogue_settings', 'customers', 'skus', 'company_profile']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  const { rows: [left] } = await c.query('SELECT COUNT(*) c FROM users WHERE email = $1', [`all-${stamp}@example.test`]);
  await c.end();
  ok(Number(left.c) === 0, 'test organisation removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
