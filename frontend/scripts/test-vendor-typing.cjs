#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Can you actually type into the vendor form?

   Reported: "I enter one single letter, the cursor after that is gone, I
   need to click in there once again." PAN and the bank fields, and only
   those — the name, phone and GSTIN at the top were fine.

   That split is the whole diagnosis. The affected fields all live inside a
   collapsible <Section>, and Section was declared inside the component
   body, so every render produced a new function and therefore a new
   component TYPE. React cannot match a new type to the old one, so it
   unmounted the subtree and built a fresh one on each keystroke, throwing
   away the input element and the caret with it.

   The test types five characters without ever clicking again. A field that
   remounts keeps only the last one — or none — and focus moves to <body>.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('');
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  if (!login.token) { console.error('login failed'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), login.token);
  await page.goto(`${UI}/vendors/new`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  /* Open every collapsed section — PAN and the bank fields are behind them. */
  const opened = await page.evaluate(() => {
    const before = document.querySelectorAll('input').length;
    [...document.querySelectorAll('button')]
      .filter(b => /Tax|Bank|Contact|Terms|More|details/i.test(b.innerText))
      .forEach(b => b.click());
    return { before };
  });
  await sleep(1200);
  const inputCount = await page.evaluate(() => document.querySelectorAll('input').length);
  ok(inputCount > opened.before,
    `the collapsible sections open (${opened.before} → ${inputCount} fields)`);

  /* Type WITHOUT clicking again. This is the whole test. */
  const typeInto = async (placeholder, text, label) => {
    const sel = `input[placeholder="${placeholder}"]`;
    const el = await page.$(sel);
    if (!el) { ok(false, `${label}: field not found (placeholder "${placeholder}")`); return; }
    await el.click();
    let lostFocus = 0;
    for (const ch of text) {
      await page.keyboard.type(ch);
      await sleep(140);
      const focused = await page.evaluate(s => document.activeElement === document.querySelector(s), sel);
      if (!focused) lostFocus++;
    }
    const value = await page.evaluate(s => document.querySelector(s)?.value ?? '', sel);
    ok(value === text && lostFocus === 0,
      `${label}: typed "${text}" → field holds "${value}"` +
      (lostFocus ? `, focus lost ${lostFocus}/${text.length} keystrokes` : ', focus never lost'));
  };

  console.log('\n  ── typing without clicking again ──');
  await typeInto('AABCN1234M', 'AABCN1234M', 'PAN');
  await typeInto('HDFC Bank', 'HDFC Bank', 'Bank name');
  await typeInto('HDFC0001234', 'HDFC0001234', 'IFSC');
  await typeInto('As printed on the cheque', 'Kalinga Board Co', 'Account holder');
  /* A field that was never broken, as the control. */
  await typeInto('Kalinga Particle Board Co', 'Test Vendor', 'Company name (control)');

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 90) : ''}`);
  await browser.close();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
