#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   test-configurator-ui — the tiles, and the people directory behind them.

   Checks what an administrator actually needs from this screen: that the
   tiles say what they are for and carry a live count, that Users & roles
   shows enough to recognise a person rather than just administer them, and
   that the access reading is present — the number that makes an
   over-privileged account visible without opening it.
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

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
  await page.goto(`${UI}/configurator`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2200));

  /* ── the tile home ── */
  /* The full text AND a separate short label, because truncating for the
     printed list also truncated what the assertion looked at — the Users
     tile's "9 people" fell off the end of a 110-character slice and was
     reported as a missing count on a tile that had one. */
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(b => /Users & roles|Roles & permissions|Categories|Change history|Document numbering|Approvals/.test(b.innerText))
      .map(b => {
        const parts = b.innerText.split('\n').map(x => x.trim()).filter(Boolean);
        return {
          label: parts[0] || '',
          stat: parts[parts.length - 1] || '',
          full: b.innerText.replace(/\s+/g, ' ').trim(),
          disabled: b.disabled,
        };
      }));

  console.log('\n─── tiles ───');
  tiles.forEach(t => console.log(`   ${t.disabled ? '🔒' : '  '} ${t.label.padEnd(22)} ${t.stat}`));

  step('the configurator opens as tiles, not a tab strip', tiles.length >= 4,
    `${tiles.length} tile(s)`);
  /* Change history has no count by design — "audit trail" is the right
     answer for a log, and a number there would invite reading it as a
     backlog. So every OTHER built tile must carry one. */
  const built = tiles.filter(t => !t.disabled);
  const counted = built.filter(t => /\d/.test(t.stat));
  step('every built tile carries a live count', counted.length === built.length - 1,
    counted.map(t => `${t.label}: ${t.stat}`).join(' · '));
  step('unbuilt tiles are shown, not hidden', tiles.some(t => t.disabled),
    `${tiles.filter(t => t.disabled).length} marked not built yet`);

  /* ── open Users & roles ── */
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Users & roles/.test(x.innerText));
    if (!b) return false; b.click(); return true;
  });
  await new Promise(r => setTimeout(r, 2000));

  const dir = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('th')].map(h => h.innerText.trim()).filter(Boolean);
    const rows = document.querySelectorAll('tbody tr').length;
    const text = document.body.innerText;
    return {
      heads, rows,
      hasSearch: !!document.querySelector('input[aria-label="Search people"]'),
      hasSort: !!document.querySelector('select[aria-label="Sort by"]'),
      accessWords: (text.match(/Full access|Broad|Limited|Read only/g) || []).length,
      canChange: (text.match(/can change \d+ of \d+/g) || []).length,
      roleSelects: document.querySelectorAll('tbody select').length,
    };
  });

  console.log('\n─── users & roles ───');
  console.log(`   columns : ${dir.heads.join(' · ')}`);
  console.log(`   rows    : ${dir.rows}`);

  step('Users & roles opens', opened && dir.rows > 0, `${dir.rows} people listed`);
  step('it shows the works number and what they do',
    dir.heads.some(h => /works/i.test(h)) && dir.heads.some(h => /what they do/i.test(h)),
    dir.heads.join(' · '));
  step('it shows how much access each person has',
    dir.accessWords >= dir.rows && dir.canChange >= dir.rows,
    `${dir.accessWords} access badge(s), ${dir.canChange} "can change N of M" reading(s) for ${dir.rows} rows`);
  step('roles are changed inline, not on another screen',
    dir.roleSelects >= dir.rows - 1,     // the signed-in admin's own row is disabled, not absent
    `${dir.roleSelects} role dropdown(s)`);
  step('it has a search box and a sort', dir.hasSearch && dir.hasSort);

  /* ── search actually narrows ── */
  const before = dir.rows;
  await page.evaluate(() => {
    const i = document.querySelector('input[aria-label="Search people"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'zzzz-nobody');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 700));
  const after = await page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr').length,
    saysNobody: /Nobody matches/.test(document.body.innerText),
  }));
  step('search narrows the list and explains an empty result',
    after.rows < before && after.saysNobody,
    `${before} → ${after.rows} rows, "Nobody matches" ${after.saysNobody ? 'shown' : 'MISSING'}`);

  /* ── sort by access puts the widest first ── */
  await page.evaluate(() => {
    const i = document.querySelector('input[aria-label="Search people"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.querySelector('select[aria-label="Sort by"]');
    const ss = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    ss.call(s, 'access'); s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));
  const sorted = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].slice(0, 3)
      .map(r => (r.innerText.match(/can change (\d+) of/) || [])[1]).map(Number));
  step('sorting by access puts the widest accounts first',
    sorted.length >= 2 && sorted[0] >= sorted[sorted.length - 1],
    `top rows can change: ${sorted.join(', ')}`);

  /* ── categories tile ── */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /All settings/.test(x.innerText));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^Categories/.test(x.innerText.trim()));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 1600));
  const cats = await page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr').length,
    hasBuySell: /What we buy/.test(document.body.innerText) && /What we sell/.test(document.body.innerText),
    text: document.body.innerText.slice(0, 0),
  }));
  step('Categories opens and separates what we buy from what we sell',
    cats.hasBuySell && cats.rows > 0, `${cats.rows} categor(ies) listed`);

  step('no JavaScript errors', errors.length === 0, errors[0] || '');

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n  ${pass} of ${results.length} passed\n`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
