/* ══════════════════════════════════════════════════════════════════════
   What was typed stays typed — the places a form threw it away.

   Reported: "if you enter some info it gets erased". Apart from a session
   ending (test-session-ui.cjs), these each lost typing, clicked through:
     · a list form (customers): "Add" again or the pencil on another row
       replaced a half-filled form — now it asks, Keep editing keeps it;
       the saved message reads "Customer added"
     · a new invoice: choosing a different customer wiped the lines, notes
       and e-way bill number — now only the customer's details change
     · a delivery challan: picking the order replaced lines typed by hand
       — now it asks; Keep my lines keeps them, Use replaces them
     · goods received: submitting without choosing the PO line left the
       button on "Saving…" for good, so only a refresh (losing it all) helped
     · a popup (Log an enquiry): a drag that ended outside closed it; Esc or
       a click outside now asks once something is typed
     · roles: saving one role cleared the other roles' unsaved ticks
     · an inline edit on an invoice: a refused number snapped back to the
       old one — now the typed one stays, with the reason

   Builds its own throwaway company (igui-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite running. Refuses a deployed
   host. SHOTS=<dir> saves screenshots there.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const BE = path.join(__dirname, '../../backend');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const { Client } = require(path.join(BE, 'node_modules/pg'));
const { purgeOrg } = require(path.join(BE, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || '';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'igui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM org_roles WHERE org_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Guards UI', email: `igui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Guard Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const ALPHA = `Alpha Fab ${stamp}`, BETA = `Beta Fab ${stamp}`;
    const alpha = await api('POST', '/customers', { name: ALPHA, state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Plot 1, Uppal' });
    const beta = await api('POST', '/customers', { name: BETA, state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Plot 2, Kukatpally' });
    const order = await api('POST', '/customer-orders', { customerId: alpha.id, items: [
      { description: 'Order gate', quantity: 2, unit: 'nos', rate: 900 }, { description: 'Order grill', quantity: 1, unit: 'nos', rate: 400 }] });
    const vend = await api('POST', '/vendors', { name: `Guard Steel ${stamp}`, type: 'Supplier' });
    const po = await api('POST', '/po', { vendorId: vend.id, itemName: 'MS plate 6mm', quantity: 15, unitPrice: 46.67, gstRate: 18, items: [
      { description: 'MS plate 6mm', quantity: 10, unitPrice: 50 }, { description: 'MS angle 40x40', quantity: 5, unitPrice: 40 }] });
    await api('PATCH', `/po/${po.id}/approve`); await api('PATCH', `/po/${po.id}/dispatch`);
    const roleA = `guard_a_${stamp}`, roleB = `guard_b_${stamp}`;
    await api('POST', '/admin/roles', { role: roleA, label: `Guard A ${stamp}`, permissions: { customers: ['read'] } });
    await api('POST', '/admin/roles', { role: roleB, label: `Guard B ${stamp}`, permissions: { customers: ['read'] } });
    const inv1 = await api('POST', '/sales-invoices', { customerId: alpha.id, gstRate: 18, items: [{ description: 'Gate', quantity: 1, unit: 'nos', rate: 1100, hsn: '7308' }] });
    const inv2 = await api('POST', '/sales-invoices', { customerId: alpha.id, gstRate: 18, items: [{ description: 'Grill', quantity: 1, unit: 'nos', rate: 1300, hsn: '7308' }] });
    if (!alpha.id || !beta.id || !order.id || !po.id || !inv1.id || !inv2.id) throw new Error(`seed failed: ${JSON.stringify({ a: alpha.id, b: beta.id, o: order.id, po: po.id || po.error, i1: inv1.id || inv1.error, i2: inv2.id || inv2.error })}`);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    let nativeDialogs = 0;
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => { nativeDialogs++; d.dismiss(); });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => {
      localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1');
      localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1');
    }, reg.token, reg.user);
    const go = async (p) => { await page.goto(UI + p, { waitUntil: 'networkidle2' }); await sleep(700); };
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${n}.png`) }); };
    const val = (sel) => page.$eval(sel, el => el.value).catch(() => null);
    const byText = (sel, re) => page.evaluateHandle((s, src) => [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.innerText)), sel, re.source);
    const clickText = async (sel, re) => { const h = await byText(sel, re); await h.click(); };
    const box = () => page.waitForSelector('[data-app-dialog]', { visible: true, timeout: 5000 }).then(() => page.$eval('[data-app-dialog]', e => e.innerText)).catch(() => '');
    const boxGone = () => page.waitForSelector('[data-app-dialog]', { hidden: true, timeout: 5000 }).then(() => true).catch(() => false);
    const typeAt = async (handle, text) => { await handle.click({ clickCount: 3 }); await page.keyboard.type(text); };

    section('A list form: customers');
    await go('/customers');
    await clickText('button', /^\s*Add Customer\s*$/);
    await page.waitForSelector('[data-field="name"]', { visible: true });
    await page.type('[data-field="name"]', 'Half Typed Traders');
    await page.type('[data-field="contact_name"]', 'Ravi');
    const editAlpha = await page.evaluateHandle((n) => [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(n))?.querySelector('button[title="Edit"]'), ALPHA);
    await editAlpha.click();
    const t1 = await box();
    ok(/Discard what you typed\?/.test(t1) && /isn't saved yet/.test(t1), 'the pencil on another row asks before replacing the half-filled form');
    await shot('guard-list-form');
    await page.click('[data-app-dialog-cancel]');
    await boxGone();
    ok(await val('[data-field="name"]') === 'Half Typed Traders' && await val('[data-field="contact_name"]') === 'Ravi', 'Keep editing: everything typed is still there');
    await clickText('button', /^\s*Add Customer\s*$/);
    ok(/Discard what you typed\?/.test(await box()), '"Add Customer" again asks too');
    await page.click('[data-app-dialog-ok]');
    await boxGone();
    ok(await val('[data-field="name"]') === '', 'Discard: a fresh form');
    await editAlpha.click().catch(async () => {
      const h = await page.evaluateHandle((n) => [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(n))?.querySelector('button[title="Edit"]'), ALPHA); await h.click();
    });
    await sleep(300);
    ok(!(await page.$('[data-app-dialog]')) && await val('[data-field="name"]') === ALPHA, 'an untouched form is replaced without asking');
    await clickText('button', /^\s*Add Customer\s*$/);
    await sleep(200);
    await page.type('[data-field="name"]', `Gamma Fab ${stamp}`);
    await page.$eval('[data-field="name"]', el => el.form.requestSubmit());
    await sleep(900);
    ok(await page.evaluate(() => /Customer added/.test(document.body.innerText)), 'saving says "Customer added"');

    section('A new invoice: changing the customer');
    await go('/sales-invoices/new');
    /* the customer list arrives a moment after the form: pick once it has */
    await page.waitForFunction((cid) => [...(document.querySelector('select[data-party-select="customer"]')?.options || [])].some(o => o.value === cid), { timeout: 30000 }, String(alpha.id));
    await page.select('select[data-party-select="customer"]', String(alpha.id));
    await page.waitForSelector('[placeholder="Item or service"]', { visible: true });
    await sleep(400);
    await page.type('[placeholder="Item or service"]', 'Gate frame, welded');
    const notes = await page.waitForSelector('input[placeholder="e.g. Against your PO 4471"]');
    await notes.type('Against PO 4471');
    await page.select('select[data-party-select="customer"]', String(beta.id));
    await sleep(1200);
    ok(await val('[placeholder="Item or service"]') === 'Gate frame, welded', 'the line typed stays when the customer changes');
    ok(await val('input[placeholder="e.g. Against your PO 4471"]') === 'Against PO 4471', 'and so do the notes');
    ok(await page.evaluate((b) => [...document.querySelectorAll('input, textarea')].some(i => i.value === b), BETA), "the bill-to is now the new customer's");

    section('A delivery challan: picking the order');
    await go('/delivery-challans');
    await clickText('button', /New Challan/);
    const desc = await page.waitForSelector('form input[value=""]', { visible: true });
    const firstDesc = await page.evaluateHandle(() => [...document.querySelectorAll('form label')].find(l => /^Description/.test(l.innerText))?.parentElement.querySelector('input'));
    await firstDesc.type('Hand-typed bracket');
    const prefill = await page.evaluateHandle(() => [...document.querySelectorAll('form label')].find(l => /Prefill from order/.test(l.innerText))?.parentElement.querySelector('select'));
    await prefill.select(String(order.id));
    const t2 = await box();
    ok(/Use the order's lines\?/.test(t2) && /1 line you typed/.test(t2), `it asks before replacing the line typed by hand ("${t2.split('\n').slice(0, 2).join(' / ')}")`);
    await page.click('[data-app-dialog-cancel]');
    await boxGone();
    const descs = () => page.evaluate(() => [...document.querySelectorAll('form label')].filter(l => /^Description/.test(l.innerText)).map(l => l.parentElement.querySelector('input').value));
    ok((await descs()).join() === 'Hand-typed bracket', 'Keep my lines: the typed line stays');
    ok(await page.evaluate((id) => document.querySelector('select[data-party-select="customer"]')?.value === String(id), alpha.id), "the order's customer is still filled in");
    await prefill.select('');
    await prefill.select(String(order.id));
    await box();
    await page.click('[data-app-dialog-ok]');
    await boxGone(); await sleep(300);
    ok((await descs()).join() === 'Order gate,Order grill', `Use the order's lines: replaced (${(await descs()).join(' · ')})`);

    section('Goods received: a PO of two lines');
    await go('/grn');
    await clickText('button', /Record|Receive|New GRN|Add GRN|Log/).catch(() => {});
    await sleep(400);
    await page.waitForSelector('select[aria-label="Purchase order"]', { visible: true, timeout: 5000 });
    await page.select('select[aria-label="Purchase order"]', String(po.id));
    await page.waitForSelector('select[aria-label="Line of the purchase order"]', { visible: true, timeout: 5000 });
    await page.type('input[placeholder="TS 09 EU 1234"]', 'TS 09 EU 1234');
    await page.type('input[aria-label="Quantity received"]', '4');
    await page.$eval('input[aria-label="Quantity received"]', el => el.form.requestSubmit());
    await sleep(700);
    const btn = await page.$eval('input[aria-label="Quantity received"]', el => { const b = el.form.querySelector('button[type="submit"]'); return { t: b.innerText.trim(), d: b.disabled }; });
    ok(await page.evaluate(() => /Choose which line of the purchase order arrived/.test(document.body.innerText)), 'without a line chosen it says to choose one');
    ok(!/Saving/.test(btn.t) && !btn.d, `and the button is ready again ("${btn.t}"), not stuck on Saving…`);
    ok(await val('input[placeholder="TS 09 EU 1234"]') === 'TS 09 EU 1234' && await val('input[aria-label="Quantity received"]') === '4', 'with the vehicle and quantity still there');

    section('A popup: Log an enquiry');
    await go('/enquiries');
    await page.click('[data-log-enquiry]');
    await page.waitForSelector('#le-msg', { visible: true });
    await page.type('#le-msg', 'Need 40 fire doors for the Kondapur hospital block');
    const r = await page.$eval('#le-msg', el => { const b = el.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 10 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down();
    await page.mouse.move(6, 6, { steps: 8 }); await page.mouse.up();
    await sleep(300);
    ok(await val('#le-msg') === 'Need 40 fire doors for the Kondapur hospital block', 'a drag that ends outside no longer closes it');
    await page.keyboard.press('Escape');
    ok(/Discard what you typed\?/.test(await box()), 'Esc asks first');
    await page.click('[data-app-dialog-cancel]');
    await boxGone();
    ok(await val('#le-msg') === 'Need 40 fire doors for the Kondapur hospital block', 'Keep editing: still there');
    await page.mouse.click(6, 6);
    ok(/Discard what you typed\?/.test(await box()), 'a click outside asks too');
    await page.click('[data-app-dialog-ok]');
    await boxGone(); await sleep(300);
    ok(!(await page.$('#le-msg')), 'Discard closes it');
    await page.click('[data-log-enquiry]');
    await page.waitForSelector('#le-msg', { visible: true });
    await page.keyboard.press('Escape');
    await sleep(400);
    ok(!(await page.$('#le-msg')) && !(await page.$('[data-app-dialog]')), 'with nothing typed, Esc just closes it');

    section('Roles: two with unsaved ticks');
    await go('/configurator/roles');
    await page.waitForSelector(`button[title="Guard A ${stamp} can write customers"]`, { visible: true, timeout: 8000 });
    await page.click(`button[title="Guard A ${stamp} can write customers"]`);
    await page.click(`button[title="Guard B ${stamp} can write customers"]`);
    await clickText('button', new RegExp(`Save ${roleA}`));
    await sleep(1500);
    ok(await page.evaluate((b) => new RegExp(`Unsaved changes to ${b}`).test(document.body.innerText), roleB), 'after saving one role, the other still shows its unsaved change');
    ok(!!(await byText('button', new RegExp(`Save ${roleB}`))).asElement(), 'and can still be saved');
    const saved = await q('SELECT role, permissions FROM org_roles WHERE role = ANY($1)', [[roleA, roleB]]).catch(() => []);
    if (saved.length) {
      const pa = saved.find(x => x.role === roleA)?.permissions, pb = saved.find(x => x.role === roleB)?.permissions;
      ok(JSON.stringify(pa?.customers || []).includes('write') && !JSON.stringify(pb?.customers || []).includes('write'), 'A is saved with write; B is not saved yet');
    }

    /* Edited on the invoice itself (components/DocEdit, since 26 Nov). */
    section('An invoice number edited in place');
    await go(`/sales-invoices/${inv1.id}`);
    await page.click('[data-doc-edit]');
    const taken = inv2.invoice_number || inv2.invoiceNumber;
    const field = await page.waitForSelector('input[aria-label="Invoice number"]', { visible: true });
    await sleep(200);
    await typeAt(field, taken);
    await page.click('[data-de-save]');
    await page.waitForFunction(() => /already used/.test(document.querySelector('[data-de-error]')?.textContent || ''), { timeout: 8000 }).catch(() => {});
    ok(await val('input[aria-label="Invoice number"]') === taken, `a number already used is refused, and what was typed stays (${taken})`);
    ok(await page.evaluate(() => /already used/.test(document.querySelector('[data-de-error]')?.textContent || '')), 'with the reason beside it');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find(b => /Discard changes/.test(b.textContent))?.click());
    await sleep(400);
    ok(!(await page.$('input[aria-label="Invoice number"]')) && (await page.evaluate(() => document.querySelector('.invoice-mock')?.innerText || '')).includes(inv1.invoice_number || inv1.invoiceNumber),
      'Esc asks, then puts the old number back');

    section('Clean run');
    ok(errs.length === 0, errs.length ? `page errors: ${errs.slice(0, 3).join(' | ')}` : 'no page errors');
    ok(nativeDialogs === 0, `no browser boxes (${nativeDialogs})`);
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
