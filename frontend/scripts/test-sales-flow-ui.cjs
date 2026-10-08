#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The sales flow, in a browser.

   1. The public catalogue: a search by description finds the product; a
      product with a minimum order says so, and a quantity under it is
      explained in words — left as typed, with Add held.
   2. The quotation builder: a line under the minimum is warned about, not
      blocked; delivery is suggested from the lead times and marked as a
      suggestion.
   3. Share for approval: the link, WhatsApp to the customer's number, an
      email draft with the link in it.
   4. The customer, in a fresh browser with no login, opens the link on a
      phone, accepts with a note, sees it confirmed — and a revisit shows
      the answer. Dark theme too.
   5. Back in the app, the list reads "Accepted online by …" with the note.
   No sideways scroll at 360px, no page errors. Screenshots are saved for a
   person to look at.

     API_BASE=http://localhost:5095 UI_BASE=http://localhost:5177 SHOTS=<dir> node scripts/test-sales-flow-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'sales-flow-ui');
fs.mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const api = async (token, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => ({}));
};

/* Helpers bound to one page. */
const on = (page) => {
  const waitFor = (fn, ms = 10000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
  return {
    waitFor,
    waitText: (re, ms = 10000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source),
    hasText: (re) => page.evaluate((src) => new RegExp(src).test(document.body.innerText), re.source),
    click: (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source),
    overflow: () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    shot: async (name) => { const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p, fullPage: true }); return p; },
  };
};

(async () => {
  const reg = await api(null, 'POST', '/auth/register', { name: 'Sales UI', email: `sales-ui-${stamp}@example.test`, password: 'testpassword123' });
  const ids = [reg.user?.id].filter(Boolean);
  const T = reg.token;
  let browser;
  const shots = [];
  try {
    if (!T) throw new Error('could not register the test account');
    /* A company with a name skips the first-run screen. */
    await api(T, 'PUT', '/company-profile', {
      name: 'Precision Fab Works', gstin: '36AAMCK2569F1Z9', stateCode: '36',
      address: 'Plot 7, IDA Uppal, Hyderabad 500039', phone: '040 2720 1234', email: 'sales@example.test',
    });
    const slug = `sales-ui-${stamp}`;
    await api(T, 'PUT', '/catalogue/settings', { slug, headline: 'Line hardware, made to drawing', is_published: true, show_prices: true });
    const arm = (await api(T, 'POST', '/skus', { sku_code: `CA-VT-${stamp}`, name: 'V-Type Cross Arm 75x75', hsn: '7308', price: 850, unit: 'nos', description: 'Hot-dip galvanised MS angle for 11kV poles' })).id;
    await api(T, 'PATCH', `/catalogue/products/${arm}`, { is_published: true, catalogue_category: 'Line hardware', headline: 'Cross arm for 11kV distribution', use_case: 'Carries the insulators on a distribution pole', moq: 100, lead_time_note: '2-3 weeks' });
    const pin = (await api(T, 'POST', '/skus', { sku_code: `IN-${stamp}`, name: 'Pin Insulator', hsn: '8546', price: 300, unit: 'nos' })).id;
    await api(T, 'PATCH', `/catalogue/products/${pin}`, { is_published: true, catalogue_category: 'Insulators', headline: 'Porcelain pin insulator', lead_time_note: '10 days' });
    await api(T, 'POST', '/customers', { name: `Apollo Infra ${stamp}`, phone: '98866 44456', email: 'buyer@example.test', state: 'Telangana' });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const errs = [];
    const watch = (p, where) => p.on('pageerror', e => errs.push(`${where}: ${e.message}`));

    /* ── 1. the public catalogue ─────────────────────────────────── */
    console.log('\n  ── 1. the public catalogue');
    const visitor = await browser.createBrowserContext();
    const shop = await visitor.newPage();
    watch(shop, 'catalogue');
    await shop.setViewport({ width: 1280, height: 900 });
    const S = on(shop);
    await shop.goto(`${UI}/c/${slug}`, { waitUntil: 'networkidle2' });
    ok(await S.waitText(/Cross arm for 11kV distribution/) && await S.hasText(/Porcelain pin insulator/), 'the catalogue opens with both products');
    await shop.type('input[aria-label="Search products"]', 'galvanised');
    await shop.keyboard.press('Enter');
    ok(await S.waitFor(() => !/Porcelain pin insulator/.test(document.body.innerText) && /Cross arm for 11kV/.test(document.body.innerText)),
      'searching a word from the description finds the cross arm, and only it');
    shots.push(await S.shot('1-catalogue-search'));
    await shop.click('input[aria-label="Search products"]', { clickCount: 3 });
    await shop.type('input[aria-label="Search products"]', '7308 arm');
    await shop.keyboard.press('Enter');
    ok(await S.waitFor(() => /1 of 2/.test(document.body.innerText)), 'an HSN and a word, in any order, find it too');
    ok(await S.hasText(/Minimum order: 100 nos/), 'the card says “Minimum order: 100 nos”');
    const qtyBox = 'input[aria-label="Quantity of V-Type Cross Arm 75x75"]';
    ok(await shop.$eval(qtyBox, el => el.value) === '100', 'its quantity starts at the minimum');
    await shop.click(qtyBox, { clickCount: 3 });
    await shop.type(qtyBox, '50');
    ok(await S.waitText(/The minimum order is 100 nos\. Please enter 100 or more\./), 'typing 50 says plainly that the minimum is 100');
    const after = await shop.evaluate((sel) => {
      const input = document.querySelector(sel);
      const add = [...input.closest('article').querySelectorAll('button')].find(b => b.textContent.trim() === 'Add');
      return { value: input.value, disabled: add?.disabled };
    }, qtyBox);
    ok(after.value === '50' && after.disabled === true, `the 50 is left as typed, not changed behind your back, and Add waits (${JSON.stringify(after)})`);
    shots.push(await S.shot('2-catalogue-moq'));
    await shop.setViewport({ width: 360, height: 780 });
    ok(await S.overflow() <= 0, `the catalogue has no sideways scroll at 360px (${await S.overflow()}px)`);

    /* ── 2. the quotation builder ────────────────────────────────── */
    console.log('\n  ── 2. the quotation builder');
    const page = await browser.newPage();
    watch(page, 'app');
    await page.setViewport({ width: 1440, height: 1000 });
    const P = on(page);
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, T);
    await page.goto(`${UI}/sales-quotations`, { waitUntil: 'networkidle2' });
    ok(await P.waitText(/Quotations/), 'Quotations opens');
    await P.click('button', /New Quotation/);
    ok(await P.waitFor(() => !!document.querySelector('select[aria-label="Line 1 product"]')), 'the builder opens');
    const custValue = await page.evaluate((name) => {
      const sel = document.querySelector('select[aria-label="Customer"]');
      return [...sel.options].find(o => o.textContent.includes(name))?.value;
    }, `Apollo Infra ${stamp}`);
    await page.select('select[aria-label="Customer"]', custValue);
    await page.select('select[aria-label="Line 1 product"]', String(arm));
    await page.click('input[aria-label="Line 1 quantity"]', { clickCount: 3 });
    await page.type('input[aria-label="Line 1 quantity"]', '50');
    ok(await P.waitText(/Below the minimum order of 100 nos for this product\. You can still save it/), 'a line of 50 shows the minimum-order warning');
    const delivery = await page.$eval('#sq-delivery-days', el => el.value);
    ok(delivery === '21' && await P.hasText(/SUGGESTED|Suggested/) && await P.hasText(/From the longest lead time — V-Type Cross Arm 75x75: “2-3 weeks”/),
      `delivery is suggested from the lead time, and marked as a suggestion (${delivery} days)`);
    shots.push(await P.shot('3-builder-moq-and-delivery'));
    const createBtn = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create Quotation')?.disabled);
    ok(createBtn === false, 'and it can still be saved');
    await page.click('input[aria-label="Line 1 quantity"]', { clickCount: 3 });
    await page.type('input[aria-label="Line 1 quantity"]', '150');
    ok(await P.waitFor(() => !document.querySelector('[data-moq-warning]')), 'at 150 the warning goes away');
    await page.type('#sq-delivery-note', 'Ex-works Hyderabad');
    await P.click('button', /^Create Quotation$/);
    ok(await P.waitText(/Quotation QT-\d+ created/), 'the quotation is created');
    const qno = await page.evaluate(() => (document.body.innerText.match(/Quotation (QT-\d+) created/) || [])[1]);
    const qid = (await api(T, 'GET', '/sales-quotations?limit=5')).items?.[0]?.id;
    const saved = await api(T, 'GET', `/sales-quotations/${qid}`);
    ok(saved.delivery_days === 21 && saved.delivery_note === 'Ex-works Hyderabad', `the promise is saved: within ${saved.delivery_days} days, “${saved.delivery_note}”`);

    /* ── 3. share for approval ───────────────────────────────────── */
    console.log('\n  ── 3. share for approval');
    ok(await P.click('button', /Share for approval/), 'the row offers “Share for approval”');
    ok(await P.waitFor(() => !!document.querySelector('[role="dialog"][aria-label="Share for approval"] input[aria-label="Quotation link"]')), 'the share dialog opens with the link');
    const shared = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Share for approval"]');
      const a = [...d.querySelectorAll('a')];
      return {
        url: d.querySelector('input[aria-label="Quotation link"]').value,
        wa: a.find(x => /WhatsApp/.test(x.textContent))?.href, mail: a.find(x => /Email/.test(x.textContent))?.href,
        copy: !![...d.querySelectorAll('button')].find(b => /Copy link/.test(b.textContent)),
      };
    });
    ok(new RegExp(`^${UI}/q/[A-Za-z0-9_-]{32}$`).test(shared.url), `the link is ${shared.url.replace(/[A-Za-z0-9_-]{26}$/, '…')}`);
    ok(shared.copy && /^https:\/\/wa\.me\/919886644456\?text=/.test(shared.wa || '') && decodeURIComponent(shared.wa).includes(shared.url),
      'Copy link, and WhatsApp to the customer\'s number (+91) with the link in the message');
    ok(/^mailto:buyer%40example\.test\?subject=Quotation%20QT-/.test(shared.mail || '') && decodeURIComponent(shared.mail).includes(shared.url),
      'Email: a draft to the customer, with the link in it');
    ok(await P.hasText(/now marked Sent/), 'it says the quotation is now Sent');
    shots.push(await P.shot('4-share-dialog'));
    await page.click('[role="dialog"] button[aria-label="Close"]');
    ok(await P.waitText(/Shared \d{1,2} \w{3,4} \d{4} · no answer yet/), 'the row now says it is shared and waiting for an answer');
    shots.push(await P.shot('4b-list-shared'));

    /* ── 4. the customer ─────────────────────────────────────────── */
    console.log('\n  ── 4. the customer, on a phone, with no login');
    const stranger = await browser.createBrowserContext();
    const phone = await stranger.newPage();
    watch(phone, 'public quote');
    await phone.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
    const C = on(phone);
    await phone.goto(shared.url, { waitUntil: 'networkidle2' });
    ok(await C.waitText(new RegExp(`Quotation\\s*${qno}`)) && await C.hasText(/Precision Fab Works/) && await C.hasText(/36AAMCK2569F1Z9/),
      'it opens without a login: who it is from, their GSTIN, and the number');
    ok(await C.hasText(/V-Type Cross Arm 75x75/) && await C.hasText(/150 nos × ₹850\.00/) && await C.hasText(/Delivery within 21 days of your order/) && await C.hasText(/Ex-works Hyderabad/),
      'the line, the delivery promise and its note');
    ok(await C.hasText(/Total/) && await C.hasText(/Rupees/i), 'the total and the amount in words');
    ok(await C.overflow() <= 0, `no sideways scroll at 360px (${await C.overflow()}px)`);
    shots.push(await C.shot('5-public-quote-360'));
    await C.click('button', /Accept quotation/);
    ok(await C.waitText(/Please type your name first/), 'accepting without a name asks for it');
    await phone.type('#pq-name', 'Ramesh Rao');
    await phone.type('#pq-note', 'Please deliver to the Uppal site.');
    await C.click('button', /Accept quotation/);
    ok(await C.waitText(/Thank you, Ramesh Rao\. You accepted this quotation\./), 'accepted — and confirmed on screen');
    ok(!(await C.hasText(/Accept or decline this quotation/)), 'the buttons are gone');
    shots.push(await C.shot('6-public-quote-accepted'));
    await phone.reload({ waitUntil: 'networkidle2' });
    ok(await C.waitText(/Accepted by Ramesh Rao on \d{1,2} \w{3,4} \d{4}/) && await C.hasText(/Please deliver to the Uppal site\./), 'a revisit shows the answer and the note');
    await phone.evaluate(() => localStorage.setItem('nexus-theme', 'dark'));
    await phone.reload({ waitUntil: 'networkidle2' });
    await C.waitText(/Accepted by Ramesh Rao/);
    const dark = await phone.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.querySelector('main').parentElement).backgroundColor }));
    ok(dark.theme === 'dark' && dark.bg !== 'rgb(255, 255, 255)', `the dark theme applies from the app's own colours (${dark.bg})`);
    ok(await C.overflow() <= 0, 'still no sideways scroll in the dark theme');
    shots.push(await C.shot('7-public-quote-dark'));
    /* Light again, on a desktop. The theme is written before the viewport
       changes: leaving phone emulation reloads the page, and the reloading
       page would otherwise save "dark" back over it. */
    await phone.evaluate(() => localStorage.setItem('nexus-theme', 'light'));
    await phone.setViewport({ width: 1280, height: 900 });
    await phone.evaluate(() => localStorage.setItem('nexus-theme', 'light'));
    await phone.reload({ waitUntil: 'networkidle2' });
    await C.waitText(/Accepted by Ramesh Rao/);
    shots.push(await C.shot('8-public-quote-desktop'));

    /* ── 5. back in the app ──────────────────────────────────────── */
    console.log('\n  ── 5. the answer, in the app');
    await page.reload({ waitUntil: 'networkidle2' });
    ok(await P.waitText(/Accepted online by Ramesh Rao · \d{1,2} \w{3,4} \d{4}/), 'the list reads “Accepted online by Ramesh Rao · <date>”');
    ok(await P.hasText(/“Please deliver to the Uppal site\.”/), 'with the note');
    ok(!(await page.evaluate(() => [...document.querySelectorAll('tbody tr')].some(r => /Accepted online/.test(r.innerText) && /Share for approval/.test(r.innerText)))),
      'an answered quotation no longer offers sharing');
    shots.push(await P.shot('9-app-accepted'));
    await page.setViewport({ width: 360, height: 780 });
    await page.reload({ waitUntil: 'networkidle2' });
    await P.waitText(/Accepted online by Ramesh Rao/);
    ok(await P.overflow() <= 0, `the quotations screen has no sideways scroll at 360px (${await P.overflow()}px)`);

    /* ── 6. the order it becomes ─────────────────────────────────── */
    console.log('\n  ── 6. converted, the order shows the date it ships by');
    await page.setViewport({ width: 1440, height: 1000 });
    page.once('dialog', d => d.accept());
    await P.click('tbody button', /^\s*Convert\s*$/);   // the row's button, not the “Converted” filter
    ok(await P.waitText(/Won! Created order/), 'converting the accepted quotation makes the order');
    const shipBy = new Date(Date.now() + 21 * 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    ok(await P.waitText(new RegExp(`Ship by ${shipBy}`)), `the orders list shows “Ship by ${shipBy}” — today + 21 days`);
    shots.push(await P.shot('10-order-ship-by'));

    ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    /* The live database caps sessions, and several backends share it; a
       cleanup that cannot connect waits and tries again rather than leaving
       the account behind. */
    let removed = 0, cleanupError = null;
    for (let i = 0; i < 8; i++) {
      try { removed = await purge(ids); cleanupError = null; break; }
      catch (e) { cleanupError = e; await new Promise(r => setTimeout(r, 4000)); }
    }
    console.log(`\n   screenshots:\n${shots.map(s => `     ${s}`).join('\n')}`);
    console.log(`\n   ${removed === ids.length ? '✅' : '❌'} test account removed (${removed})${cleanupError ? ` — ${cleanupError.message}` : ''}`);
    if (removed !== ids.length) fail++;
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
