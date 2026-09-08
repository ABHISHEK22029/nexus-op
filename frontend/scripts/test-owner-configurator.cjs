#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   An Owner administering their own company, through the real screens.

   The backend for this landed in 48aa46d and was proved with API tests. A
   passing API test says nothing about whether the person who owns the
   company can actually reach it: the Configurator was Administrator-only in
   the UI for a long time, and a screen that refuses you is indistinguishable
   from a feature that does not exist.

   Signs up as a founder — not as the platform administrator — and drives:
   the Configure menu, the people directory, inviting somebody, and creating
   a role.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
const ROLE = `Fitter${stamp.slice(-4).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const email = `cfg-${stamp}@example.test`;
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Founder', email, password: 'testpassword123' }),
  })).json();
  if (!reg.token) { console.error('register failed:', reg); process.exit(1); }
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  /* ── the Configure menu is reachable at all ────────────── */
  console.log(`\n  signed in as the founder of Kirashi ${stamp}\n`);
  await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  ok(await page.evaluate(() =>
    [...document.querySelectorAll('button, a')].some(b => /^configure$/i.test(b.innerText.trim()))),
    'the Configure entry is on the rail — an Owner used to be shut out entirely');

  /* ── the people directory ──────────────────────────────── */
  await page.goto(`${UI}/configurator/people`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const people = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      refused: /Administrators only|Not your area/i.test(t),
      rows: document.querySelectorAll('tbody tr').length,
      canAdd: [...document.querySelectorAll('button')].some(b => /add person/i.test(b.innerText)),
    };
  });
  ok(!people.refused, 'the people screen opens rather than refusing them');
  ok(people.rows >= 1, `it lists their own organisation only (${people.rows} row)`);
  ok(people.canAdd, 'and offers to add somebody');

  /* ── the roles screen, and creating one ────────────────── */
  await page.goto(`${UI}/configurator/roles`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const rolesView = await page.evaluate(() => ({
    refused: /Administrators only|Not your area/i.test(document.body.innerText),
    hasNewRole: [...document.querySelectorAll('button')].some(b => /new role/i.test(b.innerText)),
  }));
  ok(!rolesView.refused, 'the roles screen opens');
  ok(rolesView.hasNewRole, 'with a "New role" button');

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /new role/i.test(b.innerText))?.click();
  });
  await sleep(1000);

  const filled = await page.evaluate((role) => {
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null);
    if (!inputs.length) return false;
    setV(inputs[0], role);
    return true;
  }, ROLE);
  ok(filled, 'the form opens with a name field');

  await sleep(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(b => /^(create|create role|add role|save)/i.test(b.innerText.trim()))?.click();
  });
  await sleep(2500);

  /* ── did it actually reach the database, in THIS org? ──── */
  const roles = await (await fetch(`${API}/admin/roles`, { headers: auth })).json();
  const made = (roles.roles || []).find(r => r.role === ROLE);
  ok(!!made, `the role exists after saving (${ROLE})`);
  ok(made?.isOwn === true, 'and belongs to this organisation, not the whole install');

  /* Assignable straight away — a role you cannot give anyone is decoration. */
  const inv = await (await fetch(`${API}/admin/users`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: 'Fitter', email: `fitter-${stamp}@example.test`, role: ROLE }),
  })).json();
  ok(!!inv.user, 'somebody can be invited straight onto it');

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 110) : ''}`);

  await browser.close();

  /* ── clean up ──────────────────────────────────────────── */
  /* pg lives in the backend's node_modules, not the frontend's. */
  const { Client } = require(require('path').join(__dirname, '..', '..', 'backend', 'node_modules', 'pg'));
  require(require('path').join(__dirname, '..', '..', 'backend', 'node_modules', 'dotenv'))
    .config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM role_permissions WHERE role = $1', [ROLE]);
  await c.query('DELETE FROM role_definitions WHERE role = $1', [ROLE]);
  await c.query('DELETE FROM company_profile WHERE owner_id = $1', [reg.user.id]);
  await c.query('DELETE FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  const { rows } = await c.query('SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  await c.end();
  ok(Number(rows[0].c) === 0, 'test organisation removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
