#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   smoke-ui — actually load the app in a browser and look at it.

   Everything until now was tested through the API. `npm run build` proves
   the code COMPILES; the JSX and hook checkers are static greps. None of
   that renders a page, which is why the <Link2/> crash — a ReferenceError
   that killed the whole navigation on every screen — survived a green build
   and was found by grepping rather than by looking.

   This signs in, visits every route, and fails on:
     · any uncaught exception or React error boundary
     · any console error (a React warning about keys is noise; a
       ReferenceError is not, so they are separated)
     · any failed network request the page itself made
     · a page that renders nothing (white screen)

   Run:  node scripts/smoke-ui.cjs
   Env:  UI_BASE (default http://localhost:5173)
         API_BASE (default http://localhost:5099)
         UI_EMAIL / UI_PASSWORD
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL;
const PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

/* Every screen a signed-in user can reach. */
const ROUTES = [
  ['/dashboard', 'Dashboard'],
  ['/customers', 'Customers'],
  ['/sales-quotations', 'Quotations'],
  ['/customer-orders', 'Customer orders'],
  ['/delivery-challans', 'Delivery challans'],
  ['/sales-invoices', 'Sales invoices'],
  ['/credit-debit-notes', 'Credit/debit notes'],
  ['/vendors', 'Vendors (directory tab)'],
  ['/vendors?tab=supplies', 'Vendors (supplies tab)'],
  ['/indent', 'Indents'],
  ['/quotations', 'Vendor quotes'],
  ['/purchase-orders', 'Purchase orders'],
  ['/grn', 'Goods received'],
  ['/bills', 'Vendor bills'],
  ['/payables', 'Payables'],
  ['/inventory', 'Stock on hand'],
  ['/items', 'Items (products tab)'],
  ['/items?tab=materials', 'Items (materials tab)'],
  ['/material-requirements', 'Material requirements'],
  ['/production', 'Production'],
  ['/projects', 'Projects'],
  ['/workorders', 'Work orders'],
  ['/milestones', 'Milestones'],
  ['/boq', 'BOQ'],
  ['/mb', 'Measurement book'],
  ['/expenses', 'Expenses'],
  ['/reports', 'Reports'],
  ['/company-profile', 'Company profile'],
  ['/users', 'Team'],
  ['/configurator', 'Configurator'],
  ['/automation', 'Automation'],
  ['/knowledge', 'Knowledge base'],
  ['/activity', 'Activity log'],
];

const findings = [];
const finding = (sev, route, what, detail) => findings.push({ sev, route, what, detail });

/* React key warnings and similar are noise. A ReferenceError or a failed
   render is not. Separating them keeps the report worth reading. */
const IS_REAL_ERROR = (t) =>
  /ReferenceError|TypeError|is not defined|is not a function|Cannot read|Minified React error|Uncaught|Rendered more hooks/i.test(t);

const IGNORABLE = (t) =>
  /Download the React DevTools|was preloaded using link preload|Warning: .*key|source-?map|favicon/i.test(t);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let consoleErrors = [];
  let pageErrors = [];
  let failedRequests = [];

  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (IGNORABLE(t)) return;
    consoleErrors.push({ type: m.type(), text: t.slice(0, 300) });
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (/favicon|\.map$/.test(u)) return;
    failedRequests.push(`${r.method()} ${u.replace(API, '')} — ${r.failure()?.errorText}`);
  });
  page.on('response', async (r) => {
    if (!r.url().startsWith(API)) return;
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`);
  });

  /* ── sign in ── */
  console.log(`\n━━ signing in at ${UI} ━━\n`);
  await page.goto(`${UI}/login`, { waitUntil: 'networkidle2', timeout: 45000 });

  // Put the token in directly — this smoke test is about the screens, and a
  // login-form change should not make every route report as broken.
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  if (!token) { console.error('no token from the API'); process.exit(1); }

  await page.evaluate((t) => {
    localStorage.setItem('nexus_token', t);
  }, token);

  /* ── walk every route ── */
  console.log('━━ visiting every screen ━━\n');
  let ok = 0;

  for (const [route, label] of ROUTES) {
    consoleErrors = []; pageErrors = []; failedRequests = [];

    try {
      await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch (e) {
      finding('HIGH', route, 'page did not load', e.message.slice(0, 140));
      console.log(`  💥 ${label.padEnd(30)} ${route}`);
      continue;
    }

    await new Promise(r => setTimeout(r, 600));   // let effects settle

    /* Did anything actually render? A white screen is the signature of a
       crash React caught and swallowed. */
    const visible = await page.evaluate(() => {
      const root = document.querySelector('#root') || document.body;
      return (root.innerText || '').trim().length;
    });

    const hardErrors = [...pageErrors, ...consoleErrors.filter(c => IS_REAL_ERROR(c.text)).map(c => c.text)];
    const softErrors = consoleErrors.filter(c => !IS_REAL_ERROR(c.text));

    let mark = '✅';
    if (hardErrors.length) {
      mark = '💥';
      finding('HIGH', route, 'JavaScript error on the page', hardErrors[0]);
    } else if (visible < 40) {
      mark = '⬜';
      finding('HIGH', route, 'rendered almost nothing', `${visible} characters of visible text — likely a swallowed crash`);
    } else if (failedRequests.length) {
      mark = '🟠';
      finding('MED', route, `${failedRequests.length} failed request(s)`, failedRequests.slice(0, 3).join(' · '));
    } else { ok++; }

    const extra = hardErrors.length ? hardErrors[0].slice(0, 70)
      : failedRequests.length ? failedRequests[0].slice(0, 70)
      : softErrors.length ? `${softErrors.length} warning(s)` : `${visible} chars`;
    console.log(`  ${mark} ${label.padEnd(30)} ${String(route).padEnd(28)} ${extra}`);
  }

  /* ── does the new navigation actually work? ── */
  console.log('\n━━ navigation ━━\n');
  await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));

  const nav = await page.evaluate(() => ({
    rail: document.querySelectorAll('.nav-rail-item').length,
    railLabels: [...document.querySelectorAll('.nav-rail-item span')].map(s => s.textContent),
    panel: document.querySelectorAll('.nav-panel-item').length,
    groups: [...document.querySelectorAll('.nav-panel-group')].map(g => g.textContent),
    badges: [...document.querySelectorAll('.nav-badge')].map(b => b.textContent),
  }));
  console.log(`  rail modules : ${nav.rail}  [${nav.railLabels.join(', ')}]`);
  console.log(`  panel items  : ${nav.panel}`);
  if (nav.rail === 0) finding('HIGH', '/dashboard', 'the module rail rendered nothing', 'AppNav produced no items');

  /* Check the setup banner HERE, while we are still on the dashboard. The
     click-through below navigates to /vendors, and checking afterwards
     reported "banner missing" for a banner that was rendering fine — a bug
     in this file, not in the app. */
  const banner = await page.evaluate(() =>
    document.body.innerText.includes('before the system can tell you'));
  console.log(`  setup banner : ${banner ? '✅ visible' : '❌ not rendered'}`);
  if (!banner) finding('MED', '/dashboard', 'setup readiness banner not visible', 'expected, since the data spine is incomplete');

  // Click through to Purchases and check the panel changes.
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-rail-item')].find(x => /Purchases/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  if (clicked) {
    await new Promise(r => setTimeout(r, 900));
    const after = await page.evaluate(() => ({
      url: location.pathname,
      groups: [...document.querySelectorAll('.nav-panel-group')].map(g => g.textContent),
      items: [...document.querySelectorAll('.nav-panel-label')].map(g => g.textContent),
      badges: [...document.querySelectorAll('.nav-badge')].map(b => b.textContent),
    }));
    console.log(`  clicked Purchases -> ${after.url}`);
    console.log(`  groups shown : ${after.groups.join(' / ') || '(none)'}`);
    console.log(`  items shown  : ${after.items.join(', ') || '(none)'}`);
    console.log(`  badges       : ${after.badges.join(', ') || '(none)'}`);
    if (!after.groups.length) finding('MED', '/vendors', 'panel groups did not render', 'expected Source / Buy & receive / Pay');
  } else finding('HIGH', '/dashboard', 'could not click the Purchases module', 'rail button not found');

  /* ── does search actually filter? ── */
  console.log('\n━━ search on a list page ━━\n');
  await page.goto(`${UI}/vendors`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  const before = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  const typed = await page.evaluate(() => {
    const i = document.querySelector('input[aria-label*="Search"], input[placeholder*="Search"]');
    if (!i) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, 'zzzz-no-such-vendor');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  if (typed) {
    await new Promise(r => setTimeout(r, 1500));
    const after = await page.evaluate(() => ({
      rows: document.querySelectorAll('tbody tr').length,
      text: document.body.innerText.includes('No vendors match'),
    }));
    console.log(`  rows before: ${before}   after searching for nonsense: ${after.rows}`);
    console.log(`  "no match" empty state: ${after.text ? '✅ shown' : '❌ missing'}`);
    if (after.rows >= before && before > 0) finding('HIGH', '/vendors', 'search did not filter', `${before} rows before, ${after.rows} after`);
    if (!after.text) finding('MED', '/vendors', 'no-match empty state did not appear', 'user sees an empty table with no explanation');
  } else finding('HIGH', '/vendors', 'no search box found', 'the toolbar did not render');

  await browser.close();

  /* ── report ── */
  console.log(`\n\n══════════ UI SMOKE TEST ══════════\n`);
  console.log(`  ${ok} of ${ROUTES.length} screens clean\n`);
  if (!findings.length) console.log('  ✅ nothing broken\n');
  for (const sev of ['HIGH', 'MED']) {
    const list = findings.filter(f => f.sev === sev);
    if (!list.length) continue;
    console.log(`  ${sev === 'HIGH' ? '🔴' : '🟡'} ${sev}\n`);
    list.forEach((f, i) => {
      console.log(`     ${i + 1}. ${f.route} — ${f.what}`);
      console.log(`        ${f.detail}\n`);
    });
  }
  process.exit(findings.filter(f => f.sev === 'HIGH').length ? 1 : 0);
})().catch(e => { console.error('\n💥 smoke test threw:', e.message); process.exit(1); });
