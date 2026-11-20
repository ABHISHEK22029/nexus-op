/* ══════════════════════════════════════════════════════════════════════
   Planned material and the dispatch guard, clicked through in the app.

     · a job opened with "Make" shows its bill of materials as PLANNED
       material, with nothing issued and nothing taken from stock
     · Issue fills the form from the plan; pressing + takes it from stock
     · the order's readiness counts what is already on the floor
     · dispatching more than is in stock is refused, with the reason
     · an item with no stock record goes, and the app says so

   Builds its own throwaway company (guardui-*@example.test) through the
   API, then removes it. Needs the backend (SCHEDULER=off) and vite running.
   Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Client } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const { purgeOrg } = require(path.join(__dirname, '../../backend/scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sql = async (q, p) => { const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); try { return (await c.query(q, p)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'guardui-%@example.test'`);
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
    body: JSON.stringify({ name: 'Guard UI', email: `guardui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Precision Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36' });
    const sheetName = `SS304 sheet ${stamp}`, skuName = `SS304 Bracket ${stamp}`;
    const sheet = await api('POST', '/raw-materials', { name: sheetName, unit: 'kg', base_uom: 'kg' });
    const sku = await api('POST', '/skus', { sku_code: `BRK-${stamp}`, name: skuName, unit: 'nos', price: 2320 });
    await api('PUT', `/skus/${sku.id}/bom`, { lines: [{ rawMaterialId: sheet.id, qtyPerUnit: 1.5, uom: 'kg' }] });
    const stockRow = (await api('POST', '/inventory', { rawMaterialId: sheet.id, quantity: 143, uom: 'kg', unitCost: 255 })).item;
    const cust = await api('POST', '/customers', { name: `Apollo Fabricators ${stamp}`, state: 'Telangana' });
    const co = await api('POST', '/customer-orders', { customerId: cust.id, items: [{ skuId: sku.id, description: skuName, quantity: 120, unit: 'nos', rate: 2320 }] });
    const line = (await api('GET', `/customer-orders/${co.id}`)).items[0];
    const job = await api('POST', `/production/from-order-item/${line.id}`, {});

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, reg.token);
    const waitFor = (fn, ms = 8000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const text = () => page.evaluate(() => document.body.innerText);

    console.log('\n  ── a job from "Make": planned, not issued');
    await page.goto(`${UI}/production/${job.id}`, { waitUntil: 'networkidle2' });
    await waitFor(() => !!document.querySelector('[data-plan]'));
    const plan = await page.evaluate(() => ({
      card: document.querySelector('[data-plan]')?.innerText || '',
      button: document.querySelector('[data-issue-plan]')?.innerText || '',
    }));
    ok(/Planned material/.test(plan.card) && /180 kg/.test(plan.card), 'the job shows its sheet as planned material: 180 kg');
    ok(/No material issued yet/.test(await text()), 'and nothing as issued');
    ok(/Issue 143 kg/.test(plan.button), `its button offers what is on the shelf ("${plan.button}")`);

    await page.click('[data-issue-plan]');
    await waitFor(() => document.querySelector('[data-issue-qty]')?.value === '143');
    const form = await page.evaluate(() => ({ from: document.querySelector('[data-issue-from]')?.value, qty: document.querySelector('[data-issue-qty]')?.value }));
    ok(form.from === String(stockRow.id) && form.qty === '143', `Issue fills the form: that stock row, 143 (${form.from}, ${form.qty})`);
    await page.click('button[aria-label="Issue material"]');
    const issued = await waitFor(() => /Issued from stock/.test(document.body.innerText));
    await waitFor(() => /Out of stock/.test(document.querySelector('[data-plan]')?.innerText || ''));
    const after = await page.evaluate(() => ({
      plan: document.querySelector('[data-plan]')?.innerText || '',
      metric: document.querySelector('[data-metric="Material issued"]')?.innerText || '',
    }));
    const left = Number((await sql('SELECT quantity FROM inventory WHERE id = $1', [stockRow.id]))[0].quantity);
    ok(issued && left === 0 && /Out of stock/.test(after.plan) && /143/.test(after.metric),
      `pressing + takes it from stock (${left} kg left); the plan and "Material issued" show it`);

    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await waitFor(() => !!document.querySelector('[data-plan]'));
    const fit = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    ok(fit.sw <= fit.w + 1, `at phone width the page does not scroll sideways (${fit.sw} of ${fit.w})`);
    await page.setViewport({ width: 1440, height: 1000 });

    console.log('\n  ── the order knows what is on the floor');
    await page.goto(`${UI}/customer-orders`, { waitUntil: 'networkidle2' });
    await waitFor((n) => document.body.innerText.includes(n), 8000, co.orderNumber);
    await page.evaluate((n) => [...document.querySelectorAll('tr')].find(r => r.innerText.includes(n))?.click(), co.orderNumber);
    await waitFor(() => /Can build|can be built/.test(document.body.innerText), 10000);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Details/.test(b.innerText))?.click());
    await waitFor(() => !!document.querySelector('[data-on-floor]'));
    const ready = await page.evaluate(() => ({ body: document.body.innerText, floor: document.querySelector('[data-on-floor]')?.innerText || '' }));
    ok(/Can build 95 of 120/.test(ready.body) && /143 issued to this order/.test(ready.floor),
      `readiness: "Can build 95 of 120", with "${ready.floor}"`);

    console.log('\n  ── dispatch, against what is in stock');
    await api('POST', `/production/${job.id}/output`, { itemName: skuName, outputQty: 95, uom: 'nos', outputWeight: 134.42 });
    const pre = await api('GET', `/delivery-challans/prefill/${co.id}`);
    const big = await api('POST', '/delivery-challans', { customerId: cust.id, customerOrderId: co.id, items: [{ ...pre.items[0], quantity: 120 }] });
    const sample = await api('POST', '/delivery-challans', { customerId: cust.id, items: [{ description: `Sample offcut ${stamp}`, quantity: 2, uom: 'nos', rate: 0 }] });
    await page.goto(`${UI}/delivery-challans`, { waitUntil: 'networkidle2' });
    await waitFor((n) => document.body.innerText.includes(n), 8000, big.challanNumber);
    await page.select(`select[aria-label="Status of ${big.challanNumber}"]`, 'Dispatched');
    const refused = await waitFor(() => /Only 95 nos of .* is in stock; this challan sends 120 nos/.test(document.body.innerText));
    const bigNow = (await sql('SELECT status FROM delivery_challans WHERE id = $1', [big.id]))[0].status;
    ok(refused && bigNow === 'Draft', `dispatching 120 with 95 in stock is refused, with the reason; the challan stays ${bigNow}`);
    await page.select(`select[aria-label="Status of ${sample.challanNumber}"]`, 'Dispatched');
    const told = await waitFor((n) => document.body.innerText.includes(`stock didn't change for: Sample offcut ${n}`), 8000, stamp);
    ok(told, 'an item with no stock record goes, and the app names it');

    ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs[0] : ''}`);
  } catch (e) {
    ok(false, 'stopped: ' + (e.stack || e.message));
  } finally {
    if (browser) await browser.close();
    const n = await cleanup();
    console.log(`\n   cleaned up ${n} throwaway account(s)`);
    console.log(`\n   ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
