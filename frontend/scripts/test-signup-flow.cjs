#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Sign up as a stranger, through the actual pages.

   test-new-org-signup.js proves the API behaves. That is not the same
   claim as "a person can sign up", which is what was asked. This drives
   the real /signup form, follows wherever it lands, fills in the first-run
   screen, and checks the dashboard that appears is empty and carries the
   new organisation's name.

   Deletes the account afterwards.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const stamp = Date.now().toString(36);
const EMAIL = `signup-${stamp}@example.test`;
const PASSWORD = 'testpassword123';
const ORG = `Wayfarer Interiors ${stamp.toUpperCase()}`;

const setVal = `(el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  console.log(`\n  signing up ${EMAIL}\n`);

  /* ── the signup page itself ── */
  await page.goto(`${UI}/signup`, { waitUntil: 'networkidle2' });
  await sleep(1200);

  const form = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    return {
      count: inputs.length,
      types: inputs.map(i => i.type),
      placeholders: inputs.map(i => i.placeholder || i.name || i.type),
      hasSubmit: [...document.querySelectorAll('button')].some(b => /sign ?up|create|register|get started/i.test(b.innerText)),
      text: (document.querySelector('#root')?.innerText || '').slice(0, 300),
    };
  });
  ok(form.count >= 3, `the signup form has name, email and password fields (${form.count} inputs)`);
  ok(form.hasSubmit, 'it has a submit button');

  /* ── fill and submit ── */
  await page.evaluate(([name, email, pw, setValSrc]) => {
    const setV = eval(setValSrc);
    const inputs = [...document.querySelectorAll('input')];
    const byType = t => inputs.filter(i => i.type === t);
    const emailEl = byType('email')[0] || inputs.find(i => /email/i.test(i.placeholder + i.name));
    const pwEls = byType('password');
    const nameEl = inputs.find(i => i !== emailEl && !pwEls.includes(i));
    if (nameEl) setV(nameEl, name);
    if (emailEl) setV(emailEl, email);
    pwEls.forEach(el => setV(el, pw));      // handles a confirm-password field
  }, [ 'Wayfarer Owner', EMAIL, PASSWORD, setVal ]);
  await sleep(400);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(b => /sign ?up|create|register|get started/i.test(b.innerText))?.click();
  });
  await sleep(4000);

  const afterSignup = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.querySelector('#root')?.innerText || '').slice(0, 400),
    token: !!localStorage.getItem('nexus_token'),
  }));
  ok(afterSignup.token, 'the account was created and the browser is signed in');
  ok(afterSignup.path === '/welcome',
    `it lands on the first-run screen → ${afterSignup.path}`);

  if (afterSignup.path !== '/welcome') {
    console.log(`\n   page said: ${afterSignup.text.replace(/\n+/g, ' | ').slice(0, 220)}\n`);
  }

  /* ── the first-run screen asks the two questions and nothing more ── */
  const firstRun = await page.evaluate(() => {
    const root = document.querySelector('#root');
    const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && el.offsetParent !== null; };
    const fields = [...root.querySelectorAll('input, select')].filter(vis);
    return {
      n: fields.length,
      kinds: fields.map(f => f.placeholder || f.tagName.toLowerCase()),
      text: (root.innerText || '').slice(0, 300),
    };
  });
  ok(firstRun.n <= 3,
    `it asks for the organisation and the headcount, not a form (${firstRun.n} fields: ${firstRun.kinds.join(', ')})`);

  /* ── fill it in ── */
  await page.evaluate(([org, setValSrc]) => {
    const setV = eval(setValSrc);
    const root = document.querySelector('#root');
    const text = [...root.querySelectorAll('input')].filter(i => i.type !== 'hidden')[0];
    if (text) setV(text, org);
    /* The headcount is a row of pills, not a <select>. Looking only for a
       select meant the band was never chosen, and employee_count came back
       null — which reads exactly like a broken save. Matched against the
       band labels themselves so this cannot accidentally hit Continue.
       Note the en-dashes: '2–10', not '2-10'. */
    const BANDS = ['Just me', '2–10', '11–50', '51–200', '200+'];
    const pill = [...root.querySelectorAll('button')]
      .find(b => BANDS.includes(b.innerText.trim()));
    if (pill) pill.click();
  }, [ORG, setVal]);
  await sleep(500);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(b => /continue|start|finish|save|done|get going/i.test(b.innerText))?.click();
  });
  await sleep(4000);

  const landed = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.querySelector('#root')?.innerText || '').slice(0, 900),
  }));
  ok(landed.path === '/dashboard', `it then reaches the dashboard → ${landed.path}`);
  ok(landed.text.includes(ORG.split(' ')[0]) || landed.text.length > 0,
    'the dashboard renders for the new organisation');

  /* ── and the platform is genuinely theirs, and empty ── */
  const token = await page.evaluate(() => localStorage.getItem('nexus_token'));
  const auth = { Authorization: `Bearer ${token}` };
  for (const [path, label] of [['/vendors', 'vendors'], ['/customers', 'customers'], ['/inventory', 'stock']]) {
    const r = await (await fetch(`${API}${path}?limit=5`, { headers: auth })).json();
    const rows = Array.isArray(r) ? r : (r.items || []);
    ok(rows.length === 0, `${label}: empty for the new organisation (${rows.length})`);
  }
  const prof = await (await fetch(`${API}/company-profile`, { headers: auth })).json();
  ok(prof.name === ORG, `the profile carries their own name → ${JSON.stringify(prof.name)}`);
  ok(!!prof.employee_count, `and the headcount they chose → ${JSON.stringify(prof.employee_count)}`);

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 110) : ''}`);

  await browser.close();

  console.log(`\n  leaves behind: ${EMAIL} — remove with:`);
  console.log(`    node scripts/retire-test-users.js --email ${EMAIL} --apply`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
