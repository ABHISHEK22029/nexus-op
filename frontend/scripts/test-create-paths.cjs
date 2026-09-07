#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Two screens that listed things nobody could create.

   Sales Invoices offered four status filters and no way to raise one — the
   builder existed at /customer-orders/:id/invoice, reachable only from an
   order, and the subtitle had been telling people to "raise one from a
   customer order" with no route to get there.

   Milestones was worse: the table had GET and PATCH and no POST, so
   nothing in the product could create a milestone at all.

   Drives both through the real pages.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NAME = `MSTEST-${Date.now().toString(36).toUpperCase()}`;

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);

  /* ══ invoices ══════════════════════════════════════════ */
  console.log('\n  ── raising an invoice from the Invoices screen');
  await page.goto(`${UI}/sales-invoices`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  ok(await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /raise invoice/i.test(b.innerText))),
    'a "Raise invoice" button is on the page');

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /raise invoice/i.test(b.innerText))?.click();
  });
  await sleep(1500);

  const picker = await page.evaluate(() => {
    const txt = document.body.innerText;
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /Raise an invoice/i.test(d.innerText));
    return {
      open: /Choose the customer order/i.test(txt),
      orders: dlg ? [...dlg.querySelectorAll('button')].filter(b => /^(CO-|#)/.test(b.innerText.trim())).length : 0,
    };
  });
  ok(picker.open, 'the order picker opens');
  ok(picker.orders > 0, `it lists customer orders to choose from (${picker.orders})`);

  await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /Raise an invoice/i.test(d.innerText));
    [...(dlg?.querySelectorAll('button') || [])].find(b => /^(CO-|#)/.test(b.innerText.trim()))?.click();
  });
  await sleep(2500);

  const landed = await page.evaluate(() => location.pathname);
  ok(/\/customer-orders\/\d+\/invoice/.test(landed),
    `choosing one opens the invoice builder → ${landed}`);

  /* ══ milestones ════════════════════════════════════════ */
  console.log('\n  ── creating a milestone');
  await page.goto(`${UI}/milestones`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  ok(await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /new milestone/i.test(b.innerText))),
    'a "New milestone" button is on the page');

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /new milestone/i.test(b.innerText))?.click();
  });
  await sleep(1200);
  ok(await page.evaluate(() => /A stage of a work order/i.test(document.body.innerText)),
    'the form opens');

  const filled = await page.evaluate((name) => {
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /A stage of a work order/i.test(d.innerText));
    if (!dlg) return { ok: false };
    const sel = dlg.querySelector('select');
    if (!sel || sel.options.length < 2) return { ok: false, reason: 'no work orders offered' };
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const nameEl = [...dlg.querySelectorAll('input')].find(i => /Fabrication complete/i.test(i.placeholder || ''));
    const plan = [...dlg.querySelectorAll('input')].find(i => i.type === 'number');
    if (nameEl) setV(nameEl, name);
    if (plan) setV(plan, '40');
    return { ok: !!nameEl, workOrders: sel.options.length - 1 };
  }, NAME);
  ok(filled.ok, `the form offers work orders and a name field (${filled.workOrders ?? 0} work orders)` +
    (filled.reason ? ` — ${filled.reason}` : ''));

  await sleep(300);
  await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /A stage of a work order/i.test(d.innerText));
    [...(dlg?.querySelectorAll('button') || [])].find(b => /add milestone/i.test(b.innerText))?.click();
  });
  await sleep(2500);

  const list = await (await fetch(`${API}/milestones?limit=200`, { headers: auth })).json();
  const rows = Array.isArray(list) ? list : (list.items || []);
  const made = rows.find(m => m.name === NAME);
  ok(!!made, `the milestone exists after saving (${NAME})`);
  ok(Number(made?.plannedPercent) === 40, `its planned percentage was stored → ${made?.plannedPercent}`);
  ok(!!made?.workOrderId, `it is attached to a work order → ${made?.workOrderId}`);

  /* Ownership is inherited through the work order, so it must be refused
     when the work order is not yours. */
  const bad = await fetch(`${API}/milestones`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ workOrderId: 999999, name: 'should not exist' }),
  });
  ok(!bad.ok, `a milestone against an unknown work order is refused (${bad.status})`);

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 110) : ''}`);

  /* clean up */
  if (made) {
    await fetch(`${API}/milestones/${made.id}`, { method: 'DELETE', headers: auth }).catch(() => {});
  }
  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
