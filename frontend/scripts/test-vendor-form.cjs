#!/usr/bin/env node
/* Drive the short vendor form and check what actually lands in the database. */
const puppeteer = require('puppeteer');
const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';

const results = [];
const step = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? `\n       ${d}` : ''}`); };

const MARK = `VTEST-${Date.now().toString(36).toUpperCase()}`;

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.UI_EMAIL, password: process.env.UI_PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };

  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 150)));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
  await page.goto(`${UI}/vendors/new`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1400));

  const count = await page.evaluate(() => document.querySelectorAll('input, select, textarea').length);
  step('the first screen asks for a handful of things, not forty-seven',
    count <= 8, `${count} controls visible before expanding anything`);

  /* Required-field guard: submit empty. */
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add vendor/i.test(x.innerText))?.click());
  await new Promise(r => setTimeout(r, 600));
  const guarded = await page.evaluate(() => /A vendor needs a name/.test(document.body.innerText));
  step('it refuses an unnamed vendor, and says why', guarded);

  /* GSTIN derives the state — so state is never typed and never disagrees. */
  const setVal = async (labelRe, value) => page.evaluate((lr, v) => {
    const re = new RegExp(lr, 'i');
    const el = [...document.querySelectorAll('input')].find(i => {
      const lab = i.closest('div')?.querySelector('label');
      return lab && re.test(lab.innerText);
    });
    if (!el) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, labelRe, value);

  await setVal('GSTIN', '33AABCN1234M1Z7');
  await new Promise(r => setTimeout(r, 400));
  const derived = await page.evaluate(() => /State: Tamil Nadu/.test(document.body.innerText));
  step('the state is derived from the GSTIN, not asked for again', derived,
    '33… → Tamil Nadu');

  /* Fill and save. */
  await setVal('Vendor name', `${MARK} Board Supply`);
  await setVal('Phone', '98850 12345');
  await setVal('What exactly', '18mm particle board, MDF, edge banding');
  await setVal('Address', 'Plot 44, Industrial Estate, Hosur');
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add vendor/i.test(x.innerText))?.click());
  await new Promise(r => setTimeout(r, 2600));

  const landed = await page.evaluate(() => location.pathname);
  step('saving returns you to the vendor list', landed === '/vendors', `now on ${landed}`);

  const list = await (await fetch(`${API}/vendors?search=${encodeURIComponent(MARK)}`, { headers: auth })).json();
  const rows = list.items || list || [];
  const v = rows[0];
  step('the vendor is stored', !!v, v ? `#${v.id} ${v.name}` : 'not found by search');

  if (v) {
    step('what they supply is searchable', /particle board/i.test(v.supplies || ''), `supplies = "${v.supplies}"`);
    step('the GSTIN state was saved without being typed', v.state === 'Tamil Nadu', `state = ${v.state}`);
    step('the phone is on the record', /12345/.test(v.contactPhone || ''), `phone = ${v.contactPhone}`);
    step('MSME defaults to FALSE, not true',
      v.is_msme === false, `is_msme = ${v.is_msme} — a wrong TRUE starts a 45-day clock that does not apply`);
    await fetch(`${API}/vendors/${v.id}`, { method: 'DELETE', headers: auth });
  }

  step('no JavaScript errors', errs.length === 0, errs[0] || '');

  await b.close();
  const pass = results.filter(Boolean).length;
  console.log(`\n  ${pass} of ${results.length} passed\n`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
