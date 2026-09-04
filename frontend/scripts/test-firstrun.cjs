#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   test-firstrun — does a genuinely new install get the welcome screen,
   and does answering it work?

   This runs against a real company_profile, so it snapshots the row first
   and restores it in a finally block whether the test passes, fails or
   throws. Blanking a live business's name and walking away because an
   assertion failed is not an acceptable way to test.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

const results = [];
const step = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `\n       ${detail}` : ''}`);
};

const TEST_NAME = 'Steelco Fabrication Pvt Ltd';

/* There is no API for deleting the company profile, and there should not be
   — so this reaches the database directly. Confined to this test, which owns
   the snapshot-and-restore around it. */
const { execFileSync } = require('child_process');
const path = require('path');
function runSql(sql) {
  const script = path.join(__dirname, '..', '..', 'backend', 'scripts', 'sql.js');
  return execFileSync(process.execPath, [script, sql], { encoding: 'utf8' });
}
async function deleteProfileRow() {
  try {
    const out = runSql('DELETE FROM company_profile');
    return { ok: true, detail: out.trim().split('\n').pop() };
  } catch (e) {
    return { ok: false, detail: e.message.slice(0, 160) };
  }
}

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const snapshot = await (await fetch(`${API}/company-profile`, { headers: auth })).json();
  console.log(`\n  snapshot: "${snapshot.name}" (will be restored)\n`);

  let browser;
  try {
    /* Simulate a fresh install the way one actually occurs: no row at all.
       company_profile.name is NOT NULL, so "blank the name" is not a state
       a new install can be in — the first attempt at this PUT a `name: ''`,
       got a 500 from the constraint, ignored the response and carried on
       testing nothing. Deleting the row is the real condition, and it is
       what the restore below puts back. */
    const del = await deleteProfileRow();
    step('profile row removed to simulate a new install', del.ok, del.detail);
    /* Stop here if the setup failed. Carrying on produced four more failures
       that all said "not on the welcome screen" — true, but only because the
       precondition never happened. Cascading failures bury the one that
       matters. */
    if (!del.ok) throw new Error('could not simulate a new install — nothing below was tested');

    const blank = await (await fetch(`${API}/company-profile`, { headers: auth })).json();
    step('an unset profile reads as unset, not as somebody else\'s business',
      !blank.name,
      `GET returned name=${JSON.stringify(blank.name)}` +
      (/kirashi/i.test(blank.name || '') ? '  ← a fresh install is being named after another company' : ''));

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => localStorage.setItem('nexus_token', t), token);

    /* Asking for the dashboard should land on the welcome screen instead. */
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));
    const landed = await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText }));
    step('a new install is sent to the welcome screen',
      landed.path === '/welcome',
      `asked for /dashboard, landed on ${landed.path}`);

    /* Count INPUTS, not words. The first version asserted that the page text
       contained no "GSTIN" or "bank" — and failed on this screen's own copy,
       which says those things can wait. What matters is that it does not ask
       for them, and an input is what asking looks like. */
    const fields = await page.evaluate(() => ({
      inputs: document.querySelectorAll('input, select, textarea').length,
      labels: [...document.querySelectorAll('label')].map(l => l.innerText.trim()),
    }));
    step('it asks for one thing, not nine',
      fields.inputs === 1 && /What is your business called/i.test(landed.text) && /How many people/i.test(landed.text),
      `${fields.inputs} input(s): ${fields.labels.join(' · ')}`);

    /* Answer it. */
    await page.evaluate((name) => {
      const i = document.querySelector('input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, name);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, TEST_NAME);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '11–50')?.click();
    });
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => /Start using/i.test(b.innerText))?.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    const after = await page.evaluate(() => location.pathname);
    step('answering it lands you in the product', after === '/dashboard',
      `now on ${after}`);

    const saved = await (await fetch(`${API}/company-profile`, { headers: auth })).json();
    step('the answers are stored',
      saved.name === TEST_NAME && saved.employee_count === '11–50' && !!saved.setup_completed_at,
      `name="${saved.name}" employees="${saved.employee_count}" completed=${saved.setup_completed_at ? 'yes' : 'no'}`);

    /* And it must not ask again. */
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1800));
    const second = await page.evaluate(() => location.pathname);
    step('it does not ask a second time', second === '/dashboard', `landed on ${second}`);

    /* And the name it was given is the one in the bar. */
    await new Promise(r => setTimeout(r, 1200));   // the bar fetches the profile itself

    if (process.env.DEBUG_BAR) {
      const seen = await page.evaluate(async (api, t) => {
        const r = await fetch(`${api}/company-profile`, { headers: { Authorization: `Bearer ${t}` } });
        const j = await r.json();
        return { status: r.status, name: j.name, tradeName: j.tradeName, id: j.id };
      }, API, token);
      console.log(`       [debug] the page itself fetches: ${JSON.stringify(seen)}`);
      console.log(`       [debug] rows in table: ${runSql('SELECT 1 FROM company_profile').trim()}`);
    }
    const barText = await page.evaluate(() => {
      /* The organisation's name moved out of the top bar (which no longer
         exists) into the scope bar at the top of the navigation panel.
         Reading .app-main's first child kept "passing" by picking up the
         account avatar instead — a check that survives the thing it checks
         being deleted is not checking anything. */
      const el = document.querySelector('.nav-scope');
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : '(no scope bar)';
    });
    step('the name appears in the scope bar', barText.includes(TEST_NAME),
      `scope bar reads: "${barText.slice(0, 80)}"`);

    step('no JavaScript errors', errors.length === 0, errors[0] || '');
  } finally {
    if (browser) await browser.close();

    /* Restore EVERY field, always.

       The first version of this deleted the whole row and put back three
       columns — which would have permanently destroyed this business's
       GSTIN, PAN, address, phone, email and payment terms the first time it
       ran. The snapshot is the whole row; the restore has to be too. */
    const { id, ...fields } = snapshot;
    await fetch(`${API}/company-profile`, {
      method: 'PUT', headers: auth, body: JSON.stringify(fields),
    });
    const back = await (await fetch(`${API}/company-profile`, { headers: auth })).json();

    const lost = Object.keys(fields).filter(k => {
      const a = fields[k] ?? null, b = back[k] ?? null;
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    console.log(`\n  restored: "${back.name}"`);
    if (lost.length) console.log(`  ⚠ these did NOT come back: ${lost.join(', ')}`);
    else console.log(`  every field matches the snapshot ✅`);
  }

  const pass = results.filter(r => r.ok).length;
  console.log(`\n  ${pass} of ${results.length} passed\n`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
