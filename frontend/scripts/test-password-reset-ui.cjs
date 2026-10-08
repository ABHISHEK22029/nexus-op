#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   "Forgot password?" in a browser, start to finish.

   Sign-in → Forgot password? → the email → Send code → the code from the
   email → a new password (the rules tick as they are met) → back at sign-in
   with "Your password has been changed" and the address filled in → signed
   in with the new password. An old session open elsewhere is sent to sign-in
   with the reason. Works at 360px; no page errors.

   The backend must run with MAIL_TRANSPORT=file MAIL_OUTBOX_DIR=<dir>, and
   MAIL_OUTBOX_DIR set to the same <dir> here.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5175 MAIL_OUTBOX_DIR=… node scripts/test-password-reset-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
const OUTBOX = process.env.MAIL_OUTBOX_DIR;
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
if (!OUTBOX) { console.error('set MAIL_OUTBOX_DIR'); process.exit(1); }
const stamp = Date.now().toString(36);
const email = `pwrui-${stamp}@example.test`;
const OLD = 'testpassword123';
const NEW = `Fresh${stamp}7`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const codeFromOutbox = () => {
  const m = fs.readdirSync(OUTBOX).filter(f => f.includes(email.replace(/[^a-z0-9@._-]/gi, '_'))).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))).filter(x => x.tag === 'password_reset').pop();
  return m ? (m.text.match(/code is: (\d{3} \d{3})/) || [])[1] : null;
};

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reset UI', email, password: OLD }) })).json();
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reset UI Works' }) });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const errs = [];
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 360, height: 780 });
    const waitText = (re, ms = 8000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout: ms }, re.source).then(() => true).catch(() => false);
    const type = async (sel, v) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, v); };

    /* An "other device": a second, separate browser session signed in with the old password. */
    const other = await browser.createBrowserContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`${UI}/login`);
    await otherPage.evaluate((t) => localStorage.setItem('nexus_token', t), reg.token);
    await otherPage.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });

    await page.goto(`${UI}/login`, { waitUntil: 'networkidle2' });
    await type('input[type="email"]', email);
    const link = await page.$('a[href^="/forgot-password"]');
    ok(!!link, 'the sign-in screen has "Forgot password?" next to the password');
    await link.click();
    ok(await waitText(/Reset your password/), 'it opens the reset screen');
    const prefilled = await page.$eval('#fp-email', el => el.value);
    ok(prefilled === email, `with the email already typed carried over (${prefilled})`);
    const noOverflow1 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    ok(noOverflow1, 'no sideways scroll at 360px');
    await page.click('button[type="submit"]');
    ok(await waitText(/Enter the code/), 'Send code moves to entering the code');
    ok(await waitText(/Send a new code in \d+s/), 'with a countdown before another code can be asked for');
    await sleep(500);
    const code = codeFromOutbox();
    ok(!!code, 'the code arrives by email');

    await type('#fp-code', code);
    await type('#fp-password', 'weak');
    const unmet = await page.$$eval('#fp-rules li', lis => lis.filter(li => !li.textContent.includes('Not your')).map(li => getComputedStyle(li).color));
    await type('#fp-password', NEW);
    const met = await page.$$eval('#fp-rules li', lis => lis.map(li => getComputedStyle(li).color));
    ok(unmet[0] !== met[0], 'the password rules change as they are met');
    await type('#fp-confirm', `${NEW}x`);
    ok(await waitText(/Not the same as above yet/), 'a confirmation that does not match says so');
    await type('#fp-confirm', NEW);
    await page.click('button[type="submit"]');
    ok(await waitText(/Your password has been changed\. Sign in with the new one\./, 10000), 'it lands on sign-in saying the password was changed');
    const loginEmail = await page.$eval('input[type="email"]', el => el.value);
    ok(loginEmail === email, 'with the address filled in');
    await type('input[type="password"]', NEW);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}), page.click('button[type="submit"]')]);
    ok(/\/dashboard|\/welcome/.test(page.url()), `and signs in with the new password (${new URL(page.url()).pathname})`);

    /* The other device: its session started before the reset. */
    await otherPage.goto(`${UI}/sales-invoices`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const otherUrl = otherPage.url();
    const otherSays = await otherPage.evaluate(() => document.body.innerText);
    ok(/\/login/.test(otherUrl) && /Your password was changed\. Sign in again\./.test(otherSays),
      `a session open elsewhere is sent to sign-in, told why (${new URL(otherUrl).pathname})`);

    const wrongCode = await browser.newPage();
    await wrongCode.setViewport({ width: 1280, height: 800 });
    await wrongCode.goto(`${UI}/reset-password?email=${encodeURIComponent(email)}`, { waitUntil: 'networkidle2' });
    ok(await wrongCode.evaluate(() => document.body.innerText.includes('Enter the code')), 'the email\'s link opens straight at entering the code');
    ok(!errs.length, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const f of fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : []) if (f.includes(stamp)) fs.unlinkSync(path.join(OUTBOX, f));
    await purge([reg.user?.id]).catch(() => 0);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
