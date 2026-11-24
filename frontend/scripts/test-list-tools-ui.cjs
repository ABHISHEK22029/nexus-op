/* ══════════════════════════════════════════════════════════════════════
   Ready-made views, Undo and bulk actions, clicked through in the app.

     · views: the tabs count, a tab narrows the list and goes in the
       address, a refresh keeps it, All takes it off; the dashboard's
       Overdue tile opens the Overdue view
     · Undo: an order's status changes at once, and Undo puts it back
     · bulk: tick invoices, Mark as sent — the app's own box says which
       will be skipped and why, and the result says what was done; the
       sign-off queue cleared in one go
     · the last browser boxes moved into the app: deleting a vendor asks
       in the app, and Cancel keeps it

   Builds its own throwaway company (ltui-*@example.test) and removes it.
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
const day = (n) => new Date(Date.now() + 5.5 * 3600000 + n * 86400000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'ltui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM automation_settings WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Lists UI', email: `ltui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Fresh Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const cust = await api('POST', '/customers', { name: `Tab Works ${stamp}`, state: 'Telangana', shipping_state: 'Telangana' });
    const late = await api('POST', '/customer-orders', { customerId: cust.id, expectedShipmentDate: day(-3), items: [{ description: 'Gate', quantity: 2, unit: 'nos', rate: 900 }] });
    const far = await api('POST', '/customer-orders', { customerId: cust.id, expectedShipmentDate: day(30), items: [{ description: 'Grill', quantity: 1, unit: 'nos', rate: 400 }] });
    const invA = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceDate: day(-40), dueDate: day(-6), gstRate: 18, items: [{ description: 'Gate', quantity: 1, unit: 'nos', rate: 900, hsn: '7308' }] });
    const invB = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceDate: day(-2), dueDate: day(20), gstRate: 18, items: [{ description: 'Grill', quantity: 1, unit: 'nos', rate: 1400, hsn: '7308' }] });
    await api('PATCH', `/sales-invoices/${invB.id}/status`, { status: 'Sent' });
    await api('PUT', '/automation-settings', { po_approval_threshold: 1000 });
    const vend = await api('POST', '/vendors', { name: `Tab Steel ${stamp}`, type: 'Supplier' });
    const po = await api('POST', '/po', { vendorId: vend.id, itemName: 'Plate', quantity: 100, unitPrice: 60, gstRate: 18 });
    const lateNo = late.order_number || late.orderNumber, farNo = far.order_number || far.orderNumber;
    if (!late.id || !far.id || !invA.id || !invB.id || !po.id) throw new Error('seed failed');

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    let nativeDialogs = 0;
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => { nativeDialogs++; d.dismiss(); });
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => {
      localStorage.setItem('nexus_token', t); localStorage.setItem('tutorial_seen', '1');
      localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1');
    }, reg.token);
    const go = async (p) => { await page.goto(UI + p, { waitUntil: 'networkidle2' }); await sleep(800); };
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${n}.png`) }); };
    const tabs = () => page.$$eval('.qv-tab', els => els.map(e => ({ v: e.getAttribute('data-view'), on: e.classList.contains('is-active'), t: e.innerText.replace(/\s+/g, ' ').trim() })));
    const rowsText = () => page.$$eval('tbody tr', els => els.map(e => e.innerText));
    const toastText = () => page.$$eval('[data-toast]', els => els.map(e => e.innerText).join(' | '));
    const dialogText = () => page.$eval('[data-app-dialog]', e => e.innerText).catch(() => '');

    section('Views');
    await go('/customer-orders');
    let t = await tabs();
    ok(t.some(x => x.v === 'late' && /Ship date passed\s*1/.test(x.t)) && t.some(x => x.v === '' && x.on), `the tabs count, All chosen (${t.map(x => x.t).join(' · ')})`);
    await page.click('.qv-tab[data-view="late"]');
    await sleep(900);
    let rows = await rowsText();
    ok(page.url().includes('view=late') && rows.some(r => r.includes(lateNo)) && !rows.some(r => r.includes(farNo)), 'Ship date passed: only the late order, and the address says so');
    await shot('views-orders-late');
    await page.reload({ waitUntil: 'networkidle2' }); await sleep(900);
    t = await tabs();
    ok(t.find(x => x.v === 'late')?.on && !(await rowsText()).some(r => r.includes(farNo)), 'a refresh keeps the view');
    await page.click('.qv-tab[data-view=""]');
    await sleep(900);
    ok(!page.url().includes('view=') && (await rowsText()).some(r => r.includes(farNo)), 'All takes it off');
    await page.click('.qv-tab[data-view="to_bill"]');
    await sleep(900);
    const empty = await page.$eval('[data-view-empty]', e => e.innerText).catch(() => '');
    ok(/Nothing here right now/.test(empty) && /Show all customer orders/.test(empty), 'an empty view reads as good news, with a way back to all');
    await page.evaluate(() => [...document.querySelectorAll('[data-view-empty] button')][0]?.click());
    await sleep(900);
    ok(!page.url().includes('view=') && (await rowsText()).length >= 2, '"Show all" brings the list back');

    await go('/dashboard');
    const tile = await page.$('a[href="/sales-invoices?view=overdue"]');
    if (tile) { await tile.click(); await sleep(1500); }
    t = await tabs();
    ok(tile && page.url().includes('/sales-invoices?view=overdue') && t.find(x => x.v === 'overdue')?.on,
      "the dashboard's Overdue tile opens the Overdue view");
    rows = await rowsText();
    ok(rows.length === 1 && rows[0].includes(invA.invoice_number || 'INV-0001'), 'showing the one overdue invoice (a draft past due, as the tile counts it)');

    section('Undo');
    await go('/customer-orders');
    await page.select(`select[aria-label="Status of ${farNo}"]`, 'Closed');
    await sleep(1200);
    let toast = await toastText();
    ok(/marked Closed/.test(toast) && await page.$('[data-toast-action]'), `the status changes at once, with Undo on the toast (${toast})`);
    await shot('undo-toast');
    await page.click('[data-toast-action]');
    await sleep(1500);
    const status = await page.$eval(`select[aria-label="Status of ${farNo}"]`, e => e.value).catch(() => '');
    toast = await toastText();
    ok(status === 'Open' && /back to Open/.test(toast), `Undo puts it back (${status} · ${toast})`);

    section('Bulk');
    await go('/sales-invoices');
    await page.click('thead input[type="checkbox"]');
    await sleep(300);
    ok(/2 invoices selected/.test(await page.evaluate(() => document.body.innerText)), 'ticking the header box selects the page');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Mark as sent/.test(b.innerText))?.click());
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 6000 }).catch(() => {});
    const dlg = await dialogText();
    ok(/Mark 1 invoice as sent\?/.test(dlg) && /skipped/.test(dlg) && /already sent/.test(dlg), `the preview names the one to skip and why: ${dlg.replace(/\s+/g, ' ').slice(0, 150)}`);
    await shot('bulk-preview');
    await page.click('[data-app-dialog-ok]');
    await sleep(1800);
    toast = await toastText();
    ok(/1 invoice marked sent · 1 skipped/.test(toast), `and says what it did (${toast})`);
    const after = await (await fetch(`${API}/sales-invoices/${invA.id}`, { headers: H })).json();
    ok(after.status === 'Sent' || after.invoice?.status === 'Sent', 'the draft is Sent now');

    await go('/purchase-orders');
    await page.click(`tbody input[type="checkbox"]`);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^\s*Sign off\s*$/.test(b.innerText) && b.closest('div')?.innerText.includes('selected'))?.click());
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 6000 }).catch(() => {});
    ok(/Sign off 1 purchase order\?/.test(await dialogText()), 'signing off from the bulk bar asks first');
    await page.click('[data-app-dialog-ok]');
    await sleep(1800);
    t = await tabs();
    ok(t.some(x => x.v === 'approval' && /Waiting for sign-off\s*0/.test(x.t)), `the sign-off queue is clear (${t.map(x => x.t).join(' · ')})`);

    section('The last browser boxes');
    await go('/vendors');
    const delBtn = await page.$('button[title="Delete vendor"]');
    if (delBtn) await delBtn.click();
    await page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 5000 }).catch(() => {});
    ok(/Delete the vendor “Tab Steel/.test(await dialogText()), 'deleting a vendor asks in the app, naming it');
    await page.click('[data-app-dialog-cancel]');
    await sleep(600);
    ok((await page.evaluate(() => document.body.innerText)).includes(`Tab Steel ${stamp}`), 'Cancel keeps it');
    ok(nativeDialogs === 0, `the browser's own box never appeared (${nativeDialogs})`);

    section('Phone');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await go('/customer-orders');
    const fit = await page.evaluate(() => ({ w: innerWidth, scroll: document.documentElement.scrollWidth, tabs: document.querySelector('.qv')?.getBoundingClientRect().right }));
    ok(fit.scroll <= fit.w && fit.tabs <= fit.w + 1, `on a phone the tabs scroll inside their row; the page doesn't scroll sideways (${JSON.stringify(fit)})`);
    await shot('views-phone');

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
