/* ══════════════════════════════════════════════════════════════════════
   The three ideas taken from the agent portal, clicked through in the app.

     · Search everything: Ctrl K, "/" or the Search button opens it; words
       find the order, Enter opens it on its own panel; it remembers what
       you opened; Esc closes it
     · How late, apart from what state: an order past its ship date and an
       invoice past its due date carry a red badge; a paid-up one doesn't
     · The app's own confirm box: Cancel and Esc keep the order, the red
       button deletes it, and the browser's grey box never appears

   Builds its own throwaway company (srchui-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite running. Refuses a deployed
   host. SHOTS=<dir> saves screenshots there.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Client } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const { purgeOrg } = require(path.join(__dirname, '../../backend/scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || '';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const T = `zq${stamp}`;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'srchui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Search UI', email: `srchui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Fresh Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const cust = await api('POST', '/customers', { name: `Zephyr Works ${T}`, state: 'Telangana', shipping_state: 'Telangana' });
    const late = await api('POST', '/customer-orders', { customerId: cust.id, expectedShipmentDate: day(-5),
      items: [{ description: `Gate ${T}`, quantity: 2, unit: 'nos', rate: 900 }] });
    const spare = await api('POST', '/customer-orders', { customerId: cust.id, expectedShipmentDate: day(30),
      items: [{ description: `Spare ${T}`, quantity: 1, unit: 'nos', rate: 100 }] });
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceDate: day(-40), dueDate: day(-10), gstRate: 18,
      items: [{ description: `Gate ${T}`, quantity: 1, unit: 'nos', rate: 900, hsn: '7308' }] });
    await api('PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    if (!late.id || !spare.id || !inv.id) throw new Error(`seed failed: ${JSON.stringify({ late, spare, inv }).slice(0, 200)}`);
    const lateNo = late.order_number || late.orderNumber, spareNo = spare.order_number || spare.orderNumber;

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    let nativeDialogs = 0;
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => { nativeDialogs++; d.dismiss(); });
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); }, reg.token);
    const go = async (p) => { await page.goto(UI + p, { waitUntil: 'networkidle2' }); await sleep(700); };
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const ctrlK = async () => { await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control'); };
    const panelOpen = () => page.$eval('.gs-panel', () => true).catch(() => false);
    const text = () => page.evaluate(() => document.body.innerText);

    section('Search everything');
    await go('/dashboard');
    await ctrlK();
    await page.waitForSelector('[data-global-search-input]', { visible: true, timeout: 5000 }).catch(() => {});
    ok(await panelOpen(), 'Ctrl K opens the search');
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-global-search-input')), 'the cursor is already in the box');
    await page.keyboard.type(`zephyr ${T}`);
    await page.waitForSelector('[data-search-result]', { timeout: 6000 }).catch(() => {});
    await sleep(400);
    const found = await page.$$eval('[data-search-result]', els => els.map(e => e.getAttribute('data-search-result')));
    ok(found.includes('customer_order') && found.includes('customer') && found.includes('sales_invoice'),
      `two words find the orders, the customer and the invoice (${[...new Set(found)].join(', ')})`);
    await shot('search-light');
    /* the first row is the newest order; move down to the late one and open it */
    const rows = await page.$$eval('[data-search-result="customer_order"] .gs-row-title', els => els.map(e => e.textContent));
    const idx = await page.$$eval('[data-search-result]', (els, no) => els.findIndex(e => e.querySelector('.gs-row-title')?.textContent === no), lateNo);
    for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(1200);
    ok(page.url().includes(`/customer-orders?open=${late.id}`) && !(await panelOpen()),
      `Enter opens ${lateNo} on its own panel (${rows.length} orders listed)`);
    ok((await text()).includes(lateNo), 'the order is on screen');

    await ctrlK();
    await sleep(500);
    const recent = await page.evaluate(() => ({
      head: [...document.querySelectorAll('.gs-group-head')].map(e => e.textContent.trim()),
      rows: [...document.querySelectorAll('.gs-panel [data-search-result] .gs-row-title')].map(e => e.textContent),
    }));
    ok(recent.head.includes('Recently opened') && recent.rows[0] === lateNo,
      `opening it again shows what you opened last, first (${JSON.stringify(recent)})`);
    await page.keyboard.press('Escape');
    await sleep(300);
    ok(!(await panelOpen()), 'Esc closes it');
    await page.mouse.click(700, 60);
    await page.keyboard.press('/');
    await sleep(400);
    ok(await panelOpen(), '"/" opens it too, when you are not typing in a box');
    await page.keyboard.press('Escape');
    await sleep(300);
    const trigger = await page.$('[data-global-search="panel"], [data-global-search="rail"]');
    if (trigger) { await trigger.click(); await sleep(400); }
    ok(trigger && await panelOpen(), 'the Search button in the side bar opens it');
    await page.keyboard.type('nothing-like-this-anywhere');
    await sleep(900);
    ok((await text()).includes('Nothing matches'), 'a search with no answer says so');
    await page.keyboard.press('Escape');

    section('How late, apart from what state');
    await go('/customer-orders');
    const orderBadges = await page.$$eval('[data-urgency]', els => els.map(e => [e.getAttribute('data-urgency'), e.textContent]));
    ok(orderBadges.some(([t, s]) => t === 'late' && /Ship date passed · 5 days/.test(s)), `the late order says "Ship date passed · 5 days" (${JSON.stringify(orderBadges)})`);
    ok(orderBadges.length === 1, "the order due in a month carries no badge");
    await shot('orders-badges');
    await go('/sales-invoices');
    const invBadges = await page.$$eval('[data-urgency]', els => els.map(e => [e.getAttribute('data-urgency'), e.textContent]));
    ok(invBadges.some(([t, s]) => t === 'late' && /Overdue · 10 days/.test(s)), `the unpaid invoice says "Overdue · 10 days" (${JSON.stringify(invBadges)})`);
    await shot('invoices-badges');

    section("The app's own confirm box");
    await page.evaluate(() => localStorage.setItem('maks_app_dialogs', '1'));
    await go('/customer-orders');
    const clickDelete = (no) => page.evaluate((n) => {
      const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes(n));
      const b = row?.querySelector('button[title="Delete"]'); if (b) b.click(); return !!b;
    }, no);
    const dialogOpen = () => page.$eval('[data-app-dialog]', () => true).catch(() => false);
    const before = nativeDialogs;
    ok(await clickDelete(spareNo), 'the delete button is there');
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 4000 }).catch(() => {});
    const dlg = await page.$eval('[data-app-dialog]', e => e.innerText).catch(() => '');
    ok(dlg.includes(`Delete ${spareNo}?`) && /Delete order/.test(dlg), 'it asks in the app, naming the order and the action');
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-app-dialog-cancel')),
      'a delete starts with the keyboard on Cancel');
    await shot('confirm-light');
    await page.click('[data-app-dialog-cancel]');
    await sleep(500);
    ok(!(await dialogOpen()) && (await text()).includes(spareNo), 'Cancel keeps the order');
    await clickDelete(spareNo);
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 4000 }).catch(() => {});
    await page.keyboard.press('Escape');
    await sleep(500);
    ok(!(await dialogOpen()) && (await text()).includes(spareNo), 'Esc keeps the order');
    await clickDelete(spareNo);
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 4000 }).catch(() => {});
    await sleep(150);
    await page.keyboard.press('Enter');
    await sleep(700);
    ok(!(await dialogOpen()) && (await text()).includes(spareNo), 'Enter pressed out of habit keeps the order too');
    await clickDelete(spareNo);
    await page.waitForSelector('[data-app-dialog-ok]', { visible: true, timeout: 4000 }).catch(() => {});
    await page.click('[data-app-dialog-ok]');
    await sleep(1500);
    const listed = await page.evaluate((n) => [...document.querySelectorAll('tr')].some(r => r.innerText.includes(n)), spareNo);
    ok(!listed, 'the red button deletes it');
    ok(nativeDialogs === before, `the browser's grey box never appeared (${nativeDialogs - before})`);

    section('Dark and phone');
    await page.evaluate(() => localStorage.setItem('nexus-theme', 'dark'));
    await go('/customer-orders');
    await clickDelete(lateNo);
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 4000 }).catch(() => {});
    await shot('confirm-dark');
    await page.keyboard.press('Escape');
    await sleep(300);
    await ctrlK();
    await page.keyboard.type(T);
    await sleep(1200);
    await shot('search-dark');
    const darkBg = await page.$eval('.gs-panel', e => getComputedStyle(e).backgroundColor).catch(() => '');
    ok(darkBg && !/255, 255, 255/.test(darkBg), `the search panel follows dark mode (${darkBg})`);
    await page.keyboard.press('Escape');

    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await go('/customer-orders');
    const phoneTrigger = await page.$('[data-global-search="rail"], [data-global-search="panel"]');
    const visibleTrigger = phoneTrigger && await phoneTrigger.evaluate(e => !!e.offsetParent);
    if (visibleTrigger) await phoneTrigger.click(); else await ctrlK();
    await sleep(400);
    await page.keyboard.type(T);
    await sleep(1200);
    const fit = await page.evaluate(() => {
      const p = document.querySelector('.gs-panel')?.getBoundingClientRect();
      return p ? { l: Math.round(p.left), r: Math.round(p.right), w: innerWidth, scroll: document.documentElement.scrollWidth } : null;
    });
    ok(fit && fit.l >= 0 && fit.r <= fit.w && fit.scroll <= fit.w, `on a phone the search fits the screen (${JSON.stringify(fit)})`);
    await shot('search-phone');

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    const n = await cleanup().catch(() => -1);
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
