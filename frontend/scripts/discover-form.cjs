#!/usr/bin/env node
/* Open a page, click whatever opens its create form, and dump every control
   with the text a person would use to find it. Reading six large JSX files
   guesses at selectors; this reports what is actually in the DOM.

   Usage: node scripts/discover-form.cjs /sales-quotations "New Quotation" */
const puppeteer = require('puppeteer');
const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const route = process.argv[2];
const openBtn = process.argv[3] || null;

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.UI_EMAIL, password: process.env.UI_PASSWORD }),
  })).json().then(d => d.token);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', e => console.log('  PAGE ERROR:', String(e).slice(0, 160)));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([t, p]) => {
    localStorage.setItem('nexus_token', t);
    if (p) localStorage.setItem('nexus_active_project', p);
  }, [token, process.env.PROJECT_ID || '']);
  await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1200));

  const buttons = () => page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], [role=button]')]
      .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
      .filter(t => t && t.length < 50));

  console.log(`\n─── ${route} : buttons before opening the form ───`);
  console.log('  ' + [...new Set(await buttons())].join('  |  '));

  if (openBtn) {
    const ok = await page.evaluate((label) => {
      const b = [...document.querySelectorAll('button, a[href], [role=button]')]
        .find(x => new RegExp(label, 'i').test((x.innerText || '').trim()));
      if (!b) return false; b.click(); return true;
    }, openBtn);
    console.log(`\n  clicked "${openBtn}": ${ok ? 'yes' : 'NOT FOUND'}`);
    await new Promise(r => setTimeout(r, 1400));
  }

  const form = await page.evaluate(() => {
    const labelFor = (el) => {
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.innerText.trim();
      }
      let n = el.closest('label');
      if (n) return n.innerText.trim().split('\n')[0];
      // Common pattern here: <div><span>Label</span><input/></div>
      let p = el.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const t = [...p.childNodes]
          .filter(c => c.nodeType === 1 && c !== el && !c.contains(el))
          .map(c => (c.innerText || '').trim()).find(Boolean);
        if (t && t.length < 60) return t.split('\n')[0];
      }
      return '';
    };
    return [...document.querySelectorAll('input, select, textarea')].map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      label: labelFor(el),
      required: el.required,
      options: el.tagName === 'SELECT'
        ? [...el.options].map(o => o.text.trim()).slice(0, 8) : undefined,
    }));
  });

  console.log(`\n─── form controls (${form.length}) ───`);
  form.forEach((f, i) => {
    const bits = [
      `${String(i).padStart(2)}. ${f.tag}${f.type ? '[' + f.type + ']' : ''}`.padEnd(20),
      (f.label || f.placeholder || f.name || '(no label)').slice(0, 44).padEnd(46),
      f.name ? `name=${f.name}` : '',
      f.required ? 'REQUIRED' : '',
    ];
    console.log('  ' + bits.filter(Boolean).join(' '));
    if (f.options) console.log('       options: ' + f.options.join(' | '));
  });

  console.log(`\n─── buttons now on screen ───`);
  console.log('  ' + [...new Set(await buttons())].join('  |  '));

  await browser.close();
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
