#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   audit-deep — every menu item, exercised rather than glanced at.

   smoke-ui proves no screen throws. audit-ui-data proves a screen shows
   what it fetched. Neither answers the question actually being asked:
   "is this feature finished, or is it a page that renders?"

   So for each of the 38 nav destinations this records:
     · JavaScript errors
     · its own requests that came back 4xx/5xx
     · whether it is still saying "Loading" after the network went quiet
     · whether it renders 0 / empty while its data is still in flight —
       a dashboard that says "0 vendors" for eight seconds is not loading,
       it is lying
     · whether there is any way to CREATE the thing the page is about
     · whether the primary action opens something with fields in it

   The last two are the difference between a list and a feature. Stock on
   hand rendered 102 cards for months with no way to add a row.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

/* route, label, and whether it is a list you should be able to add to.
   `null` for screens that are reports or settings — no create expected. */
const ROUTES = [
  ['/dashboard',              'Dashboard',            null],
  ['/knowledge',              'Knowledge base',       null],
  ['/activity',               'Activity',             null],
  ['/customers',              'Customers',            'customer'],
  ['/sales-quotations',       'Quotations',           'quotation'],
  ['/customer-orders',        'Orders',               'order'],
  ['/delivery-challans',      'Delivery challans',    'challan'],
  ['/sales-invoices',         'Invoices',             'invoice'],
  ['/credit-debit-notes',     'Credit & debit notes', 'note'],
  ['/vendors',                'Vendors',              'vendor'],
  ['/indent',                 'Indents',              'indent'],
  ['/quotations',             'Vendor quotes',        'quote'],
  ['/purchase-orders',        'Purchase orders',      'purchase order'],
  ['/grn',                    'Goods received',       'receipt'],
  ['/bills',                  'Vendor bills',         'bill'],
  ['/payables',               'Payables',             null],
  ['/inventory',              'Stock on hand',        'stock'],
  ['/items',                  'Items',                'item'],
  ['/material-requirements',  'Requirements',         null],
  ['/production',             'Production orders',    'production order'],
  ['/workorders',             'Work orders',          'work order'],
  ['/projects',               'Projects',             'project'],
  ['/milestones',             'Milestones',           'milestone'],
  ['/boq',                    'Bill of quantities',   'boq'],
  ['/mb',                     'Measurement book',     'measurement'],
  ['/expenses',               'Expenses',             'expense'],
  ['/reports',                'Reports',              null],
  ['/company-profile',        'Company profile',      null],
  ['/automation',             'Automation',           null],
  ['/users',                  'Team',                 'user'],
  ['/import',                 'Import data',          null],
  ['/flow',                   'Process flow',         null],
  ['/configurator',           'Configurator',         null],
  ['/configurator/people',    'Users & roles',        'person'],
  ['/configurator/roles',     'Roles & permissions',  null],
  ['/configurator/categories','Categories',           'category'],
  ['/configurator/history',   'Change history',       null],
];

/* Requests every page makes that are not its own. */
const CHROME = /\/(auth\/me|notifications|projects|company-profile|setup\/readiness|health|supply-categories)(\?|$)/;

const CREATE_RE = /^(\+\s*)?(new|add|create|record|raise|issue|book|register)\b/i;

const findings = [];
const add = (label, route, severity, what) => findings.push({ label, route, severity, what });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);

  console.log(`\n  screen                    ms   errs  bad  create  state`);
  console.log('  ' + '─'.repeat(72));

  for (const [route, label, noun] of ROUTES) {
    const jsErrors = [], bad = [];
    const onErr = e => jsErrors.push(e.message);
    const onResp = r => {
      const u = r.url();
      if (!u.startsWith(API)) return;
      const p = u.replace(API, '');
      if (CHROME.test(p)) return;
      if (r.status() >= 400) bad.push(`${r.status()} ${p.split('?')[0]}`);
    };
    page.on('pageerror', onErr);
    page.on('response', onResp);

    const t0 = Date.now();
    try {
      await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch { add(label, route, 'BROKEN', 'the page never finished loading (45s timeout)'); }
    const ms = Date.now() - t0;
    await sleep(1200);

    const ui = await page.evaluate((createSrc) => {
      const text = document.querySelector('#root')?.innerText || '';
      const buttons = [...document.querySelectorAll('button, a[href]')]
        .map(b => (b.innerText || '').trim()).filter(Boolean);
      return {
        text: text.slice(0, 4000),
        loading: /(^|\n)\s*(loading|checking access|please wait)/i.test(text),
        denied: /not part of your role|don't have permission|doesn't cover/i.test(text),
        blank: text.replace(/\s/g, '').length < 120,
        /* 'i' matters. Passing only .source dropped the flag, so "New
           Quotation" failed against lowercase `new` and 24 screens with a
           perfectly good create button were reported as having none. */
        createBtn: buttons.find(b => new RegExp(createSrc, 'i').test(b)) || null,
        buttons: buttons.slice(0, 40),
        /* A KPI reading 0 while a request is still in flight. */
        zeros: (text.match(/\n0\n/g) || []).length,
      };
    }, CREATE_RE.source);

    page.off('pageerror', onErr);
    page.off('response', onResp);

    if (jsErrors.length) add(label, route, 'BROKEN', `JavaScript error: ${jsErrors[0].slice(0, 150)}`);
    for (const b of [...new Set(bad)]) add(label, route, 'BROKEN', `its own request failed — ${b}`);
    if (ui.denied) add(label, route, 'BROKEN', 'the Administrator is refused this screen');
    if (ui.loading) add(label, route, 'BROKEN', 'still says "Loading" after the network went quiet');
    if (ui.blank) add(label, route, 'BROKEN', 'renders essentially nothing');
    if (ms > 5000) add(label, route, 'SLOW', `${(ms / 1000).toFixed(1)}s to load`);
    if (noun && !ui.createBtn) add(label, route, 'GAP', `no way to create a ${noun} from this screen`);

    const state = jsErrors.length ? '🔴 js error'
      : bad.length ? `🔴 ${bad[0]}`
      : ui.denied ? '🔴 denied'
      : ui.loading ? '🔴 stuck loading'
      : ui.blank ? '🔴 blank'
      : noun && !ui.createBtn ? '🟠 no create'
      : ms > 5000 ? '🟠 slow'
      : '✅';

    console.log(`  ${label.padEnd(24)}${String(ms).padStart(5)}${String(jsErrors.length).padStart(6)}` +
      `${String(bad.length).padStart(5)}${(ui.createBtn ? 'yes' : noun ? 'NO' : '—').padStart(8)}  ${state}`);
  }

  await browser.close();

  console.log('\n' + '═'.repeat(74));
  const bySev = s => findings.filter(f => f.severity === s);
  for (const sev of ['BROKEN', 'GAP', 'SLOW']) {
    const list = bySev(sev);
    if (!list.length) continue;
    console.log(`\n  ${sev} — ${list.length}\n`);
    list.forEach((f, i) => console.log(`   ${String(i + 1).padStart(2)}. ${f.label} (${f.route})\n       ${f.what}`));
  }
  if (!findings.length) console.log('\n  ✅ nothing found\n');
  else console.log(`\n  ${findings.length} finding(s)\n`);
  process.exit(0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
