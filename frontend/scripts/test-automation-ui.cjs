/* ══════════════════════════════════════════════════════════════════════
   The Automation page, clicked through.

     · the PO threshold: a bad value is refused with a reason, a good one is
       saved, said back truthfully and still there after a reload
     · the reminders switch persists
     · a new schedule: the form starts on today, shows the server's reason
       when something is missing, warns about a date in the past, resets
       after saving
     · Run now names what it made and when; a second press says what is next
     · the history opens and its links land on the document
     · pause, resume and delete say what they did
     · dates read "8 Oct 2026"; nothing overflows the page at 360px
     · a Viewer sees the schedules but is offered no button that would fail

   Builds its own throwaway company (automui-*@example.test) through the API,
   then removes it. Needs the backend (SCHEDULER=off) and vite running.
   Refuses to run against a deployed host.

     API_BASE=http://localhost:5098 UI_BASE=http://localhost:5174 node scripts/test-automation-ui.cjs
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
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sql = async (q, p) => { const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect(); try { return (await c.query(q, p)).rows; } finally { await c.end(); } };
const DAY = /^\d{1,2} [A-Z][a-z]{2,3} \d{4}$/;

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'automui-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    await c.query('DELETE FROM recurring_runs WHERE profile_id IN (SELECT id FROM recurring_profiles WHERE owner_id = ANY($1))', [ids]).catch(() => {});
    await c.query('DELETE FROM recurring_profiles WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM automation_settings WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'automui-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'automui-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Automation UI', email: `automui-${stamp}@example.test`, password: PASS }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  const org = reg.user.orgId ?? reg.user.id;
  let browser;
  try {
    const [{ today }] = await sql('SELECT CURRENT_DATE::text AS today');
    const back = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    await api('PUT', '/company-profile', { name: 'Automation UI Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });
    const cust = await api('POST', '/customers', { name: `UI Buyer ${stamp}`, state: 'Telangana', gstin: '36ABCDE1234F1Z5', billing_address: 'Hyderabad' });
    const viewerEmail = `automui-view-${stamp}@example.test`;
    await api('POST', '/admin/users', { name: 'Viewer person', email: viewerEmail, password: PASS, role: 'Viewer' });
    const viewer = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: viewerEmail, password: PASS }) })).json();

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    const signIn = async (token) => {
      await page.goto(`${UI}/login`);
      await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, token);
    };
    const waitFor = (fn, ms = 8000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const waitText = (re, ms = 8000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const clickText = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    /* React owns these inputs: set through the native setter, then tell it. */
    const setField = (label, value) => page.evaluate((l, v) => {
      const lab = [...document.querySelectorAll('form label')].find(x => x.textContent.trim().startsWith(l));
      const el = lab?.parentElement.querySelector('input, select');
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    }, label, value);
    const fieldValue = (label) => page.evaluate((l) => {
      const lab = [...document.querySelectorAll('form label')].find(x => x.textContent.trim().startsWith(l));
      return lab?.parentElement.querySelector('input, select')?.value ?? null;
    }, label);
    const setThreshold = (v) => page.evaluate((val) => {
      const el = document.querySelector('#po-threshold');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    const rowText = (title) => page.evaluate((t) => [...document.querySelectorAll('tbody tr')].find(r => r.cells[0]?.textContent.startsWith(t))?.innerText || '', title);
    const toastGone = () => waitFor(() => !document.querySelector('[style*="z-index: 99999"] > div'), 9000);

    await signIn(reg.token);
    await page.goto(`${UI}/automation`, { waitUntil: 'networkidle2' });

    console.log('\n  ── an empty page');
    ok(await waitText(/Purchase Order approval/), 'the page opens');
    ok(await waitText(/No schedules yet/), 'with no schedules it says so, and how to add one');

    console.log('\n  ── the PO threshold');
    await setThreshold('-5');
    await clickText('button', /^\s*Save\s*$/);
    ok(await waitText(/must be a number, 0 or more/), 'a negative threshold is refused, saying why');
    await setThreshold('50000');
    await clickText('button', /^\s*Save\s*$/);
    ok(await waitText(/Saved — POs over ₹50,000 now need sign-off/), 'a good one is saved, and said back');
    let [st] = await sql('SELECT po_approval_threshold, reminders_enabled FROM automation_settings WHERE owner_id = $1', [org]);
    ok(Number(st?.po_approval_threshold) === 50000, `it is in the database (${st?.po_approval_threshold})`);
    await page.reload({ waitUntil: 'networkidle2' });
    await waitFor(() => document.querySelector('#po-threshold') && !document.querySelector('#po-threshold').disabled);
    ok(await page.$eval('#po-threshold', el => el.value) === '50000' && await waitText(/POs over ₹50,000 will need sign-off/), 'and still there after a reload');

    console.log('\n  ── reminders');
    await page.click('button[role="switch"]');
    ok(await waitText(/Reminders switched off/), 'switching off says so');
    [st] = await sql('SELECT reminders_enabled FROM automation_settings WHERE owner_id = $1', [org]);
    await page.reload({ waitUntil: 'networkidle2' });
    await waitFor(() => !document.querySelector('button[role="switch"]').disabled);
    ok(st.reminders_enabled === false && await page.$eval('button[role="switch"]', el => el.getAttribute('aria-checked')) === 'false',
      'it is saved, and still off after a reload');
    await page.click('button[role="switch"]');
    ok(await waitText(/Reminders switched on/), 'and back on');

    console.log('\n  ── a new schedule');
    await clickText('button', /New schedule/);
    await waitFor(() => !!document.querySelector('form'));
    ok(await fieldValue('First run date') === new Date().toLocaleDateString('en-CA'), `the first run starts on today (${await fieldValue('First run date')})`);
    await clickText('form button[type="submit"]', /Create schedule/);
    ok(await waitText(/Give the schedule a title/), "with no title, the server's reason is shown");
    ok(!!(await page.$('form')), 'and the form stays open with what was typed');
    const start = back(62).slice(0, 8) + '31';        // the 31st, in the past
    const startOk = !Number.isNaN(new Date(`${start}T00:00:00Z`).getTime()) && new Date(`${start}T00:00:00Z`).toISOString().slice(0, 10) === start;
    const firstRun = startOk ? start : back(40);
    await setField('Title', 'UI Rent');
    await setField('Amount', '12000');
    await setField('Frequency', 'monthly');
    await setField('First run date', firstRun);
    await setField('Category', 'Rent');
    ok(await waitText(/This is in the past/), 'a date in the past is explained before saving');
    if (startOk) ok(await waitText(/Runs on the last day of every month/), 'and a start on the 31st says it stays on the month end');
    await clickText('form button[type="submit"]', /Create schedule/);
    ok(await waitText(/Schedule “UI Rent” created — first expense on/), 'creating says what and when');
    ok(await waitFor(() => !document.querySelector('form')), 'the form closes');
    await waitFor(() => [...document.querySelectorAll('tbody tr')].some(r => r.cells[0]?.textContent.startsWith('UI Rent')));
    const rent = await rowText('UI Rent');
    ok(/Expense/.test(rent) && /₹12,000/.test(rent) && /Monthly/.test(rent) && /0×/.test(rent), `and the table shows it (${rent.replace(/\s+/g, ' ')})`);
    await clickText('button', /New schedule/);
    await waitFor(() => !!document.querySelector('form'));
    ok(await fieldValue('Title') === '' && await fieldValue('Amount') === '', 'opened again, the form is empty');
    await clickText('form button', /Invoice we bill/);
    await waitFor(() => [...document.querySelectorAll('form label')].some(l => /Customer/.test(l.textContent)));
    await setField('Title', 'UI Retainer');
    await setField('Customer', String(cust.id));
    await setField('Amount', '5000');
    await setField('First run date', today);
    await clickText('form button[type="submit"]', /Create schedule/);
    ok(await waitText(/Schedule “UI Retainer” created — first invoice on/), 'an invoice schedule too');
    await toastGone();

    console.log('\n  ── Run now');
    await clickText('button', /Run now/);
    ok(await waitText(/Created .*\d+ expenses for “UI Rent” \(\d{1,2} [A-Z][a-z]+ \d{4} – \d{1,2} [A-Z][a-z]+ \d{4}\)/, 15000) && await waitText(/Created .*1 invoice for “UI Retainer” \(\d{1,2} [A-Z][a-z]+ \d{4}\)/),
      `it names what it made and for which days (${(await page.evaluate(() => document.body.innerText.match(/Created[^\n]*/)?.[0] || '')).slice(0, 140)})`);
    const made = (await sql(`SELECT count(*)::int n FROM expenses WHERE owner_id = $1 AND description = 'UI Rent'`, [org]))[0].n;
    ok(await waitFor((n) => [...document.querySelectorAll('tbody tr')].some(r => r.innerText.startsWith('UI Rent') && r.innerText.includes(`${n}×`)), 8000, made),
      `the table refreshes: ${made}× made`);
    const dates = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.cells[4]?.innerText.replace(' · due', '').trim()).filter(Boolean));
    ok(dates.length >= 2 && dates.every(d => /^\d{1,2} [A-Z][a-z]{2,3} \d{4}$/.test(d)), `dates read like "8 Oct 2026" (${dates.join(', ')})`);
    await toastGone();
    await clickText('button', /Run now/);
    ok(await waitText(/Nothing was due today\. Next: “UI (Rent|Retainer)” on \d{1,2} [A-Z][a-z]+ \d{4}/), 'a second press makes nothing and says what is next');

    console.log('\n  ── what it made');
    await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find(r => r.innerText.startsWith('UI Retainer'))?.querySelector('button[aria-expanded]')?.click());
    ok(await waitFor(() => [...document.querySelectorAll('tbody a')].some(a => /\/sales-invoices\/\d+$/.test(a.getAttribute('href')))), 'the history opens with a link to the invoice');
    const [inv] = await sql(`SELECT id, invoice_number FROM sales_invoices WHERE owner_id = $1`, [org]);
    await page.evaluate(() => [...document.querySelectorAll('tbody a')].find(a => /\/sales-invoices\/\d+$/.test(a.getAttribute('href'))).click());
    ok(await waitFor((id) => location.pathname === `/sales-invoices/${id}`, 8000, inv.id) && await waitText(new RegExp(inv.invoice_number.replace(/[/-]/g, '.'))),
      `it lands on ${inv.invoice_number}`);
    await page.goto(`${UI}/automation`, { waitUntil: 'networkidle2' });
    await waitText(/UI Rent/);
    await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find(r => r.innerText.startsWith('UI Rent'))?.querySelector('button[aria-expanded]')?.click());
    await waitFor(() => [...document.querySelectorAll('tbody li')].length > 0);
    const hist = await page.evaluate(() => [...document.querySelectorAll('tbody li')].map(li => li.innerText.replace(/\s+/g, ' ')));
    ok(hist.length === made && hist.every(h => /^\d{1,2} [A-Z][a-z]{2,3} \d{4} Expense ₹12,000$/.test(h)), `the expenses are listed by their own dates (${hist.slice(0, 3).join(' | ')}…)`);

    console.log('\n  ── pause, resume, delete');
    await toastGone();
    await page.click('button[aria-label="Pause UI Rent"]');
    ok(await waitText(/Paused — “UI Rent” makes nothing until you resume it/), 'pausing says so');
    ok(await waitFor(() => [...document.querySelectorAll('tbody tr')].some(r => r.innerText.startsWith('UI Rent') && /paused/.test(r.innerText))), 'and the row reads paused');
    await page.click('button[aria-label="Resume UI Rent"]');
    ok(await waitText(/Resumed — next on \d{1,2} [A-Z][a-z]+ \d{4}/), 'resuming says when it runs next');
    await toastGone();
    await page.click('button[aria-label="Delete UI Retainer"]');
    ok(await waitText(/Deleted “UI Retainer” — the document it made is kept/), 'deleting says so, and that what it made is kept');
    ok(await waitFor(() => ![...document.querySelectorAll('tbody tr')].some(r => r.innerText.startsWith('UI Retainer'))), 'and the row goes');
    const still = await sql(`SELECT count(*)::int n FROM sales_invoices WHERE owner_id = $1`, [org]);
    ok(still[0].n === 1, 'the invoice it made is kept');

    console.log('\n  ── a phone, 360px wide');
    await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await page.goto(`${UI}/automation`, { waitUntil: 'networkidle2' });
    await waitText(/UI Rent/);
    await clickText('button', /New schedule/);
    await waitFor(() => !!document.querySelector('form'));
    const wide = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const scroller = document.querySelector('table')?.parentElement;
      const out = [...document.querySelectorAll('.app-page *')].filter(el => {
        if (scroller && scroller.contains(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1;
      }).map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${Math.round(el.getBoundingClientRect().right)}`);
      return { page: document.documentElement.scrollWidth, vw, out: out.slice(0, 5), tableScrolls: scroller ? scroller.scrollWidth > scroller.clientWidth : null };
    });
    ok(wide.page <= wide.vw && !wide.out.length, `nothing pokes out of the page (${wide.page}px of ${wide.vw}px${wide.out.length ? '; ' + wide.out.join(', ') : ''})`);
    ok(wide.tableScrolls === true, 'the schedule table scrolls inside its card instead');
    const reach = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Delete UI Rent"]');
      b?.scrollIntoView({ block: 'center', inline: 'center' });
      const r = b?.getBoundingClientRect();
      return !!r && r.left >= 0 && r.right <= document.documentElement.clientWidth;
    });
    ok(reach, 'and its pause and delete buttons can be reached');

    console.log('\n  ── a Viewer');
    await page.setViewport({ width: 1440, height: 1000 });
    await signIn(viewer.token);
    await page.goto(`${UI}/automation`, { waitUntil: 'networkidle2' });
    await waitText(/UI Rent/);
    const vw = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /Save|Run now|New schedule/.test(t)),
      actions: document.querySelectorAll('button[aria-label^="Pause"], button[aria-label^="Delete"]').length,
      input: document.querySelector('#po-threshold')?.disabled,
      sw: document.querySelector('button[role="switch"]')?.disabled,
      note: /can see these schedules but not change them/.test(document.body.innerText),
    }));
    ok(!vw.buttons.length && !vw.actions && vw.input && vw.sw && vw.note,
      `sees the schedules, is offered nothing that would be refused (${JSON.stringify(vw)})`);

    ok(!errs.length, `no page errors${errs.length ? ': ' + errs[0] : ''}`);
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.message);
  } finally {
    await browser?.close();
    const n = await cleanup();
    ok(n === 2, `test accounts removed (${n})`);
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
