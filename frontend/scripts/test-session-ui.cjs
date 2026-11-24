/* ══════════════════════════════════════════════════════════════════════
   A session that ends mid-form no longer wipes the page.

   Reported: "if you enter some info it gets erased when the user logs in".
   The session ended (12 hours, a password change), the next request came
   back 401, and the tab was sent to /login with a full page load: every
   form on the screen lost what was typed. The notifications check runs
   every minute, so it happened even without pressing Save.

   Clicked through in the app:
     · the customer form: the session runs out, Add is pressed — a sign-in
       box opens over the page, the typed fields are all still there, a
       wrong password is refused, the right one closes the box and the
       customer is saved exactly once
     · the company profile (a full-page form): the same, the note is saved
     · a background check while typing: the box opens, the text stays, the
       cursor goes back into the field after signing in, typing carries on
     · a password changed elsewhere: the box says so; the new password works
     · "Not you? Sign out": back to the sign-in page, nothing is saved, and
       signing in returns to the same screen
     · signing in again in another tab closes the box here by itself
     · someone ELSE signing in in another tab: this tab leaves for the
       dashboard, and nothing typed here lands in their company
     · a session in use renews itself
     · dark mode, a phone, no "connecting" notice behind the box, no page
       errors, no browser boxes

   Builds its own throwaway companies (ssui-*@example.test) and removes
   them. Needs the backend (SCHEDULER=off) and vite running. Refuses a
   deployed host. SHOTS=<dir> saves screenshots there.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const BE = path.join(__dirname, '../../backend');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const { Client } = require(path.join(BE, 'node_modules/pg'));
const jwt = require(path.join(BE, 'node_modules/jsonwebtoken'));
const { JWT_SECRET } = require(path.join(BE, 'middleware/auth'));
const { purgeOrg } = require(path.join(BE, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || '';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let PASS_A = 'testpassword123';
const PASS_B = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'ssui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

const register = async (who) => (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Session ${who}`, email: `ssui-${who}-${stamp}@example.test`, password: 'testpassword123' }) })).json();
/* The session as it is 13 hours after signing in: run out. */
const expired = (u) => {
  const iat = Math.floor(Date.now() / 1000) - 13 * 3600;
  return jwt.sign({ sub: u.id, org: u.org_id ?? u.id, email: u.email, role: u.role, name: u.name, iatMs: iat * 1000, iat }, JWT_SECRET, { expiresIn: '12h' });
};
const aged = (u, hours) => {
  const iat = Math.floor(Date.now() / 1000) - hours * 3600;
  return jwt.sign({ sub: u.id, org: u.org_id ?? u.id, email: u.email, role: u.role, name: u.name, iatMs: iat * 1000, iat }, JWT_SECRET, { expiresIn: '12h' });
};
const customersNamed = async (name) => Number((await q('SELECT count(*)::int AS n FROM customers WHERE name = $1', [name]))[0].n);

(async () => {
  await cleanup();
  const A = await register('a'), B = await register('b');
  const profile = async (t, name) => fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() }) });
  let browser;
  try {
    if (!A.token || !B.token) throw new Error('could not make the test companies');
    await profile(A.token, 'Session Fab Works'); await profile(B.token, 'Other Fab Works');

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errs = [];
    let nativeDialogs = 0;
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => { nativeDialogs++; d.dismiss(); });
    const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}.png`) }); };
    const val = (p, sel) => p.$eval(sel, el => el.value).catch(() => null);
    const gateUp = (p, t = 8000) => p.waitForSelector('[data-session-gate]', { visible: true, timeout: t }).then(() => true).catch(() => false);
    const gateDown = (p, t = 8000) => p.waitForSelector('[data-session-gate]', { hidden: true, timeout: t }).then(() => true).catch(() => false);
    const gateText = (p) => p.$eval('[data-session-gate]', el => el.innerText).catch(() => '');
    const endSession = (p, token) => p.evaluate((t) => localStorage.setItem('nexus_token', t), token);
    const signInAtBox = async (p, password) => {
      await p.$eval('[data-session-gate-password]', el => el.focus());
      await p.keyboard.type(password);
      await p.click('[data-session-gate-submit]');
    };
    const signInPage = async (p, email, password) => {
      await p.goto(`${UI}/login`, { waitUntil: 'networkidle2' });
      await p.type('input[type=email]', email);
      await p.type('input[type=password]', password);
      await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.keyboard.press('Enter')]);
      await sleep(600);
    };
    const openCustomerForm = async () => {
      await page.goto(`${UI}/customers`, { waitUntil: 'networkidle2' }); await sleep(500);
      const btn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /^\s*Add Customer\s*$/.test(b.innerText)));
      await btn.click();
      await page.waitForSelector('[data-field="name"]', { visible: true });
    };
    const typeInto = async (sel, text) => { await page.click(sel); await page.keyboard.type(text); };

    await page.goto(`${UI}/login`);
    await page.evaluate(() => { localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1'); });
    await signInPage(page, A.user.email, PASS_A);
    ok(/\/dashboard/.test(page.url()), 'signed in through the sign-in page');

    section('The customer form, when the session runs out');
    const name1 = `Kept Traders ${stamp}`;
    await openCustomerForm();
    await typeInto('[data-field="name"]', name1);
    await typeInto('[data-field="contact_name"]', 'Meera Rao');
    await typeInto('[data-field="billing_address"]', 'Plot 7, IDA Uppal, Hyderabad');
    await endSession(page, expired(A.user));
    await page.$eval('[data-field="name"]', el => el.focus());
    await page.keyboard.press('Enter');
    ok(await gateUp(page), 'pressing Add opens a sign-in box over the page');
    ok(/\/customers/.test(page.url()), `the page stays where it was (${new URL(page.url()).pathname})`);
    const t1 = await gateText(page);
    ok(/Your session has ended/.test(t1) && t1.includes(A.user.email), 'the box says the session ended, and whose it is');
    ok(await val(page, '[data-field="name"]') === name1 && await val(page, '[data-field="contact_name"]') === 'Meera Rao'
      && await val(page, '[data-field="billing_address"]') === 'Plot 7, IDA Uppal, Hyderabad', 'everything typed is still in the form');
    ok(await page.evaluate(() => document.getElementById('root').inert === true), 'the page behind cannot be used while signed out');
    ok(await customersNamed(name1) === 0, 'nothing saved yet');
    await shot(page, 'session-gate-light');
    await signInAtBox(page, 'not-the-password');
    await page.waitForSelector('[data-session-gate-error]', { visible: true, timeout: 8000 }).catch(() => {});
    ok(/invalid email or password/i.test(await gateText(page)) && await page.$('[data-session-gate]') !== null, 'a wrong password is refused, and the box stays');
    await signInAtBox(page, PASS_A);
    ok(await gateDown(page), 'the right password closes the box');
    await sleep(800);
    ok(await customersNamed(name1) === 1, 'and the customer is saved, once');
    ok(await page.evaluate(() => /Customer added/.test(document.body.innerText)), 'the app says "Customer added"');
    ok(/\/customers/.test(page.url()), 'still on Customers');

    section('A full-page form: the company profile');
    await page.goto(`${UI}/company-profile`, { waitUntil: 'networkidle2' }); await sleep(600);
    const note = `Thank you for your business ${stamp}`;
    const ta = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(l => /Invoice footer note/.test(l.innerText))?.querySelector('textarea'));
    await ta.click(); await page.keyboard.type(note);
    await endSession(page, expired(A.user));
    const saveBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Save changes/.test(b.innerText)));
    await saveBtn.click();
    ok(await gateUp(page), 'Save changes opens the box');
    ok(await page.evaluate(() => [...document.querySelectorAll('label')].find(l => /Invoice footer note/.test(l.innerText))?.querySelector('textarea')?.value) === note, 'the typed note is still there');
    await signInAtBox(page, PASS_A);
    ok(await gateDown(page), 'signed in again');
    await sleep(900);
    const prof = (await q('SELECT invoice_footer_note FROM company_profile WHERE owner_id = $1', [A.user.id]))[0];
    ok(prof?.invoice_footer_note === note, 'and the note is saved');

    section('A background check while typing');
    await openCustomerForm();
    await typeInto('[data-field="contact_name"]', 'Half a na');
    await endSession(page, expired(A.user));
    await page.evaluate((api) => { window.__bg = fetch(`${api}/notifications`).then(r => r.status); }, API);
    ok(await gateUp(page), 'the minute-by-minute check opens the box, not the sign-in page');
    ok(await val(page, '[data-field="contact_name"]') === 'Half a na', 'the half-typed text stays');
    await sleep(6000);
    ok(!(await page.$('.app-waking')), 'no "connecting to the server" notice while the box waits');
    await signInAtBox(page, PASS_A);
    ok(await gateDown(page), 'signed in again');
    ok(await page.evaluate(() => window.__bg) === 200, 'the check that was refused went through afterwards');
    ok(await page.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'contact_name', 'the cursor is back in the field');
    await page.keyboard.type('me');
    ok(await val(page, '[data-field="contact_name"]') === 'Half a name', 'and typing carries on');

    section('The password was changed elsewhere');
    const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: A.user.email, password: PASS_A }) })).json();
    const NEW = `${PASS_A}-new`;
    const cp = await fetch(`${API}/auth/change-password`, { method: 'POST', headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: PASS_A, newPassword: NEW }) });
    ok(cp.status === 200, 'the password is changed on another device');
    PASS_A = NEW;
    const name2 = `Changed Pass Traders ${stamp}`;
    await typeInto('[data-field="name"]', name2);
    await page.keyboard.press('Enter');
    ok(await gateUp(page), 'the next save opens the box');
    ok(/Your password was changed/.test(await gateText(page)), 'which says the password was changed');
    await signInAtBox(page, PASS_A);
    ok(await gateDown(page), 'the new password works');
    await sleep(800);
    ok(await customersNamed(name2) === 1, 'and the customer is saved');

    section('"Not you? Sign out"');
    const name3 = `Signed Out Traders ${stamp}`;
    await openCustomerForm();
    await typeInto('[data-field="name"]', name3);
    await endSession(page, expired(A.user));
    await page.keyboard.press('Enter');
    ok(await gateUp(page), 'the box opens');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.click('[data-session-gate-signout]')]);
    ok(/\/login/.test(page.url()), 'signing out goes to the sign-in page');
    await sleep(600);
    ok(await customersNamed(name3) === 0, 'and what was waiting is not saved');
    await page.type('input[type=email]', A.user.email); await page.type('input[type=password]', PASS_A);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.keyboard.press('Enter')]);
    ok(/\/customers/.test(page.url()), 'signing in returns to Customers');

    section('Another tab');
    const name4 = `Other Tab Traders ${stamp}`;
    await openCustomerForm();
    await typeInto('[data-field="name"]', name4);
    await endSession(page, expired(A.user));
    await page.keyboard.press('Enter');
    ok(await gateUp(page), 'the box opens here');
    const tab = await browser.newPage();
    tab.on('pageerror', e => errs.push(`tab: ${e.message}`));
    await tab.bringToFront();
    await signInPage(tab, A.user.email, PASS_A);
    await page.bringToFront();   // a tab in the background draws no frames, and clicks there wait for one
    ok(await gateDown(page), 'signing in again in another tab closes the box here by itself');
    await sleep(900);
    ok(await customersNamed(name4) === 1, 'and the save goes through');

    const name5 = `Wrong Company Traders ${stamp}`;
    await openCustomerForm();
    await typeInto('[data-field="name"]', name5);
    await tab.evaluate(() => localStorage.removeItem('nexus_token'));
    await sleep(300);
    await tab.bringToFront();
    const left = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).then(() => true).catch(() => false);
    await signInPage(tab, B.user.email, PASS_B);
    ok(await left, 'someone else signing in, in another tab: this tab leaves');
    ok(/\/dashboard/.test(page.url()), `for the dashboard (${new URL(page.url()).pathname})`);
    await sleep(900);
    ok(await customersNamed(name5) === 0, "nothing typed here lands in the other person's company");
    await tab.close();
    await page.bringToFront();

    section('A session in use renews itself');
    await page.goto(`${UI}/customers`, { waitUntil: 'networkidle2' }); await sleep(400);
    const oldTok = aged(B.user, 7);
    await endSession(page, oldTok);
    await page.evaluate((api) => fetch(`${api}/customers?limit=1`).then(r => r.status), API);
    const now = await page.evaluate(() => localStorage.getItem('nexus_token'));
    ok(now && now !== oldTok && Math.abs(jwt_iat(now) - Date.now() / 1000) < 60, 'a 7-hour-old session gets a fresh token');

    section('Dark, on a phone');
    await page.evaluate(() => localStorage.setItem('nexus-theme', 'dark'));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${UI}/customers`, { waitUntil: 'networkidle2' }); await sleep(500);
    await endSession(page, expired(B.user));
    await page.evaluate((api) => { fetch(`${api}/notifications`); }, API);
    ok(await gateUp(page), 'the box opens');
    const fit = await page.$eval('.sg-panel', el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, sx: document.documentElement.scrollWidth }; });
    ok(fit.l >= 8 && fit.r <= fit.w - 8 && fit.sx <= fit.w, `it fits a 390px screen with no sideways scroll (${Math.round(fit.l)}–${Math.round(fit.r)} of ${fit.w})`);
    ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'in dark mode');
    await shot(page, 'session-gate-dark-phone');
    await signInAtBox(page, PASS_B);
    ok(await gateDown(page), 'and closes on signing in');

    section('Clean run');
    ok(errs.length === 0, errs.length ? `page errors: ${errs.slice(0, 3).join(' | ')}` : 'no page errors');
    ok(nativeDialogs === 0, `no browser boxes (${nativeDialogs})`);
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();

function jwt_iat(t) { return (jwt.decode(t) || {}).iat || 0; }
