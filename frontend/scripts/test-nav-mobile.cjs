#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The menu on a phone.

   At 900px and below the section menu floats over the page. It used to open
   on every screen and stay open after a choice, so every page arrived
   hidden behind it. Now: closed when a page opens; a module icon opens that
   module's screens; choosing one closes it; a tap outside closes it. The
   desktop keeps its menu beside the page.

     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5175 node scripts/test-nav-mobile.cjs
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
    body: JSON.stringify({ name: 'Nav', email: `navm-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nav Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' }) });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('maks_nav_panel_open'); }, reg.token);
    const panel = () => page.evaluate(() => !!document.querySelector('.nav-panel'));

    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${UI}/vendors`, { waitUntil: 'networkidle2' });
    await sleep(500);
    ok(!(await panel()), 'on a phone, a page opens with the menu closed');
    await page.click('.nav-rail-item[title="Sales"]');
    await sleep(600);
    ok(await panel(), 'tapping a module icon shows its screens');
    const target = await page.evaluate(() => {
      const a = [...document.querySelectorAll('.nav-panel-item')].find(x => /Invoices/.test(x.textContent));
      a?.click();
      return a?.getAttribute('href');
    });
    await sleep(800);
    ok(target && page.url().endsWith(target) && !(await panel()), `choosing a screen goes there and closes the menu (${target})`);
    await page.click('.nav-panel-reopen');
    await sleep(300);
    ok(await panel(), 'the tab on the edge opens it again');
    await page.mouse.click(370, 400);
    await sleep(300);
    ok(!(await panel()), 'a tap outside the menu closes it');
    await page.click('.nav-panel-reopen');
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(200);
    ok(!(await panel()), 'Escape closes it');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `no sideways scroll (${overflow}px)`);

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${UI}/vendors`, { waitUntil: 'networkidle2' });
    await sleep(500);
    ok(await panel(), 'on a desktop the menu sits beside the page, open');
    const beside = await page.evaluate(() => getComputedStyle(document.querySelector('.nav-panel')).position !== 'fixed');
    ok(beside, 'and it is part of the layout, not floating over the page');
    ok(!errs.length, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await purge([reg.user?.id]).catch(() => 0);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
