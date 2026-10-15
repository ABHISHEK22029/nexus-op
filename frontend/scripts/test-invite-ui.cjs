#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Inviting a team member, in a browser.

   · Team → Add person (invite): the dialog says the invitation was emailed
     to them, and still shows the link with Copy.
   · The Team list shows them as Invited, not joined yet, with Resend invite;
     pressing it says it was emailed again.
   · Configurator → People shows "invited, not joined yet" and a Resend
     invite button in place of Reset password.
   · They open the emailed link, choose a password, and land signed in.

   Backend with MAIL_TRANSPORT=file MAIL_OUTBOX_DIR=<dir>, and the same dir here.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 MAIL_OUTBOX_DIR=… node scripts/test-invite-ui.cjs
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
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const mailsTo = (to) => fs.readdirSync(OUTBOX).filter((f) => f.includes(to.replace(/[^a-z0-9@._-]/gi, '_'))).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))).filter((m) => m.tag === 'invite');

(async () => {
  const ids = [];
  let browser;
  try {
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invite UI Owner', email: `invui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    ids.push(reg.user.id);
    await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Invite UI Works ${stamp}` }) });
    const guest = `invui-guest-${stamp}@example.test`;

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); }, reg.token, reg.user);
    const waitFor = (fn, ms = 12000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
    const waitText = (re, ms = 12000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const click = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll('button')].find(x => new RegExp(src).test(x.textContent)); if (b) b.click(); return !!b; }, re.source);

    console.log('\n  ── Team → Add person');
    await page.goto(`${UI}/users`, { waitUntil: 'networkidle2' });
    await click(/Add person/);
    await waitFor(() => !!document.querySelector('input[placeholder="they sign in with this"]'));
    const fill = async (selector, value) => { const h = await page.$(selector); await h.click({ clickCount: 3 }); await h.type(value); };
    await fill('input[placeholder="e.g. Ramesh Kumar"]', 'Ravi Kumar');
    await fill('input[placeholder="they sign in with this"]', guest);
    await click(/Send invitation/);
    ok(await waitFor(() => !!document.querySelector('[data-invite-emailed]')), 'the dialog says the invitation was emailed');
    ok(await waitText(new RegExp(`Invitation emailed to ${guest.replace(/\./g, '\\.')}`)) && await waitText(/Copy link/), 'to whom, and still offers the link to copy');
    ok(mailsTo(guest).length === 1, 'and the email was sent');
    await click(/^\s*Done\s*$/);

    console.log('\n  ── the Team list');
    await page.goto(`${UI}/users`, { waitUntil: 'networkidle2' });
    ok(await waitText(/Invited/) && await waitText(/not joined yet/), 'they are listed as Invited, not joined yet');
    await page.evaluate((e) => document.querySelector(`button[aria-label="Resend invite to ${e}"]`)?.click(), guest);
    ok(await waitText(/Invitation emailed again to/), 'Resend invite says it was emailed again');
    await waitFor((g) => true, 1500, guest);
    ok(mailsTo(guest).length === 2, 'and a second email went');

    console.log('\n  ── Configurator → People');
    await page.goto(`${UI}/configurator/people`, { waitUntil: 'networkidle2' });
    const people = await waitText(/invited, not joined yet/);
    const btn = await page.evaluate((e) => !!document.querySelector(`button[aria-label="Resend invite to ${e}"]`), guest);
    ok(people && btn, 'People shows "invited, not joined yet" with a Resend invite button');

    console.log('\n  ── they join from the email');
    const last = mailsTo(guest).pop();
    const link = (last.text.match(/https?:\/\/\S+accept-invite\?token=\S+/) || [])[0];
    const local = link && link.replace(/^https?:\/\/[^/]+/, UI);
    const page2 = await (await browser.createBrowserContext()).newPage();
    await page2.setViewport({ width: 390, height: 800 });
    await page2.goto(local, { waitUntil: 'networkidle2' });
    const pw = await page2.$$('input[type="password"]');
    for (const p of pw) await p.type('RaviChose#2026');
    await page2.evaluate(() => [...document.querySelectorAll('button')].find(b => /set|join|create|continue|start/i.test(b.textContent) && b.type !== 'button')?.click()
      || document.querySelector('form button[type="submit"]')?.click());
    const signedIn = await page2.waitForFunction(() => !!localStorage.getItem('nexus_token') && !/accept-invite/.test(location.pathname), { timeout: 15000 }).then(() => true).catch(() => false);
    ok(pw.length >= 1 && signedIn, `the emailed link opens, they choose a password, and land signed in (${new URL(page2.url()).pathname})`);
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
    const u = await (await fetch(`${API}/users?limit=50`, { headers: { Authorization: `Bearer ${reg.token}` } })).json();
    for (const x of (u.items || [])) if (x.id !== reg.user.id) ids.push(x.id);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close();
    const removed = await purge(ids.filter(Boolean)).catch(() => 0);
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
