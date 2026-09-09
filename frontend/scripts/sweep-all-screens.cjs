#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Open every screen in the product and report what actually happens.

   The suites cover about twenty flows in depth. There are sixty-six
   routes. "All tests pass" and "everything works" are different claims,
   and the gap between them is where a broken screen sits unnoticed —
   which is exactly how the Indent and the work-order context screens
   stayed broken while the suite was green.

   So: sign in, visit every route, and record for each one
     · JavaScript errors thrown while it rendered
     · API calls that came back 4xx/5xx
     · whether anything actually rendered, or the page is blank
     · whether it is showing a crash/empty/loading-forever state

   Detail routes take an id, so real ids are fetched first — visiting
   /po/:id literally proves nothing.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Routes reached only when signed out, or that deliberately navigate
   away — visiting them mid-sweep just logs the session out. */
const SKIP = new Set(['/login', '/signup', '/accept-invite', '*', '/logout']);

(async () => {
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  if (!login.token) { console.error('login failed:', login); process.exit(1); }
  const auth = { Authorization: `Bearer ${login.token}` };

  /* Real ids for the :id routes. A detail screen that only ever gets a
     literal ":id" is not being tested at all. */
  const firstId = async (path, key = 'id') => {
    try {
      const b = await (await fetch(`${API}${path}`, { headers: auth })).json();
      const list = Array.isArray(b) ? b : (b.items || b.rows || []);
      return list.length ? list[0][key] : null;
    } catch { return null; }
  };
  const ids = {
    po: await firstId('/po?limit=1'),
    bill: await firstId('/bills?limit=1'),
    customer: await firstId('/customers?limit=1'),
    invoice: await firstId('/sales-invoices?limit=1'),
    squote: await firstId('/sales-quotations?limit=1'),
    challan: await firstId('/delivery-challans?limit=1'),
    note: await firstId('/credit-debit-notes?limit=1'),
    production: await firstId('/production-orders?limit=1'),
    vendor: await firstId('/vendors?limit=1'),
    co: await firstId('/customer-orders?limit=1'),
    grn: await firstId('/grn?limit=1'),
  };

  const ROUTES = [
    '/', '/dashboard', '/projects', '/vendors', '/customers', '/inventory',
    '/items', '/skus', '/raw-materials', '/vendor-supplies', '/_vendor-supplies',
    '/po', '/purchase-orders', '/grn', '/payables', '/expenses',
    '/quotations', '/sales-quotations', '/customer-orders', '/sales-invoices',
    '/delivery-challans', '/credit-debit-notes', '/material-requirements',
    '/workorders', '/milestones', '/production', '/boq', '/mb', '/indent',
    '/bills', '/reports', '/activity', '/users', '/company-profile',
    '/automation', '/configurator', '/configurator/modules', '/configurator/roles',
    '/import', '/flow', '/knowledge', '/how-it-works', '/platform', '/nexus',
    '/welcome', '/get-started', '/onboarding', '/beta-welcome', '/beta-onboarding',
    ids.po && `/po/${ids.po}`,
    ids.bill && `/bills/${ids.bill}`,
    ids.customer && `/customers/${ids.customer}`,
    ids.invoice && `/sales-invoices/${ids.invoice}`,
    ids.squote && `/sales-quotations/${ids.squote}`,
    ids.challan && `/delivery-challans/${ids.challan}`,
    ids.note && `/credit-debit-notes/${ids.note}`,
    ids.production && `/production/${ids.production}`,
    ids.vendor && `/vendors/${ids.vendor}/edit`,
    ids.co && `/customer-orders/${ids.co}/invoice`,
    ids.grn && `/grn/${ids.grn}/bill`,
    '/vendors/new',
  ].filter(Boolean).filter(r => !SKIP.has(r));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  let jsErrors = [], netErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().includes(new URL(API).port)) {
      netErrors.push(`${r.status()} ${r.url().replace(API, '')}`);
    }
  });

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), login.token);

  const results = [];
  for (const route of ROUTES) {
    jsErrors = []; netErrors = [];
    let nav = 'ok';
    try {
      await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 25000 });
    } catch (e) { nav = 'timeout'; }
    await sleep(1200);

    const view = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return {
        chars: t.trim().length,
        /* A screen still saying "Loading" after networkidle has settled is
           stuck, not slow — that is the shape the work-order context screen
           failed in. */
        stuck: /^\s*(Loading|Loading\b.*\.\.\.)\s*$/i.test(t.trim()) || /Loading context/i.test(t),
        crashed: /Something went wrong|Unexpected Application Error|TypeError|is not a function|Cannot read/i.test(t),
        denied: /Not part of your role|Not switched on/i.test(t),
        text: t.trim().slice(0, 70).replace(/\s+/g, ' '),
      };
    });

    results.push({
      route, nav, ...view,
      js: [...new Set(jsErrors)],
      net: [...new Set(netErrors)],
    });
  }
  await browser.close();

  /* ── report ─────────────────────────────────────────────── */
  const bad = results.filter(r =>
    r.nav !== 'ok' || r.crashed || r.stuck || r.js.length || r.net.length || r.chars < 40);
  const denied = results.filter(r => r.denied);
  const good = results.filter(r => !bad.includes(r));

  console.log(`\n  ${results.length} screens visited\n`);
  if (bad.length) {
    console.log(`  ── ${bad.length} with something wrong ──────────────────────\n`);
    for (const r of bad) {
      const flags = [
        r.nav !== 'ok' && r.nav,
        r.crashed && 'CRASHED',
        r.stuck && 'STUCK LOADING',
        r.chars < 40 && `blank (${r.chars} chars)`,
      ].filter(Boolean).join(', ');
      console.log(`   ❌ ${r.route}${flags ? '  — ' + flags : ''}`);
      if (r.chars >= 40 && !r.crashed) console.log(`        shows: "${r.text}"`);
      for (const e of r.js.slice(0, 2)) console.log(`        js:  ${e.slice(0, 100)}`);
      for (const e of r.net.slice(0, 4)) console.log(`        api: ${e.slice(0, 100)}`);
    }
    console.log('');
  }
  if (denied.length) {
    console.log(`  ── ${denied.length} deliberately gated (role or module) ──`);
    for (const r of denied) console.log(`   ·  ${r.route}`);
    console.log('');
  }
  console.log(`  ── ${good.length} clean ──`);
  console.log('   ' + good.map(r => r.route).join('  '));
  console.log(`\n  ${good.length} clean, ${bad.length} with problems\n`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
