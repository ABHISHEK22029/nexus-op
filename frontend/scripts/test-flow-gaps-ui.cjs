/* ══════════════════════════════════════════════════════════════════════
   The order-to-cash links that were missing, clicked through in the app.

     · Enquiries → Convert to quotation opens the quotation already filled in
     · Requirements → Raise purchase orders previews, then raises them
     · Vendor quotations → Compare → Raise PO orders from that vendor
     · the avatar menu lists notifications, not just a count
     · Goods receipt and Production work with no project chosen

   Builds its own throwaway company (gapsui-*@example.test) through the API,
   then removes it. Needs the backend (SCHEDULER=off) and vite running.
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sql = async (q, p) => { const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); try { return (await c.query(q, p)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'gapsui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM sku_bom WHERE sku_id IN (SELECT id FROM skus WHERE owner_id = ANY($1))', [ids]).catch(() => {});
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Gaps UI', email: `gapsui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  const owner = reg.user.id;
  let browser;
  try {
    /* ── a company with a real shortfall ── */
    await api('PUT', '/company-profile', { name: 'Precision Fab Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });
    const cust = await api('POST', '/customers', { name: `Acme Engineering ${stamp}`, state: 'Telangana', billing_address: 'Hyderabad' });
    const vendor = await api('POST', '/vendors', { name: `Deccan Metals ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' });
    const mat = await api('POST', '/raw-materials', { name: `SS304 sheet ${stamp}`, unit: 'kg', category: 'Sheet' });
    const skuName = `SS304 Mounting Bracket ${stamp}`;
    const sku = await api('POST', '/skus', { sku_code: `BRK-${stamp}`, name: skuName, unit: 'nos', price: 2320, hsn: '7326' });
    await sql('INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom) VALUES ($1,$2,$3,12,$4)', [sku.id, mat.id, `SS304 sheet ${stamp}`, 'kg']);
    await api('POST', '/vendor-items', { vendor_id: vendor.id, raw_material_id: mat.id, price: 260, price_uom: 'kg', moq: 500, lead_time_days: 7, is_preferred: true });
    await sql(`INSERT INTO inventory ("itemName", quantity, uom, raw_material_id, item_type, owner_id) VALUES ($1,200,'kg',$2,'raw',$3)`, [`SS304 sheet ${stamp}`, mat.id, owner]);
    await api('POST', '/customer-orders', { customerId: cust.id, orderDate: new Date().toISOString().slice(0, 10),
      items: [{ skuId: sku.id, description: skuName, quantity: 100, rate: 2320, unit: 'nos' }] });
    const [enq] = await sql(`INSERT INTO enquiries (owner_id, ref, name, company, phone, email, message, status, source)
      VALUES ($1,$2,'Ravi','Acme Engineering Pvt. Ltd.','9000000000','ravi@acme.example','Brushed finish, delivery in 4 weeks','New','catalogue') RETURNING id`, [owner, `ENQ-${stamp}`]);
    await sql(`INSERT INTO enquiry_items (enquiry_id, sku_id, description, quantity, unit, sort_order) VALUES ($1,$2,$3,120,'nos',0)`, [enq.id, sku.id, skuName]);
    const upload = async (rate) => {
      const fd = new FormData();
      fd.append('file', new Blob([`Description,Qty,Unit,Rate,Amount\nSS304 sheet 2 mm,180,kg,${rate},${rate * 180}\n`], { type: 'text/csv' }), `quote-${rate}.csv`);
      fd.append('vendorId', String(vendor.id));
      return (await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: { Authorization: `Bearer ${reg.token}` }, body: fd })).json();
    };
    const q260 = await upload(260), q283 = await upload(283);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, reg.token);
    const clickText = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    /* the innermost element showing the text — a click there bubbles to the
       row's handler; clicking an outer container does nothing */
    const clickDeepest = (re) => page.evaluate((src) => {
      const rx = new RegExp(src);
      const hits = [...document.querySelectorAll('body *')].filter(e => rx.test(e.textContent || ''));
      const leaf = hits.filter(e => ![...e.children].some(c => rx.test(c.textContent || ''))).pop();
      if (leaf) leaf.click();
      return !!leaf;
    }, re.source);
    const waitFor = (fn, ms = 8000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);

    /* 1 */
    console.log('\n  ── enquiry → quotation, filled in');
    await page.goto(`${UI}/enquiries`, { waitUntil: 'networkidle2' });
    await waitFor(() => /Ravi|Acme/.test(document.body.innerText));
    await clickDeepest(/Acme Engineering Pvt\. Ltd\./);
    await waitFor(() => [...document.querySelectorAll('button')].some(b => /Convert to quotation/.test(b.textContent)));
    await clickText('button', /Convert to quotation/);
    const landed = await waitFor(() => location.pathname === '/sales-quotations' && !!document.querySelector('[data-from-enquiry]'), 10000);
    const form = await page.evaluate(() => ({
      banner: document.querySelector('[data-from-enquiry]')?.innerText || '',
      descs: [...document.querySelectorAll('form input')].map(i => i.value),
    }));
    ok(landed && /Brushed finish, delivery in 4 weeks/.test(form.banner), 'the quotation opens with what the customer asked, quoted above the form');
    ok(form.descs.some(v => /SS304 Mounting Bracket/.test(v)) && form.descs.includes('120'),
      `and their line filled in: the product, 120 of them (${form.descs.filter(Boolean).join(' | ')})`);
    await page.evaluate(() => {
      const rate = [...document.querySelectorAll('form input[type="number"]')].find(i => i.value === '' && /rate/i.test(i.closest('div')?.innerText || ''));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      if (rate) { setter.call(rate, '2320'); rate.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await clickText('form button[type="submit"]', /Create Quotation/);
    await sleep(1500);
    const [lk] = await sql('SELECT quotation_id FROM enquiries WHERE id = $1', [enq.id]);
    ok(!!lk.quotation_id, 'saving it links the enquiry to the quotation');
    const savedLines = lk.quotation_id ? await sql('SELECT sku_id, hsn, quantity FROM sales_quotation_items WHERE sales_quotation_id = $1', [lk.quotation_id]) : [];
    ok(savedLines.length === 1 && savedLines[0].sku_id === sku.id && savedLines[0].hsn === '7326' && Number(savedLines[0].quantity) === 120,
      'with the product link and HSN 7326 carried onto the quotation');

    /* 2 */
    console.log('\n  ── requirements → raise purchase orders');
    await page.goto(`${UI}/material-requirements`, { waitUntil: 'networkidle2' });
    const hasBtn = await waitFor(() => !!document.querySelector('[data-open-shortfall-po]'));
    ok(hasBtn, 'a shortfall offers "Raise purchase orders"');
    await page.click('[data-open-shortfall-po]');
    const previewed = await waitFor(() => !!document.querySelector('[data-plan-vendor]'));
    const preview = await page.evaluate(() => document.querySelector('[data-plan-vendor]')?.innerText || '');
    ok(previewed && /Deccan Metals/.test(preview) && /1,000 kg/.test(preview), `it previews the PO first: the preferred vendor, 1,000 kg${previewed && !/1,000 kg/.test(preview) ? ' — saw: ' + preview.replace(/\s+/g, ' ').slice(0, 220) : ''}`);
    await page.click('[data-raise-pos]');
    const raised = await waitFor(() => !!document.querySelector('[data-raised]'));
    const raisedText = await page.evaluate(() => document.querySelector('[data-raised]')?.innerText || '');
    ok(raised && /\/FY\d{4}-\d{2}\//.test(raisedText), `then raises it, in the PO series (${raisedText.split('\n')[0]})`);
    await page.keyboard.press('Escape');

    /* 3 */
    console.log('\n  ── compare vendor quotes → raise PO');
    await page.goto(`${UI}/vendor-quotations`, { waitUntil: 'networkidle2' });
    await waitFor(() => document.querySelectorAll('input[type="checkbox"]').length >= 2);
    await page.evaluate((ids) => ids.forEach(id => document.querySelector(`input[aria-label*="Compare"][data-id="${id}"]`)?.click()), [q260.id, q283.id]);
    const boxes = await page.$$('tbody input[type="checkbox"]');
    if (boxes.length >= 2) { await boxes[0].click(); await boxes[1].click(); }
    await clickText('button', /Compare/);
    await waitFor(() => !!document.querySelector('[data-raise-po]'));
    const btns = await page.evaluate(() => [...document.querySelectorAll('[data-raise-po]')].map(b => ({ id: b.dataset.raisePo, primary: b.className.includes('btn-primary') })));
    ok(btns.length === 2 && btns.find(b => b.id === String(q260.id))?.primary, 'each vendor can be ordered from; the lowest like for like is the primary action');
    await page.click(`[data-raise-po="${q260.id}"]`);
    const poShown = await waitFor(() => !!document.querySelector('[data-po-raised]'), 10000);
    const poText = await page.evaluate(() => document.querySelector('[data-po-raised]')?.innerText.trim());
    ok(poShown && /\/FY\d{4}-\d{2}\//.test(poText || ''), `"Raise PO" orders from them and the row shows the PO (${poText})`);

    /* 4 */
    console.log('\n  ── notifications, readable');
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.click('button[aria-label^="Account"]');
    await waitFor(() => !!document.querySelector('[data-open-notifications]'));
    await page.click('[data-open-notifications]');
    await waitFor(() => !!document.querySelector('[data-notifications]'));
    const notesText = await page.evaluate(() => document.querySelector('[data-notifications]')?.innerText || '');
    ok(/raised/.test(notesText), 'the avatar menu lists the notifications themselves');
    ok(!/caught up/.test(notesText), 'and the new purchase orders are among them');

    /* 5 */
    console.log('\n  ── no project needed');
    const poRow = (await sql(`SELECT id FROM purchase_orders WHERE owner_id = $1 AND "quoteRef" LIKE 'Quotation file%'`, [owner]))[0];
    await api('PATCH', `/po/${poRow.id}/approve`);
    await api('PATCH', `/po/${poRow.id}/dispatch`);
    await page.goto(`${UI}/grn`, { waitUntil: 'networkidle2' });
    await waitFor(() => document.querySelectorAll('form select option').length > 1);
    await page.select('form select', String(poRow.id));
    const qty = await page.$('form input[type="number"]');
    await qty.click({ clickCount: 3 }); await qty.type('180');
    await clickText('form button', /Generate GRN/);
    const listed = await waitFor(() => /180/.test(document.querySelector('table')?.innerText || ''), 8000);
    const [g] = await sql('SELECT COUNT(*)::int n FROM grn WHERE "poId" = $1', [poRow.id]);
    ok(g.n === 1 && listed, 'goods are received with no project chosen, and listed');
    await page.goto(`${UI}/production`, { waitUntil: 'networkidle2' });
    await sleep(800);
    ok(await page.evaluate(() => !/Select a project first/.test(document.body.innerText)), 'Production opens with no project chosen');
    ok(!errs.length, `no page errors${errs.length ? ': ' + errs[0] : ''}`);
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.message);
  } finally {
    await browser?.close();
    const n = await cleanup();
    ok(n === 1, `test account removed (${n})`);
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
