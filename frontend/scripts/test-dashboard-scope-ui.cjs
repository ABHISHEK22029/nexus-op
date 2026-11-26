#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The dashboard and the project switch.

   Found on 26 Nov: "I changed the project and the dashboard values are the
   very same". Most of the home screen is the whole company's — invoices,
   stock and vendors belong to no project — so for a business that bills
   by invoice, switching projects changed nothing visible, while the
   heading named the project as if everything under it were its own.

   Now: a chosen project narrows its purchase orders, its vendor bills
   ("Owed to vendors" — a bill records its project), contracts and the
   charts; the whole-company tiles say "All projects"; and a line under the
   heading says which is which. With no project chosen, nothing is tagged.

   Builds its own throwaway company (dscope-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
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

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'dscope-%@example.test'`);
    const ids = rows.map(r => r.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Scope', email: `dscope-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Scope Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const pA = await api('POST', '/projects', { name: `Solar Site A ${stamp}`, clientName: 'Sunrise', type: 'solar' });
    const pB = await api('POST', '/projects', { name: `Tower B ${stamp}`, clientName: 'Grid Co', type: 'transmission' });
    const vend = await api('POST', '/vendors', { name: `Deccan Steels ${stamp}`, type: 'Supplier' });
    const cust = await api('POST', '/customers', { name: `Buyer ${stamp}`, state: 'Telangana' });
    await api('POST', '/po', { projectId: pA.id, vendorId: vend.id, itemName: 'Angle', quantity: 10, unitPrice: 100, items: [{ description: 'Angle', uom: 'kg', quantity: 10, unitPrice: 100 }] });
    await api('POST', '/po', { projectId: pA.id, vendorId: vend.id, itemName: 'Plate', quantity: 5, unitPrice: 200, items: [{ description: 'Plate', uom: 'kg', quantity: 5, unitPrice: 200 }] });
    await api('POST', '/grn-bills', { projectId: pA.id, vendorId: vend.id, billDate: today, gstRate: 18, items: [{ description: 'Angle', quantity: 10, rate: 100 }] });
    await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, items: [{ description: 'Frame', quantity: 1, rate: 10000 }] });
    ok(pA.id && pB.id, 'a company with two projects, purchases on one, and an invoice');

    section('What the server answers');
    const all = await api('GET', '/dashboard');
    const a = await api('GET', `/dashboard?projectId=${pA.id}`);
    const b = await api('GET', `/dashboard?projectId=${pB.id}`);
    ok(a.totalPOs === 2 && b.totalPOs === 0 && all.totalPOs === 2, `purchase orders follow the project (A ${a.totalPOs}, B ${b.totalPOs}, all ${all.totalPOs})`);
    ok(a.payables?.count === 1 && b.payables?.count === 0 && all.payables?.count === 1, `so do vendor bills owed (A ${a.payables?.count}, B ${b.payables?.count}, all ${all.payables?.count})`);
    ok(a.sales?.billed === b.sales?.billed && b.sales?.billed === all.sales?.billed && all.sales?.billed > 0, 'invoices are the whole company\'s whichever project is chosen');
    ok(a.scope?.project === pA.id && a.scope.companyWide.includes('sales') && all.scope?.project === null, 'and the answer says which figures are the whole company\'s');
    const other = await (await fetch(`${API}/dashboard?projectId=1`, { headers: H })).status;
    ok(other === 403 || other === 404, `another company's project is refused (${other})`);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(`${UI}/login`);
    const sign = (pid) => page.evaluate((t, u, p) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('maks_app_dialogs', '1'); localStorage.setItem('nexus_active_project', p); }, reg.token, reg.user, pid);
    const look = () => page.evaluate(() => ({
      title: document.querySelector('.dash-title')?.textContent.trim(),
      note: document.querySelector('[data-dash-scope]')?.textContent || '',
      tags: document.querySelectorAll('[data-dash-wide]').length,
      po: [...document.querySelectorAll('.dash-kpi')].find(k => /Purchase orders/.test(k.textContent))?.querySelector('.dash-kpi-value')?.textContent.trim(),
      owed: [...document.querySelectorAll('.dash-kpi')].find(k => /Owed to vendors/.test(k.textContent))?.querySelector('.dash-kpi-sub')?.textContent.trim(),
    }));
    const open = async (pid) => { await sign(pid); await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' }); await page.waitForSelector('.dash-kpi', { timeout: 30000 }); await sleep(1500); };

    section('All work');
    await open('all');
    let v = await look();
    ok(v.tags === 0 && !v.note, 'with no project chosen, nothing is tagged and there is no project note');
    section('Project A chosen');
    await open(String(pA.id));
    v = await look();
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    ok(/Solar Site A/.test(v.title || ''), `the heading names the project ("${v.title}")`);
    ok(/whole company/.test(v.note) && /invoices aren't raised against a project/.test(v.note), 'a line says which figures are the project\'s and which the whole company\'s');
    ok(v.tags === 6, `the six whole-company tiles say "All projects" (${v.tags})`);
    ok(v.po === '2' && /on this project/.test(v.owed || ''), `its purchase orders and vendor bills are its own (${v.po} POs; "${v.owed}")`);
    section('Project B chosen');
    await open(String(pB.id));
    v = await look();
    ok(v.po === '0' && /^0 unpaid bills on this project/.test(v.owed || ''), `switching projects changes them (${v.po} POs; "${v.owed}")`);

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ threw: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    console.log(`\n   removed ${await cleanup()} test account(s)`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
