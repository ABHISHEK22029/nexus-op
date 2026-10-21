#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial, as a new person meets it.

   1. On the first sign-in it opens by itself, with the welcome and the six
      steps of a first sale; on the next sign-in it does not.
   2. The ▶ Guide button sits at the top left under the logo, says how many
      steps are done, and opens the tutorial again.
   3. Show me opens the first step's screen; a card says what to do there.
   4. Steps tick themselves off from the company's real data, the first
      sale moves on to the next step by itself, and Show me points at the
      button to press. (scripts/test-tutorial-walkthrough.cjs does every
      step by hand.)
   5. An invited Sales person sees only the steps their role can do.
   6. On a phone: the button is there, and the panel fits the screen.
   No page errors along the way.

   Its own throwaway company (tutor-*@example.test), removed at the end.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-tutorial-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tutor Owner', email: `tutor-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const T = reg.token;
  const ids = [reg.user?.id];
  const api = async (m, u, b, tok = T) => {
    const r = await fetch(`${API}${u}`, { method: m, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${m} ${u} → ${r.status} ${j.error || ''}`);
    return j;
  };
  let browser;
  const errs = [];
  try {
    await api('PUT', '/company-profile', { name: `Tutor Fab ${stamp}`, address: 'Hyderabad' });
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });
    const waitFor = (fn, ms = 12000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
    const panelOpen = () => page.evaluate(() => !!document.querySelector('.tut-panel'));
    const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);

    console.log('\n  ── 1. the first sign-in, and the next');
    await page.goto(`${UI}/login`, { waitUntil: 'networkidle2' });
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('nexus_tour_pending', '1'); }, T, reg.user);
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    ok(await waitFor(() => !!document.querySelector('.tut-panel')), 'on the first sign-in the tutorial opens by itself');
    await waitFor(() => /of \d+ done/.test(document.querySelector('.tut-progress')?.innerText || ''));
    const panel = await text('.tut-panel');
    ok(/Make your first sale in about 3 minutes/.test(panel) && /Start/.test(panel), 'with the welcome (“Make your first sale in about 3 minutes”) and a Start button');
    ok(/0 of 6 done/.test(panel), `the first sale is 6 steps, none done yet (“${(panel.match(/\d+ of \d+ done/) || [''])[0]}”)`);
    ok(['Your first sale', 'When you are ready'].every(c => panel.toUpperCase().includes(c.toUpperCase())) && panel.split('Show me').length - 1 === 11,
      'the first sale, then the rest under “When you are ready”: 11 steps in all');
    await page.click('.tut-panel .tut-x');
    ok(!(await panelOpen()), 'it closes');
    await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
    ok(!(await panelOpen()), 'and on the next visit it does not open by itself');

    console.log('\n  ── 2. the ▶ Guide button at the top left');
    const btn = await page.evaluate(() => {
      const b = document.querySelector('.nav-rail-guide'); if (!b) return null;
      const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, label: b.getAttribute('aria-label') };
    });
    ok(btn && btn.x < 80 && btn.y < 120, `it sits at the top left, under the logo (${btn ? `${Math.round(btn.x)}, ${Math.round(btn.y)}` : 'missing'})`);
    ok(/0 of 6 steps done/.test(btn?.label || ''), `and says how far you have got (“${btn?.label}”)`);
    await page.click('.nav-rail-guide');
    ok(await waitFor(() => !!document.querySelector('.tut-panel')), 'pressing it opens the tutorial again');

    console.log('\n  ── 3. Show me');
    const started = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.tut-panel button')].find(x => /Show me/.test(x.textContent));
      b?.click(); return !!b;
    });
    ok(started && await waitFor(() => location.pathname === '/customers'), 'Show me on the first step opens Customers');
    ok(await waitFor(() => /Step 1 of 6 · Add a customer/.test(document.querySelector('.tut-coach')?.innerText || '')),
      'a card in the corner says which step this is and what to do');
    ok(await waitFor(() => { const s = document.querySelector('.tut-spot'); return !!s && /Add Customer/.test(s.textContent); }, 8000),
      'and points at Add Customer with a pulse');

    console.log('\n  ── 4. steps tick themselves off');
    await api('POST', '/customers', { name: `BuildRight ${stamp}`, state: 'Telangana', address: 'Hyderabad' });
    ok(await waitFor(() => /Done: Add a customer/.test(document.querySelector('.tut-coach')?.innerText || ''), 15000),
      'adding a customer turns the card to Done');
    ok(/Next: Add a product/.test(await text('.tut-coach')) && /Moving on in a moment/.test(await text('.tut-coach')),
      'it names the next step and says it is moving on');
    ok(await waitFor(() => location.pathname === '/items', 6000), 'and moves on to Items by itself');
    ok(await waitFor(() => { const s = document.querySelector('.tut-spot'); return !!s && /Add SKU/.test(s.textContent); }, 8000),
      'pointing at Add SKU');
    await api('POST', '/skus', { name: `Bracket ${stamp}`, unit: 'nos', price: 1500 });
    ok(await waitFor(() => /Done: Add a product/.test(document.querySelector('.tut-coach')?.innerText || ''), 15000),
      'adding a product ticks that step off too');
    ok(await waitFor(() => /2 of 6 steps done/.test(document.querySelector('.nav-rail-guide')?.getAttribute('aria-label') || '')),
      'and the Guide button now says 2 of 6');
    await waitFor(() => location.pathname === '/sales-quotations', 6000);
    await page.click('.nav-rail-guide');
    await waitFor(() => !!document.querySelector('.tut-panel'));
    const doneRows = await page.evaluate(() => [...document.querySelectorAll('.tut-step.is-done .tut-step-title')].map(e => e.textContent));
    ok(doneRows.length === 2 && doneRows.some(t => /customer/i.test(t)), `the panel shows both ticked (${doneRows.join(', ')})`);
    await page.evaluate(() => [...document.querySelectorAll('.tut-step')].find(r => /Add a vendor/.test(r.querySelector('.tut-step-title')?.textContent || ''))?.querySelector('button')?.click());
    ok(await waitFor(() => location.pathname === '/vendors'), 'Show me on a later step goes straight to it');
    ok(await waitFor(() => /Add vendor/.test(document.querySelector('.tut-spot')?.textContent || ''), 8000), 'pointing at Add vendor');
    ok(/When you are ready · 2 of 5 · Add a vendor/.test(await text('.tut-coach')), 'its card counts it among the steps for later');
    await page.evaluate(() => document.querySelector('.tut-coach .tut-coach-x')?.click());
    ok(!(await page.evaluate(() => !!document.querySelector('.tut-coach'))), 'the card can be put away');

    console.log('\n  ── 5. an invited Sales person');
    const sales = await api('POST', '/admin/users', { name: 'Ravi Sales', email: `tutor-sales-${stamp}@example.test`, password: 'testpassword123', role: 'Sales' });
    ids.push((sales.user || sales).id);
    const sLogin = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `tutor-sales-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    /* Their own browser profile: a second tab would share the owner's sign-in. */
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    page2.on('pageerror', e => errs.push(e.message));
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.goto(`${UI}/login`, { waitUntil: 'networkidle2' });
    await page2.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('nexus_tour_pending', '1'); }, sLogin.token, sLogin.user);
    await page2.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    await page2.waitForFunction(() => /of \d+ done/.test(document.querySelector('.tut-progress')?.innerText || ''), { timeout: 12000 }).catch(() => {});
    const sp = await page2.evaluate(() => ({ text: document.querySelector('.tut-panel')?.innerText || '', n: document.querySelectorAll('.tut-step').length }));
    ok(sp.n > 0 && sp.n < 11 && !/Invite a colleague/.test(sp.text), `a Sales person sees only what their role can do (${sp.n} steps; no team invites)`);
    await ctx2.close();

    console.log('\n  ── 6. on a phone');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' }); await sleep(800);
    const pb = await page.evaluate(() => { const b = document.querySelector('.nav-rail-guide'); const r = b?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width } : null; });
    ok(pb && pb.x < 60 && pb.y < 120, 'the Guide button is there at the top left');
    await page.click('.nav-rail-guide');
    await waitFor(() => !!document.querySelector('.tut-panel'));
    const fit = await page.evaluate(() => { const r = document.querySelector('.tut-panel').getBoundingClientRect(); return { right: r.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
    ok(fit.right <= fit.w && fit.sw <= fit.w + 1, `the panel fits the screen (${Math.round(fit.right)} of ${fit.w}px)`);
    /* The screens the steps open: the button a step points at is on screen,
       not off to the right of a header that does not wrap. */
    const offscreen = [];
    for (const s of [['/customers', /Add Customer/], ['/items', /Add SKU/], ['/sales-quotations', /New Quotation/], ['/vendors', /Add vendor/i], ['/purchase-orders', /Create PO/], ['/users', /Add person/]]) {
      await page.goto(`${UI}${s[0]}`, { waitUntil: 'networkidle2' });
      await page.waitForFunction((src) => [...document.querySelectorAll('.app-page button, .app-page a')].some(x => x.offsetParent && new RegExp(src).test(x.textContent)),
        { timeout: 8000 }, s[1].source).catch(() => {});
      await sleep(300);
      const r = await page.evaluate((src) => {
        const re = new RegExp(src);
        const b = [...document.querySelectorAll('.app-page button, .app-page a')].find(x => x.offsetParent && re.test(x.textContent));
        const m = document.querySelector('.app-main');
        return { right: b ? b.getBoundingClientRect().right : null, w: innerWidth, over: m ? m.scrollWidth - m.clientWidth : 0 };
      }, s[1].source);
      if (r.right == null || r.right > r.w || r.over > 1) offscreen.push(`${s[0]} (${r.right == null ? 'no button' : `${Math.round(r.right)}px`}, ${r.over}px over)`);
    }
    ok(offscreen.length === 0, `each step's button is on screen, nothing scrolls sideways${offscreen.length ? `: ${offscreen.join(', ')}` : ''}`);

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    const n = await purge(ids.filter(Boolean));
    console.log(`\n   ✅ test accounts removed (${n})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
