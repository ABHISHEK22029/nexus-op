#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-theme-contrast — pages that only work in one theme.

   The app has a light/dark token system, but a dozen pages hardcode dark
   colours in Tailwind classes (`text-white/90`, `bg-[#111113]`,
   `text-gray-500`). In light mode those render white text on a cream page,
   or a near-black card on a cream page — which is what "the inventory page
   looks shitty" actually means.

   This loads each page in LIGHT mode and measures the real computed colours,
   so the answer is a contrast ratio rather than an opinion.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';

const ROUTES = [
  '/inventory', '/purchase-orders', '/grn', '/indent', '/boq',
  '/mb', '/milestones', '/projects', '/bills', '/customers', '/vendors',
];

/* Relative luminance → contrast ratio, the WCAG way. Text below 3:1 is
   unreadable for anyone; below 4.5:1 fails AA for body copy. */
const lum = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const l1 = lum(...a), l2 = lum(...b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const parse = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.UI_EMAIL, password: process.env.UI_PASSWORD }),
  })).json().then(d => d.token);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => {
    localStorage.setItem('nexus_token', t);
    localStorage.setItem('nexus_theme', 'light');   // force light
  }, token);

  console.log('\n  page                low-contrast text   dark boxes on light   verdict');
  console.log('  ' + '─'.repeat(72));

  const bad = [];
  for (const route of ROUTES) {
    await page.goto(`${UI}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1300));

    const found = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const theme = document.documentElement.getAttribute('data-theme') || 'system';
      const pageBg = getComputedStyle(document.querySelector('.app-page') || document.body).backgroundColor;
      const out = { theme, pageBg, faint: [], darkBoxes: 0, overlap: 0 };

      const els = [...document.querySelectorAll('.app-page *')].slice(0, 900);
      for (const el of els) {
        const cs = getComputedStyle(el);
        const txt = (el.textContent || '').trim();
        // A box whose own background is near-black while the page is light.
        const bg = cs.backgroundColor;
        const m = (bg.match(/\d+/g) || []).map(Number);
        if (m.length >= 3 && m[0] < 40 && m[1] < 40 && m[2] < 40 && (m[3] === undefined || m[3] > 0.5)) {
          if (el.getBoundingClientRect().width > 60) out.darkBoxes++;
        }
        /* Text colour vs the background actually behind it.

           The first version took the element's OWN background — so a badge
           with `rgba(245,158,11,0.12)` was measured as amber text on an amber
           background and reported as unreadable, when in reality it is a
           faint tint over white and perfectly legible. That produced 76 false
           alarms on the Customers page, which renders correctly.

           Backgrounds have to be COMPOSITED: walk up until the accumulated
           alpha is opaque, blending each layer as you go. */
        if (txt && txt.length > 1 && el.children.length === 0) {
          const layers = [];
          let node = el;
          while (node && node !== document.documentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            const p = (bg.match(/[\d.]+/g) || []).map(Number);
            if (p.length >= 3) {
              const a = p.length > 3 ? p[3] : 1;
              if (a > 0) { layers.push([p[0], p[1], p[2], a]); if (a >= 0.999) break; }
            }
            node = node.parentElement;
          }
          // Composite back-to-front over white as the final backstop.
          let acc = [255, 255, 255];
          for (let i = layers.length - 1; i >= 0; i--) {
            const [r, g, b, a] = layers[i];
            acc = [r * a + acc[0] * (1 - a), g * a + acc[1] * (1 - a), b * a + acc[2] * (1 - a)];
          }
          out.faint.push({ color: cs.color, behind: acc.map(Math.round), text: txt.slice(0, 28) });
        }
      }
      /* An input whose left padding is smaller than the icon sitting on it.

         Restricted to TEXT-LIKE inputs with an ABSOLUTELY POSITIONED icon.
         The first version took any <svg> anywhere in the parent, so every
         row checkbox on a table with a trash icon counted as an overlap —
         eight false alarms on the Vendors page, which is fine. */
      for (const input of document.querySelectorAll('input')) {
        if (!/^(text|search|email|tel|number|)$/.test(input.type)) continue;
        const br = input.getBoundingClientRect();
        if (br.width < 80) continue;                       // not a search box
        const icons = [...(input.parentElement?.querySelectorAll('svg') || [])]
          .filter(s => getComputedStyle(s).position === 'absolute'
                    || getComputedStyle(s.parentElement || s).position === 'absolute');
        for (const icon of icons) {
          const ir = icon.getBoundingClientRect();
          if (ir.left < br.left + br.width / 2) {          // a LEADING icon
            const padLeft = parseFloat(getComputedStyle(input).paddingLeft) || 0;
            if (ir.right > br.left + padLeft + 1) { out.overlap++; break; }
          }
        }
      }
      return out;
    });

    let faintCount = 0, worst = 99, worstText = '';
    for (const f of found.faint) {
      const fg = parse(f.color);
      if (fg.length < 3 || !f.behind || f.behind.length < 3) continue;
      const r = ratio(fg, f.behind);
      /* 3:1 is the floor for large text and UI elements. Below it, nobody
         can read the thing regardless of eyesight — that is the bar worth
         failing on, rather than the stricter 4.5:1 for body copy which would
         flag every deliberately-muted caption in the product. */
      if (r < 3) { faintCount++; if (r < worst) { worst = r; worstText = f.text; } }
    }

    const verdict = (faintCount > 3 || found.darkBoxes > 0 || found.overlap > 0) ? '🔴 broken in light' : '✅';
    if (verdict !== '✅') bad.push({ route, faintCount, darkBoxes: found.darkBoxes, overlap: found.overlap, worst, worstText });
    console.log(`  ${route.padEnd(20)}${String(faintCount).padStart(10)}${String(found.darkBoxes).padStart(19)}${String(found.overlap).padStart(8)} overlap   ${verdict}`);
  }

  await browser.close();
  console.log('\n' + '  ' + '─'.repeat(72));
  if (!bad.length) console.log('\n  ✅ every page reads correctly in light mode\n');
  else {
    console.log(`\n  ${bad.length} page(s) written for dark mode only:\n`);
    for (const b of bad) {
      console.log(`   ${b.route}`);
      if (b.faintCount) console.log(`      ${b.faintCount} unreadable text node(s), worst ${b.worst.toFixed(1)}:1 — "${b.worstText}"`);
      if (b.darkBoxes) console.log(`      ${b.darkBoxes} near-black box(es) on a cream page`);
      if (b.overlap) console.log(`      ${b.overlap} input(s) with an icon sitting on the text`);
    }
    console.log('');
  }
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
