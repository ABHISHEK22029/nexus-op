#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Open every screen in the product, follow every link, and report what
   actually happens.

   The suites cover the flows in depth. "All tests pass" and "everything
   works" are different claims, and the gap between them is where a broken
   screen or a dead link sits unnoticed.

   So, for every route the router knows about (read from App.jsx, so a new
   screen cannot be forgotten by this list):
     · JavaScript errors thrown while it rendered
     · API calls that came back 4xx/5xx
     · whether anything rendered, or the page is blank / stuck / crashed
     · every internal link on it — each must land on a real screen, not
       the 404 page
   and, separately, that every entry in the navigation panel is a route.

   Detail routes take an id, so one of everything is created first in a
   throwaway organisation — visiting /po/:id literally proves nothing.
   Signed-out pages (the website) are swept signed out, links included.

   UI_EMAIL / UI_PASSWORD sweep an existing account instead (read-only:
   nothing is created in it). Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const B = path.join(__dirname, '..', '..', 'backend');
require(path.join(B, 'node_modules', 'dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules', 'pg'));
const { purgeOrg } = require(path.join(B, 'scripts', 'lib', 'purgeOrg'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = Date.now().toString(36);

/* Routes reached only when signed out, or that navigate away on purpose. */
const SKIP = new Set(['/login', '/signup', '/accept-invite', '*', '/logout']);
const PUBLIC = ['/', '/platform', '/how-it-works', '/get-started', '/nexus', '/login', '/signup'];

/* API answers that are correct, not failures: an account with no logo
   uploaded gets a 404 for it, and the page draws the fallback. */
const EXPECTED_API = [/\/company-profile\/logo\b.*\b404\b|^404 \/company-profile\/logo/];

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'sweep-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    await purgeOrg(c, ids);
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

/* Every <Route path> in App.jsx, and every path in the navigation panel. */
const APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const ROUTE_PATHS = [...APP.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]);
const NAV = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'navigation.js'), 'utf8');
const NAV_PATHS = [...new Set([...NAV.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1]))];
const routeRe = ROUTE_PATHS.filter(p => p !== '*').map(p => new RegExp('^' + p.replace(/:[A-Za-z]+/g, '[^/]+') + '/?$'));
const isRoute = (p) => routeRe.some(re => re.test(p));

async function seed(H) {
  const J = { ...H, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => {
    try { const r = await fetch(`${API}${u}`, { method: m, headers: J, body: b ? JSON.stringify(b) : undefined }); return await r.json(); } catch { return {}; }
  };
  await api('PUT', '/company-profile', { name: `Sweep Fabricators ${stamp}`, address: 'Hyderabad', gstin: '36AAMCK2569F1Z9', stateCode: '36', bank_name: 'HDFC', bank_account_no: '1', bank_ifsc: 'HDFC0000001' });
  const lines = [{ description: 'SS304 Mounting Bracket', hsn: '7326', uom: 'Nos', quantity: 12, rate: 2320 }];
  const cust = await api('POST', '/customers', { name: `Sweep Customer ${stamp}`, state: 'Telangana', billing_address: 'Plot 1, Hyderabad' });
  const vendor = await api('POST', '/vendors', { name: `Sweep Vendor ${stamp}`, type: 'Supplier' });
  const proj = await api('POST', '/projects', { name: `Sweep Project ${stamp}`, clientName: 'HMRL', type: 'Infrastructure' });
  const co = await api('POST', '/customer-orders', { customerId: cust.id, items: [{ description: 'SS304 Mounting Bracket', quantity: 12, unit: 'nos', rate: 2320 }] });
  await api('POST', '/sales-quotations', { customerId: cust.id, items: lines });
  await api('POST', '/sales-invoices', { customerId: cust.id, customerOrderId: co.id, items: lines });
  await api('POST', '/delivery-challans', { customerId: cust.id, items: lines });
  await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, gstRate: 18, items: lines });
  const po = await api('POST', '/po', { projectId: proj.id, vendorId: vendor.id, itemName: 'SS304 sheet', quantity: 10, unitPrice: 260 });
  if (po.id) await api('POST', `/po/${po.id}/items`, [{ sno: 1, description: 'SS304 sheet', uom: 'Kg', quantity: 10, unitPrice: 260 }]);
  /* Goods are received only against a PO that has been approved and sent. */
  if (po.id) {
    await api('PATCH', `/po/${po.id}/approve`);
    await api('PATCH', `/po/${po.id}/dispatch`);
    await api('POST', '/grn', { projectId: proj.id, poId: po.id, receivedQuantity: 10, vehicleNumber: 'TS09UB4471' });
  }
  await api('POST', '/production', { productName: 'SS304 Mounting Bracket', plannedQty: 12, outputUom: 'nos' });
  await api('POST', '/grn-bills', { vendorId: vendor.id, items: lines, gstRate: 18 });
  const fd = new FormData();
  fd.append('file', new Blob(['Description,Qty,Unit,Rate\nSS304 sheet,10,kg,260\n']), 'sweep.csv');
  await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: H, body: fd }).catch(() => {});
}

(async () => {
  await cleanup();
  let token;
  if (process.env.UI_EMAIL && process.env.UI_PASSWORD) {
    token = (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.UI_EMAIL, password: process.env.UI_PASSWORD }) })).json()).token;
  } else {
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sweep', email: `sweep-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    token = reg.token;
    await seed({ Authorization: `Bearer ${token}` });
  }
  if (!token) { console.error('could not sign in'); process.exit(1); }
  const auth = { Authorization: `Bearer ${token}` };

  /* Real ids for the :id routes. */
  const firstId = async (p, key = 'id') => {
    try {
      const b = await (await fetch(`${API}${p}`, { headers: auth })).json();
      const list = Array.isArray(b) ? b : (b.items || b.rows || b.articles || []);
      return list.length ? list[0][key] : null;
    } catch { return null; }
  };
  const ids = {
    po: await firstId('/po?limit=1'), bill: await firstId('/bills?limit=1'), customer: await firstId('/customers?limit=1'),
    invoice: await firstId('/sales-invoices?limit=1'), squote: await firstId('/sales-quotations?limit=1'),
    challan: await firstId('/delivery-challans?limit=1'), note: await firstId('/credit-debit-notes?limit=1'),
    production: await firstId('/production?limit=1'), vendor: await firstId('/vendors?limit=1'),
    co: await firstId('/customer-orders?limit=1'), grn: await firstId('/grn?limit=1'), grnBill: await firstId('/grn-bills?limit=1'),
    kb: await firstId('/kb/articles', 'slug'),
  };
  const FILL = {
    '/po/:id': ids.po, '/bills/:id': ids.bill, '/customers/:id': ids.customer,
    '/sales-invoices/:id': ids.invoice, '/sales-invoices/:id/edit': ids.invoice, '/sales-quotations/:id': ids.squote,
    '/delivery-challans/:id': ids.challan, '/credit-debit-notes/:id': ids.note, '/production/:id': ids.production,
    '/vendors/:id/edit': ids.vendor, '/customer-orders/:coId/invoice': ids.co, '/grn/:grnId/bill': ids.grn,
    '/grn-bills/:id': ids.grnBill, '/knowledge/:slug': ids.kb, '/configurator/:section': 'modules',
  };
  const notVisited = [];
  const ROUTES = ROUTE_PATHS.filter(p => !SKIP.has(p) && !p.startsWith('/c/')).map(p => {
    if (!p.includes(':')) return p;
    const v = FILL[p];
    if (v == null) { notVisited.push(p); return null; }
    return p.replace(/:[A-Za-z]+/, v);
  }).filter(Boolean);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  let jsErrors = [], netErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(API)) netErrors.push(`${r.status()} ${r.url().replace(API, '')}`);
  });
  page.on('dialog', d => d.dismiss());

  const links = new Map();   // link → the page it was found on
  const visit = async (route) => {
    jsErrors = []; netErrors = [];
    let nav = 'ok';
    try { await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 25000 }); } catch { nav = 'timeout'; }
    await sleep(900);
    const view = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return {
        chars: t.trim().length,
        stuck: /^\s*(Loading|Loading\b.*\.\.\.)\s*$/i.test(t.trim()) || /Loading context/i.test(t),
        crashed: /Something went wrong|Unexpected Application Error|TypeError|is not a function|Cannot read/i.test(t),
        notFound: /Page not found/.test(t) && /No route matches/.test(t),
        denied: /Not part of your role|Not switched on/i.test(t),
        landed: location.pathname,
        text: t.trim().slice(0, 70).replace(/\s+/g, ' '),
        links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
          .filter(h => h && h.startsWith('/') && !h.startsWith('//')).map(h => h.split('#')[0].split('?')[0]).filter(Boolean),
      };
    });
    for (const l of view.links) if (!links.has(l)) links.set(l, route);
    return { route, nav, ...view, js: [...new Set(jsErrors)],
      net: [...new Set(netErrors)].filter(e => !EXPECTED_API.some(re => re.test(e))) };
  };

  /* ── signed out: the website ── */
  const publicResults = [];
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  for (const r of PUBLIC) publicResults.push(await visit(r));
  const publicLinks = new Map(links); links.clear();

  /* ── signed in: the product ── */
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
  const results = [];
  for (const r of ROUTES) results.push(await visit(r));

  /* ── every link found, followed ── */
  const visited = new Set(results.map(r => r.route));
  const deadLinks = [];
  for (const [l, from] of links) {
    if (visited.has(l)) { const r = results.find(x => x.route === l); if (r?.notFound) deadLinks.push(`${l} (on ${from})`); continue; }
    if (!isRoute(l)) { deadLinks.push(`${l} (on ${from}) — no route`); continue; }
    const r = await visit(l);
    if (r.notFound) deadLinks.push(`${l} (on ${from})`);
  }
  await page.evaluate(() => localStorage.clear());
  for (const [l, from] of publicLinks) {
    if (!isRoute(l)) deadLinks.push(`${l} (on the website, ${from}) — no route`);
  }
  await browser.close();
  const removed = process.env.UI_EMAIL ? 0 : await cleanup();

  /* ── report ── */
  const navDead = NAV_PATHS.filter(p => !isRoute(p));
  const all = [...publicResults, ...results];
  const bad = all.filter(r => r.nav !== 'ok' || r.crashed || r.stuck || r.notFound || r.js.length || r.net.length || r.chars < 40);
  const denied = results.filter(r => r.denied);
  console.log(`\n  ${publicResults.length} website pages signed out, ${results.length} screens signed in, ${links.size + publicLinks.size} distinct links followed\n`);
  if (bad.length) {
    console.log(`  ── ${bad.length} with something wrong ──`);
    for (const r of bad) {
      const flags = [r.nav !== 'ok' && r.nav, r.crashed && 'CRASHED', r.stuck && 'STUCK LOADING', r.notFound && '404',
        r.chars < 40 && `blank (${r.chars} chars)`].filter(Boolean).join(', ');
      console.log(`   ❌ ${r.route}${flags ? '  — ' + flags : ''}`);
      if (r.chars >= 40 && !r.crashed && !r.notFound) console.log(`        shows: "${r.text}"`);
      for (const e of r.js.slice(0, 2)) console.log(`        js:  ${e.slice(0, 110)}`);
      for (const e of r.net.slice(0, 4)) console.log(`        api: ${e.slice(0, 110)}`);
    }
    console.log('');
  }
  console.log(deadLinks.length ? `  ❌ ${deadLinks.length} dead link(s):\n     ${deadLinks.join('\n     ')}` : '  ✅ no dead links');
  console.log(navDead.length ? `  ❌ navigation entries with no route: ${navDead.join(', ')}` : `  ✅ all ${NAV_PATHS.length} navigation entries are real routes`);
  if (notVisited.length) console.log(`  ·  not visited (no record of that kind to open): ${notVisited.join(', ')}`);
  if (denied.length) console.log(`  ·  deliberately gated: ${denied.map(r => r.route).join(', ')}`);
  console.log(`\n  ${all.length - bad.length} clean, ${bad.length} with problems${removed ? ` · sweep account removed` : ''}\n`);
  process.exit(bad.length || deadLinks.length || navDead.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
