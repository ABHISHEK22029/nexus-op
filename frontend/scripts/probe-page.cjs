#!/usr/bin/env node
/* Dump what a page actually shows, plus every request it made.
   Usage: node scripts/probe-page.cjs /dashboard */
const puppeteer = require('puppeteer');
const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const route = process.argv[2] || '/dashboard';

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.UI_EMAIL, password: process.env.UI_PASSWORD }),
  })).json().then(d => d.token);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const calls = [];
  page.on('response', r => { if (r.url().startsWith(API)) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });
  page.on('console', m => { if (m.type() === 'error') console.log('  CONSOLE ERROR:', m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log('  PAGE ERROR:', String(e).slice(0, 200)));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  /* Set the project too. Without it the app falls back to "whichever sorts
     last", which is an empty test project — every project-scoped screen
     then reads as blank for reasons that have nothing to do with the page
     being probed. */
  await page.evaluate(([t, pid]) => {
    localStorage.setItem('nexus_token', t);
    if (pid) localStorage.setItem('nexus_active_project', pid);
  }, [token, process.env.PROJECT_ID || '']);
  await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));

  const out = await page.evaluate(() => ({
    text: document.querySelector('#root')?.innerText || '',
    tables: document.querySelectorAll('table').length,
    rows: document.querySelectorAll('tbody tr').length,
    cards: document.querySelectorAll('.card, .stat-card, .kpi-card').length,
    spinners: document.querySelectorAll('.spinner, .loading, [class*=skeleton]').length,
  }));

  console.log(`\n─── ${route} ───`);
  console.log(`tables ${out.tables} · tbody rows ${out.rows} · cards ${out.cards} · spinners ${out.spinners}\n`);
  console.log('VISIBLE TEXT:\n' + out.text.split('\n').map(l => '  | ' + l).join('\n'));
  console.log('\nAPI CALLS:');
  calls.forEach(c => console.log('  ' + c));
  await browser.close();
})();
