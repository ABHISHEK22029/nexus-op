#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   History of a document (backend/shared/docHistory, components/DocHistory).

   Every change to an invoice, quotation, delivery challan, purchase order,
   vendor bill or credit/debit note is kept — made on its page, by its
   status, sign-off or dispatch, or by a bulk action — with who and when,
   and said in words. A change the server refuses leaves nothing behind.
   Another company cannot read it. On the page: History lists the
   versions, any earlier one can be shown and printed as it was, and
   editing waits until you are back on the current one.

   Before migration 078 (document_versions) is applied, the same saves
   must still work and the History panel says there are no changes yet:
   that half runs either way.

   Builds its own throwaway companies (dhist-*@example.test) and removes
   them. Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const B = path.join(__dirname, '../../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules/pg'));
const { purgeOrg } = require(path.join(B, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const rows = async (sql, p) => { const c = db(); await c.connect(); try { return (await c.query(sql, p)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows: r } = await c.query(`SELECT id FROM users WHERE email LIKE 'dhist-%@example.test'`);
    const ids = r.map(x => x.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const x = await purgeOrg(c, ids); if (!x.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

async function signUp(name) {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: `dhist-${name.toLowerCase().replace(/\W+/g, '')}-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { ...(await r.json().catch(() => ({}))), code: r.status }; };
  return { reg, api };
}

(async () => {
  await cleanup();
  const hasTable = !!(await rows(`SELECT to_regclass('public.document_versions') AS t`))[0].t;
  console.log(`\n  document_versions ${hasTable ? 'is there — full run' : 'is NOT there yet (migration 078) — saves-still-work half only'}`);
  const { reg, api } = await signUp('History One');
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'History Works Pvt Ltd', address: 'Plot 4, IDA Uppal, Hyderabad', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const cust = await api('POST', '/customers', { name: `Lakeview Builders ${stamp}`, gstin: '36AAACS1234C1Z5', state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Madhapur, Hyderabad', shipping_address: 'Site 3, Kokapet' });
    const vend = await api('POST', '/vendors', { name: `Godavari Metals ${stamp}`, gstin: '36AABCD1234E1Z2', state: 'Telangana', type: 'Supplier' });
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, notes: 'Deliver to site gate 2', items: [{ description: 'MS bracket', quantity: 40, uom: 'nos', rate: 450 }] });
    const inv2 = await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, items: [{ description: 'Base plate', quantity: 7, uom: 'nos', rate: 700 }] });
    const q = await api('POST', '/sales-quotations', { customerId: cust.id, items: [{ description: 'Canopy frame', quantity: 4, rate: 2500 }] });
    const dc = await api('POST', '/delivery-challans', { customerId: cust.id, challanDate: today, vehicleNo: 'TS09AB1234', items: [{ description: 'MS bracket', hsn: '7308', quantity: 40, uom: 'nos', rate: 450 }] });
    const po = await api('POST', '/po', { vendorId: vend.id, itemName: 'SS304 sheet', quantity: 100, gstRate: 18, items: [{ description: 'SS304 sheet 2 mm', uom: 'kg', quantity: 100, unitPrice: 260 }] });
    const bill = await api('POST', '/grn-bills', { vendorId: vend.id, billDate: today, gstRate: 18, items: [{ description: 'SS304 sheet 2 mm', hsn: '7219', uom: 'kg', quantity: 100, rate: 260 }] });
    const note = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, refNumber: 'OLD/22', gstRate: 18, reason: 'Rate difference', items: [{ description: 'Rate difference', quantity: 1, rate: 500 }] });
    const made = [inv, inv2, q, dc, po, bill, note];
    ok(made.every(x => x.id && x.code < 300), `seven documents made (${made.map(x => x.code).join(', ')})`);

    /* history, waiting for the copy taken just after the answer */
    const history = async (p, id, atLeast = 0) => {
      let h;
      for (let i = 0; i < 20; i++) { h = await api('GET', `/${p}/${id}/history`); if ((h.versions || []).length >= atLeast) break; await sleep(300); }
      return h;
    };

    section('the changes themselves go through, as before');
    const e1 = await api('PATCH', `/sales-invoices/${inv.id}`, { notes: 'Deliver to site gate 3', items: [{ description: 'MS bracket', quantity: 40, uom: 'nos', rate: 480 }, { description: 'Anchor bolt M16', quantity: 160, uom: 'nos', rate: 22 }] });
    ok(e1.code === 200 && e1.notes === 'Deliver to site gate 3', `a draft invoice's notes and lines save (${e1.code})`);
    const s1 = await api('PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    ok(s1.code === 200, `the invoice is sent (${s1.code})`);
    const e2 = await api('PATCH', `/sales-invoices/${inv.id}`, { notes: 'Deliver to site gate 3, after 10 am' });
    ok(e2.code === 200, `an issued invoice's notes save (${e2.code})`);
    const refused = await api('PATCH', `/sales-invoices/${inv.id}`, { items: [{ description: 'MS bracket', quantity: 1, rate: 1 }] });
    ok(refused.code === 409, `an issued invoice's lines are still refused (${refused.code})`);
    const qe = await api('PATCH', `/sales-quotations/${q.id}`, { notes: 'Prices hold for 15 days' });
    ok(qe.code === 200, `a quotation saves (${qe.code})`);
    const dce = await api('PATCH', `/delivery-challans/${dc.id}`, { vehicle_no: 'TS10CD5678' });
    ok(dce.code === 200, `a challan saves (${dce.code})`);
    const poe = await api('PATCH', `/po/${po.id}`, { warranty: '18 months' });
    ok(poe.code === 200, `a PO saves (${poe.code})`);
    const poa = await api('PATCH', `/po/${po.id}/approve`, {});
    ok(poa.code === 200, `a PO is approved (${poa.code})`);
    const be = await api('PATCH', `/grn-bills/${bill.id}`, { notes: 'Bill checked against GRN' });
    ok(be.code === 200, `a vendor bill saves (${be.code})`);
    const ne = await api('PATCH', `/credit-debit-notes/${note.id}`, { reason: 'Rate difference — agreed on call' });
    ok(ne.code === 200, `a note saves (${ne.code})`);
    const bulk = await api('POST', '/sales-invoices/bulk', { action: 'mark_sent', ids: [inv2.id] });
    ok(bulk.code === 200 && (bulk.done || []).length === 1, `a bulk "mark as sent" goes through (${bulk.code})`);

    if (!hasTable) {
      section('without the table');
      const h = await history('sales-invoices', inv.id);
      ok(h.code === 200 && Array.isArray(h.versions) && h.versions.length === 0, `history answers, empty (${h.code})`);
    } else {
      section('what is kept');
      const h = await history('sales-invoices', inv.id, 3);
      const v = h.versions || [];
      ok(v.length === 3, `the invoice has three changes, the refused one not among them (${v.length})`);
      const [last, sent, first] = v;
      const has = (ver, field, from, to) => (ver?.changes || []).some(c => c.field === field && (from == null || c.from === from) && (to == null || c.to === to));
      ok(first?.action === 'edit' && has(first, 'Notes', 'Deliver to site gate 2', 'Deliver to site gate 3'), 'the first: notes, from → to');
      ok(has(first, 'Rate, line 1', '₹450.00', '₹480.00'), 'the first: rate on line 1, ₹450.00 → ₹480.00');
      ok((first?.changes || []).some(c => c.field === 'Line 2 added' && /Anchor bolt M16/.test(c.to)), 'the first: line 2 added, named');
      ok(has(first, 'Total'), 'the first: the total that followed');
      ok(sent?.action === 'status' && has(sent, 'Status', 'Draft', 'Sent'), 'the second: status Draft → Sent');
      ok(last?.action === 'edit' && has(last, 'Notes', null, 'Deliver to site gate 3, after 10 am'), 'the third: the issued invoice\'s notes');
      ok(v.every(x => x.by === 'History One' && x.at), 'each says who and when');
      ok(first?.before?.items?.length === 1 && first?.after?.items?.length === 2 && Number(first.before.items[0].rate) === 450,
        'each holds the whole document, lines included, before and after');
      ok(first?.before?.customer?.name === cust.name, 'and who it was for');

      const kinds = [
        ['sales-quotations', q.id, 'Notes'], ['delivery-challans', dc.id, 'Vehicle no.'], ['po', po.id, 'Warranty'],
        ['grn-bills', bill.id, 'Notes'], ['credit-debit-notes', note.id, 'Reason'],
      ];
      for (const [p, id, field] of kinds) {
        const hh = await history(p, id, 1);
        ok((hh.versions || []).some(x => x.changes.some(c => c.field === field)), `${p}: "${field}" kept`);
      }
      const poh = await history('po', po.id, 2);
      ok((poh.versions || []).some(x => x.action === 'status' && x.changes.some(c => c.field === 'Status' && c.to === 'Approved')), 'po: its approval kept');
      const bh = await history('sales-invoices', inv2.id, 1);
      ok((bh.versions || []).some(x => x.changes.some(c => c.field === 'Status' && c.to === 'Sent')), 'the bulk "mark as sent" kept too');

      section('nothing kept for nothing');
      const same = await api('PATCH', `/grn-bills/${bill.id}`, { notes: 'Bill checked against GRN' });
      await sleep(1500);
      const bh2 = await history('grn-bills', bill.id);
      ok(same.code === 200 && (bh2.versions || []).length === 1, `saving the same notes again adds nothing (${(bh2.versions || []).length})`);

      section('another company');
      const other = await signUp('History Two');
      const peek = await other.api('GET', `/sales-invoices/${inv.id}/history`);
      ok(peek.code === 404 && !peek.versions, `cannot read this company's history (${peek.code})`);
      const stored = await rows('SELECT DISTINCT owner_id FROM document_versions WHERE doc_type = $1 AND doc_id = $2', ['sales_invoice', inv.id]);
      ok(stored.length === 1 && String(stored[0].owner_id) === String(reg.user.orgId ?? reg.user.id), 'and the copies carry the company they belong to');
    }

    section('on the page');
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('maks_app_dialogs', '1'); }, reg.token, reg.user);
    await page.goto(`${UI}/sales-invoices/${inv.id}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-doc-history]', { timeout: 30000 });
    ok(true, 'History is in the invoice\'s toolbar');
    await page.click('[data-doc-history]');
    await page.waitForSelector('[data-history-panel]', { timeout: 10000 });
    await page.waitForFunction(() => !/Loading the changes/.test(document.querySelector('[data-history-panel]')?.textContent || ''), { timeout: 15000 });
    const panel = await page.$eval('[data-history-panel]', el => el.textContent);
    if (!hasTable) {
      ok(!!(await page.$('[data-history-empty]')) && /No changes yet/.test(panel), 'the panel says there are no changes yet');
    } else {
      const nVersions = await page.$$eval('[data-history-version]', els => els.length);
      ok(nVersions === 4, `four versions listed: the original and three changes (${nVersions})`);
      ok(/Version 4 · current/.test(panel) && /Version 1 · as first saved/.test(panel), 'newest first, the current one marked, the original at the foot');
      ok(/Rate, line 1/.test(panel) && /₹480\.00/.test(panel) && /Anchor bolt M16/.test(panel), 'the changes said in words');
      ok(/History One/.test(panel), 'with who made them');
      await page.click('[data-history-view="1"]');
      await page.waitForSelector('[data-version-bar]', { timeout: 10000 });
      await sleep(400);
      const bar = await page.$eval('[data-version-bar]', el => el.textContent);
      ok(/Version 1 of 4/.test(bar) && /first saved/.test(bar), `the bar says which version is showing ("${bar.slice(0, 60).trim()}…")`);
      const sheet = await page.$eval('.invoice-mock', el => el.textContent);
      ok(/Deliver to site gate 2/.test(sheet) && !/Anchor bolt M16/.test(sheet), 'the sheet shows that version: its notes, its one line');
      ok(/DRAFT/i.test(sheet), 'and as the draft it was');
      ok(!(await page.$('[data-doc-edit]')) && !(await page.$('[data-doc-history]')), 'editing is put away while it shows');
      await page.click('.invoice-mock'); await sleep(400);
      ok(!(await page.$('.de-bar')), 'a click on the sheet does not start editing it');
      ok(!!(await page.$('[data-version-print]')), 'it can be printed as it was');
      await page.click('[data-version-back]');
      await page.waitForFunction(() => !document.querySelector('[data-version-bar]'), { timeout: 10000 });
      await sleep(800);
      const now = await page.$eval('.invoice-mock', el => el.textContent);
      ok(/after 10 am/.test(now) && /Anchor bolt M16/.test(now), 'back to the current version');
      ok(!!(await page.$('[data-doc-edit]')), 'and Edit is back');
    }
    await page.keyboard.press('Escape').catch(() => {});

    for (const [p, id, label] of [['sales-quotations', q.id, 'quotation'], ['delivery-challans', dc.id, 'challan'], ['po', po.id, 'PO'], ['grn-bills', bill.id, 'vendor bill'], ['credit-debit-notes', note.id, 'note']]) {
      await page.goto(`${UI}/${p}/${id}`, { waitUntil: 'networkidle2' });
      const found = await page.waitForSelector('[data-doc-history]', { timeout: 30000 }).then(() => true).catch(() => false);
      if (!found) { ok(false, `History on the ${label}'s page`); continue; }
      await page.click('[data-doc-history]');
      await page.waitForSelector('[data-history-panel]', { timeout: 10000 });
      await page.waitForFunction(() => !/Loading the changes/.test(document.querySelector('[data-history-panel]')?.textContent || ''), { timeout: 15000 });
      const n = await page.$$eval('[data-history-version]', els => els.length);
      ok(hasTable ? n >= 2 : !!(await page.$('[data-history-empty]')), `History on the ${label}'s page${hasTable ? ` (${n} versions)` : ''}`);
      if (hasTable) {
        await page.click('[data-history-view="1"]');
        const shown = await page.waitForSelector('[data-version-bar]', { timeout: 10000 }).then(() => true).catch(() => false);
        ok(shown, `an earlier ${label} can be shown`);
        if (shown) { await page.click('[data-version-back]'); await sleep(600); }
      } else {
        await page.keyboard.press('Escape');
      }
    }
    ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
  } catch (e) {
    fail++; console.log('   ❌ crashed:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const removed = await cleanup().catch(() => 0);
    ok(removed >= 1, `test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
