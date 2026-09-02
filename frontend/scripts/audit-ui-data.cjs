#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   audit-ui-data — does each screen actually SHOW what it fetched?

   The smoke test proves no screen crashes, which is a lower bar than it
   sounds: a page that swallows a failed fetch and renders an empty table
   passes it, and looks broken to the person using it.

   The first version of this compared each page against a list endpoint I
   nominated by hand, without a projectId. Most screens here are
   project-scoped, so it flagged "1 row on screen, 11 in the API" as a bug
   when both numbers were right — they were answers to different questions.

   So it no longer guesses. It watches which list request the page actually
   makes, replays THAT exact URL, and compares. A page that asks for
   nothing is as interesting as a page that asks and then shows nothing.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

/* route, label, and the API PATH that screen's own list comes from.
   The query string is not written here — it is taken from the request the
   page actually makes, which is the whole point: hand-written URLs got the
   projectId wrong and produced a page of false alarms.

   The path is needed because several screens fetch a picker feed before
   their own list. The Vendor Supplies tab loads /vendors?limit=200 to fill
   a dropdown, and "first non-boilerplate GET" identified that as its list —
   then reported an empty supplies table as a contradiction against 22
   vendors. */
const ROUTES = [
  ['/customers', 'Customers', '/customers'],
  ['/sales-quotations', 'Quotations', '/sales-quotations'],
  ['/customer-orders', 'Customer orders', '/customer-orders'],
  ['/delivery-challans', 'Delivery challans', '/delivery-challans'],
  ['/sales-invoices', 'Sales invoices', '/sales-invoices'],
  ['/credit-debit-notes', 'Credit/debit notes', '/credit-debit-notes'],
  ['/vendors', 'Vendors', '/vendors'],
  ['/vendors?tab=supplies', 'Vendor supplies', '/vendor-items'],
  ['/indent', 'Indents', '/indent'],
  ['/quotations', 'Vendor quotes', '/quotations'],
  ['/purchase-orders', 'Purchase orders', '/po'],
  ['/grn', 'Goods received', '/grn'],
  ['/bills', 'Vendor bills', '/bills'],
  ['/payables', 'Payables', '/payables'],
  ['/inventory', 'Stock on hand', '/inventory'],
  ['/items', 'Items (products)', '/skus'],
  ['/items?tab=materials', 'Items (materials)', '/raw-materials'],
  ['/material-requirements', 'Material requirements', '/material-requirements'],
  ['/production', 'Production', '/production'],
  ['/projects', 'Projects', '/projects'],
  ['/workorders', 'Work orders', '/work-orders'],
  ['/milestones', 'Milestones', '/milestones'],
  ['/boq', 'BOQ', '/boq'],
  ['/mb', 'Measurement book', '/mb'],
  ['/expenses', 'Expenses', '/expenses'],
  ['/users', 'Team', '/users'],
  ['/activity', 'Activity log', '/activities'],
];

/* Requests every page makes that are not that page's list. */
const CHROME = /\/(auth\/me|notifications|projects|work-orders|setup\/readiness|company-profile|health)(\?|$)/;

/* Empty states in this product are written as sentences, not as the word
   "empty" — "Nothing outstanding", "Nothing is short", "Receive a
   dispatched Purchase Order above". A narrower pattern reported four
   well-written empty states as unexplained blanks. */
const EMPTY_WORDS = /no .{0,40}(yet|found|match|recorded|created|records)|nothing (here|yet|to show|outstanding|is short|to order)|add your first|create your first|is empty|get started|appear here (after|once|when)/i;

const findings = [];

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };

  /* Deliberately pick a project with real data. The default is "whichever
     sorts last", which on this database is an empty test project — every
     project-scoped screen then reads as blank for reasons that have nothing
     to do with the code. */
  const projects = await (await fetch(`${API}/projects`, { headers: auth })).json();
  const list = Array.isArray(projects) ? projects : (projects.items || []);
  let best = null, bestN = -1;
  for (const p of list) {
    const d = await (await fetch(`${API}/dashboard?projectId=${p.id}`, { headers: auth })).json().catch(() => ({}));
    const n = (d.totalPOs || 0) + (d.openIndents || 0) + (d.recentActivities || []).length;
    if (n > bestN) { bestN = n; best = p; }
  }
  console.log(`\n  active project: ${best?.name} (id ${best?.id})\n`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([t, pid]) => {
    localStorage.setItem('nexus_token', t);
    localStorage.setItem('nexus_active_project', pid);
  }, [token, String(best?.id)]);

  console.log('  screen                 rows   fetched   state');
  console.log('  ' + '─'.repeat(66));

  for (const [route, label, apiPath] of ROUTES) {
    let listUrl = null, listStatus = null;
    const onResp = (r) => {
      const u = r.url();
      if (!u.startsWith(API) || CHROME.test(u.replace(API, ''))) return;
      if (r.request().method() !== 'GET') return;
      // Only this screen's own list, not a dropdown feed it happens to load.
      const pathOnly = u.replace(API, '').split('?')[0];
      if (pathOnly !== apiPath) return;
      if (!listUrl) { listUrl = u; listStatus = r.status(); }
    };
    page.on('response', onResp);

    await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1400));
    page.off('response', onResp);

    const ui = await page.evaluate((SRC) => {
      const text = document.querySelector('#root')?.innerText || '';
      /* Not every list here is a <table>. Bills, milestones, stock and the
         activity log render cards and definition rows, so counting only
         `tbody tr` reported four working screens as blank. */
      const rows = document.querySelectorAll(
        'tbody tr, [role="row"], [class*="list-row"], [class*="ListRow"], [class*="row-card"], [data-row]'
      ).length;
      return {
        rows,
        emptyState: new RegExp(SRC, 'i').test(text),
        denied: /Not part of your role/i.test(text),
        spinning: /^\s*(loading|checking access)/im.test(text),
        /* "4 total", "1 Distinct Items", "28 total events" — the page's own
           count of what it is displaying. */
        stated: (text.match(/(\d[\d,]*)\s+(?:total|distinct items|records?|events?)/i) || [])[1] || null,
      };
    }, EMPTY_WORDS.source);

    /* Replay whatever the page asked for, so the comparison is like for like. */
    let served = null;
    if (listUrl) {
      try {
        const r = await fetch(listUrl, { headers: auth });
        const j = await r.json();
        served = Array.isArray(j) ? j.length
          : typeof j.total === 'number' ? j.total
          : Array.isArray(j.items) ? j.items.length : null;
      } catch { served = 'unreachable'; }
    }

    /* Only unambiguous contradictions are reported. The URL captured is the
       page's FIRST non-boilerplate GET, which is not always its list — some
       screens fetch a dropdown feed first — so "served > 0 but 0 rows" on
       its own produced false alarms. A page that explicitly says it is
       empty while its own request returned records cannot be explained
       away, and that is what gets flagged. */
    const shown = ui.rows > 0 || (ui.stated && Number(ui.stated.replace(/,/g, '')) > 0);

    let state, flag = null;
    if (ui.denied) { state = '🔴 denied to Administrator'; flag = 'RoleRoute refuses this screen — its resource is missing from the permission catalogue'; }
    else if (ui.spinning) { state = '⏳ still loading'; flag = 'stuck loading after the network went quiet'; }
    else if (listStatus >= 400) { state = `🔴 HTTP ${listStatus}`; flag = `its own list request returned ${listStatus}`; }
    else if (shown) state = `✅ shows ${ui.stated || ui.rows}`;
    else if (ui.emptyState && served > 0) {
      state = '🔴 says empty, but has data';
      flag = `the page says it is empty while ${listUrl.replace(API, '')} returns ${served} record(s)`;
    }
    else if (ui.emptyState) state = '○ empty (explained)';
    else if (!listUrl) state = '○ no list request';
    else { state = '🟠 empty, unexplained'; flag = 'nothing shown and nothing said about why'; }

    if (flag) findings.push({ route, label, flag });
    console.log(`  ${label.padEnd(22)}${String(ui.stated || ui.rows).padStart(5)}${String(served ?? '—').padStart(9)}   ${state}`);
    if (process.env.VERBOSE && listUrl) console.log(`  ${' '.repeat(22)}      ${listUrl.replace(API, '').slice(0, 44)}`);
  }

  await browser.close();
  console.log('\n' + '═'.repeat(68));
  if (!findings.length) console.log('\n  ✅ every screen shows what it fetched, or says why it is empty\n');
  else {
    console.log(`\n  ${findings.length} screen(s) worth looking at:\n`);
    findings.forEach((f, i) => console.log(`   ${i + 1}. ${f.label}  (${f.route})\n      ${f.flag}\n`));
  }
  process.exit(findings.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
