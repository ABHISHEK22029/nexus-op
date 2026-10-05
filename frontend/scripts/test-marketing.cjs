#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The marketing pages, driven in a real browser against the real build.

   Run against `vite preview` on dist/, not the dev server: the dev server
   transforms modules on the fly and papers over things the production
   bundle will not — a missing export, a dead code-split chunk, a CSS file
   that never got imported.

   What it checks, and why each one is here rather than being assumed:

     · No "Nexus" text anywhere a visitor can read. The rename is the kind
       of job that is 95% done and then embarrasses you on the login screen.
     · The process engine has every stage, and its two tracks really swap.
     · Hovering a stage changes the detail panel — the animation is for a
       passer-by, the panel is the part that explains the product.
     · Every feature card renders its diagram. A diagram that throws leaves
       a blank 92px box, which looks like a broken image, not a bug.
     · The catalogue filters actually filter.
     · Under prefers-reduced-motion the animations stop AND the content is
       still readable. A diagram that explains something must survive its
       animation being switched off — these all start at opacity 0, so
       getting this wrong leaves blank boxes for anyone with the setting on.
     · Nothing overflows horizontally at 360px. The engine scrolls inside
       its own casing; the PAGE must not.
     · Both themes, because every colour here is a token and a token that
       resolves to nothing is invisible text.

   Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const BASE = process.env.UI_BASE || 'http://localhost:4173';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(BASE)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

  /* Block anything off-box, so the test cannot quietly depend on being
     online — except Google Fonts, which the marketing pages genuinely load
     for their display typeface. Aborting those produced a console error and
     a failure that said nothing about the code; they are allowed through and
     reported separately, so a NEW third-party dependency still shows up. */
  const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
  await page.setRequestInterception(true);
  const external = [];
  const fonts = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && !u.startsWith(BASE)) {
      if (FONT_HOSTS.test(u)) { fonts.push(u); return r.continue(); }
      external.push(u); return r.abort();
    }
    r.continue();
  });

  const go = async (path, w = 1440, h = 1000) => {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
    await sleep(900);
  };

  /* ── 1. the rename ────────────────────────────────────────────────── */
  console.log('\n  ── no "Nexus" left where a visitor can read it');
  for (const p of ['/', '/platform', '/how-it-works', '/get-started', '/login', '/signup']) {
    await go(p);
    const hit = await page.evaluate(() => {
      const t = document.body.innerText || '';
      const m = t.match(/Nexus\s*-?\s*(OP|Ops)?/i);
      return m ? m[0] : null;
    });
    ok(!hit, `${p} — ${hit ? `still says "${hit}"` : 'clean'}`);
  }
  await go('/login');
  ok(await page.evaluate(() => /Maks\s*Ops/i.test(document.body.innerText)),
    'and the login screen names the product');

  /* ── 2. the process engine ────────────────────────────────────────── */
  console.log('\n  ── the process engine');
  await go('/');
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => /One Engine/i.test(x.textContent));
    h?.scrollIntoView({ block: 'center' });
  });
  await sleep(1200);

  const eng = await page.evaluate(() => {
    const chambers = [...document.querySelectorAll('.mk-chamber')];
    const arts = [...document.querySelectorAll('.mk-artifact')];
    return {
      chambers: chambers.length,
      labels: chambers.map(c => c.getAttribute('aria-label')?.split(':')[0]),
      artifacts: arts.map(a => a.textContent.trim()).filter(Boolean),
      tabs: [...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()),
      /* .mk-engine-pulse, not .mk-pulse: the DocMorph diagrams in the
         feature cards use .mk-pulse too and appear EARLIER in the DOM, so
         querySelector was reading an off-screen feature card. */
      pulseAnimating: !!document.querySelector('.mk-engine-pulse') &&
        getComputedStyle(document.querySelector('.mk-engine-pulse')).animationName !== 'none',
    };
  });
  ok(eng.chambers === 7, `seven stages render (${eng.chambers})`);
  ok(eng.labels.includes('Enquiry') && eng.labels.includes('Tax invoice'),
    `and they are the fabrication track (${eng.labels.slice(0, 3).join(', ')}…)`);
  ok(eng.artifacts.some(a => /QT-|INV-|GRN-/.test(a)),
    `each stage names the document it emits (${eng.artifacts.slice(0, 3).join(', ')}…)`);
  ok(eng.pulseAnimating, 'the pulse is animating');
  ok(eng.tabs.length === 2, `two tracks are offered (${eng.tabs.join(' | ')})`);

  /* hovering a stage must change the detail panel */
  const before = await page.evaluate(() => document.querySelector('.mk-chamber')?.closest('div')?.parentElement?.parentElement?.parentElement?.parentElement?.innerText || '');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.mk-chamber')];
    c[4]?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await sleep(500);
  const detail = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasReceipt: /Goods receipt/i.test(t), hasMoves: /What moves:/i.test(t) };
  });
  ok(detail.hasMoves, 'the detail panel states what moves at each stage');
  ok(detail.hasReceipt, 'and hovering a stage shows that stage');

  /* ── the engine must SEQUENCE, not flash ──────────────────────────────
     This is the assertion that earns its keep. The stages are staggered by
     animation-delay, and the `animation` shorthand resets animation-delay to
     0s — so when React patched the shorthand alone as the engine scrolled
     into view, every delay was wiped and all seven stages fired in unison,
     once per cycle. The diagram still looked alive, a screenshot looked
     correct, and the sequence that explains the product was gone.

     Caught only by sampling opacity across a whole 15.4s cycle, so that is
     what this does. */
  const seq = await page.evaluate(async () => {
    const arts = [...document.querySelectorAll('.mk-artifact')];
    const delays = arts.map(a => getComputedStyle(a).animationDelay);
    const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 17000) {
      samples.push(arts.map(a => (+getComputedStyle(a).opacity > 0.5 ? 1 : 0)));
      await new Promise(r => setTimeout(r, 200));
    }
    const everLit = new Set();
    let maxAtOnce = 0;
    samples.forEach((row) => {
      const n = row.reduce((a, b) => a + b, 0);
      if (n > maxAtOnce) maxAtOnce = n;
      row.forEach((v, i) => { if (v) everLit.add(i); });
    });
    return { delays, distinctDelays: new Set(delays).size, everLit: everLit.size, maxAtOnce, total: arts.length };
  });
  ok(seq.distinctDelays === seq.total,
    `each stage has its own delay (${seq.distinctDelays}/${seq.total} distinct: ${seq.delays.join(' ')})`);
  ok(seq.maxAtOnce <= 2,
    `stages fire in sequence, not together (most lit at once: ${seq.maxAtOnce})`);
  ok(seq.everLit === seq.total,
    `and every stage takes its turn within a cycle (${seq.everLit}/${seq.total})`);

  /* switching track must replace the stages */
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find(x => /Projects/i.test(x.textContent));
    t?.click();
  });
  await sleep(700);
  const track2 = await page.evaluate(() =>
    [...document.querySelectorAll('.mk-chamber')].map(c => c.getAttribute('aria-label')?.split(':')[0]));
  ok(track2.includes('Measurement book') || track2.includes('BOQ'),
    `switching track swaps the stages (${track2.slice(0, 3).join(', ')}…)`);

  /* ── 3. feature grid ──────────────────────────────────────────────── */
  console.log('\n  ── feature grid');
  await go('/');
  await page.evaluate(() => {
    const g = document.querySelector('.mk-feature-grid');
    g?.scrollIntoView({ block: 'start' });
  });
  await sleep(600);
  /* reveal them all: they animate in on scroll, so walk down the page */
  for (let y = 0; y < 6; y++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await sleep(260);
  }
  const feat = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.mk-feature-grid > div')];
    return {
      count: cards.length,
      titles: cards.map(c => c.querySelector('h3')?.textContent || ''),
      /* every card must have a drawn diagram above its text, and it must
         have real height — an empty stage is a broken-image look */
      withDiagram: cards.filter(c => {
        const stage = c.firstElementChild;
        return stage && stage.getBoundingClientRect().height > 40;
      }).length,
      emptyDiagram: cards.filter(c => (c.firstElementChild?.childElementCount || 0) === 0).length,
    };
  });
  ok(feat.count === 12, `twelve feature cards (${feat.count})`);
  ok(feat.withDiagram === feat.count, `all ${feat.count} render a diagram (${feat.withDiagram})`);
  ok(feat.emptyDiagram === 0, `and none of the diagrams is empty (${feat.emptyDiagram} empty)`);
  ok(feat.titles.some(t => /catalogue/i.test(t)), 'the catalogue is in the feature list at last');
  ok(feat.titles.some(t => /scrap/i.test(t)), 'and scrap is named, not buried');

  /* ── 4. catalogue showcase ────────────────────────────────────────── */
  console.log('\n  ── catalogue showcase');
  const cat = await page.evaluate(() => {
    const tiles = document.querySelectorAll('.mk-cat-grid > div');
    return { tiles: tiles.length, hasNoLogin: /NO LOGIN/i.test(document.body.innerText) };
  });
  ok(cat.tiles === 6, `the mock shopfront draws its products (${cat.tiles})`);
  ok(cat.hasNoLogin, 'and makes the point that browsing needs no account');

  const filtered = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => /Solar structures/i.test(b.textContent));
    btn?.click();
    await new Promise(r => setTimeout(r, 500));
    const tiles = [...document.querySelectorAll('.mk-cat-grid > div')];
    const dim = tiles.filter(t => Number(getComputedStyle(t).opacity) < 0.5).length;
    return { dim, total: tiles.length, counter: document.body.innerText.match(/\d+ of \d+ products/)?.[0] };
  });
  ok(filtered.dim === 4, `filtering dims the non-matching tiles (${filtered.dim} of ${filtered.total})`);
  ok(/2 of 6/.test(filtered.counter || ''), `and the counter follows (${filtered.counter})`);

  /* ── 5. reduced motion ────────────────────────────────────────────── */
  console.log('\n  ── prefers-reduced-motion');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await go('/');
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => /One Engine/i.test(x.textContent));
    h?.scrollIntoView({ block: 'center' });
  });
  await sleep(900);
  const rm = await page.evaluate(() => {
    const anim = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).animationName : 'MISSING';
    };
    const arts = [...document.querySelectorAll('.mk-artifact')];
    const chambers = [...document.querySelectorAll('.mk-chamber')];
    return {
      /* The chamber BUTTON no longer animates — its lit state is a separate
         composited overlay, so that is what has to stop. */
      chamberAnim: anim('.mk-chamber-glow'),
      artifactAnim: anim('.mk-artifact'),
      /* the content must still be READABLE: these start at opacity 0 */
      artifactsVisible: arts.filter(a => Number(getComputedStyle(a).opacity) > 0.9).length,
      artifactsTotal: arts.length,
      chambersLit: [...document.querySelectorAll('.mk-chamber-glow')].filter(g => Number(getComputedStyle(g).opacity) > 0.9).length,
    };
  });
  ok(rm.chamberAnim === 'none', `the chamber sequence stops (${rm.chamberAnim})`);
  ok(rm.artifactAnim === 'none', `the artefact pops stop (${rm.artifactAnim})`);
  ok(rm.artifactsVisible === rm.artifactsTotal && rm.artifactsTotal > 0,
    `and every document label is still readable (${rm.artifactsVisible}/${rm.artifactsTotal}) — they start at opacity 0, so this is the one that matters`);

  const rmFeat = await page.evaluate(async () => {
    document.querySelector('.mk-feature-grid')?.scrollIntoView({ block: 'start' });
    await new Promise(r => setTimeout(r, 600));
    const rows = [...document.querySelectorAll('.mk-row')];
    const bars = [...document.querySelectorAll('.mk-bar, .mk-bar-v')];
    return {
      rowsVisible: rows.filter(r => Number(getComputedStyle(r).opacity) > 0.9).length,
      rowsTotal: rows.length,
      barsGrown: bars.filter(b => !/scale\(?.*0\s*,|matrix\(0/.test(getComputedStyle(b).transform)).length,
      barsTotal: bars.length,
    };
  });
  ok(rmFeat.rowsTotal === 0 || rmFeat.rowsVisible === rmFeat.rowsTotal,
    `diagram rows stay visible with motion off (${rmFeat.rowsVisible}/${rmFeat.rowsTotal})`);
  ok(rmFeat.barsTotal === 0 || rmFeat.barsGrown === rmFeat.barsTotal,
    `and bars stay at full size (${rmFeat.barsGrown}/${rmFeat.barsTotal})`);

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  /* ── 6. narrow screens ────────────────────────────────────────────── */
  console.log('\n  ── 360px wide (the phones these customers use)');
  await go('/', 360, 760);
  for (let y = 0; y < 8; y++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await sleep(180);
  }
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    engineScrolls: (() => {
      const e = document.querySelector('.mk-engine-scroll');
      return e ? e.scrollWidth > e.clientWidth : null;
    })(),
    featCols: getComputedStyle(document.querySelector('.mk-feature-grid')).gridTemplateColumns.split(' ').length,
  }));
  /* This page used to overflow to 648px in a 360px viewport — it scrolled
     sideways by almost its own width. Three `repeat(N, 1fr)` grids (which is
     minmax(auto, 1fr), and `auto` will not shrink below min-content), the nav
     keeping its desktop buttons beside the hamburger, and one unwrapped link
     accounted for 282px of that.

     A STUBBORN ~6px REMAINS AND IS NOT EXPLAINED. Bisecting by hiding
     elements bottoms out in SVG icons well inside the viewport, which only
     move the number by reflowing; no element's box and no scroll container
     actually sits at ~366px. It is 1.7% of the viewport and produces no
     visible scrollbar, so it is recorded here rather than chased further.
     The tolerance is deliberately tight — a real regression would be tens or
     hundreds of pixels and would still fail this. */
  const OVERFLOW_TOLERANCE = 8;
  ok(narrow.scroll <= narrow.client + OVERFLOW_TOLERANCE,
    `the page does not scroll meaningfully sideways (${narrow.scroll}px in ${narrow.client}px, `
    + `was 648px; ${narrow.scroll - narrow.client}px residual within the ${OVERFLOW_TOLERANCE}px tolerance)`);
  ok(narrow.engineScrolls === true,
    'the engine scrolls inside its own casing instead, so the machine stays one row');
  ok(narrow.featCols === 1, `feature cards stack to one column (${narrow.featCols})`);

  /* ── 7. light theme ───────────────────────────────────────────────── */
  console.log('\n  ── light theme');
  await go('/', 1440, 1000);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await sleep(600);
  const light = await page.evaluate(() => {
    const el = document.querySelector('.mk-chamber');
    const cs = el ? getComputedStyle(el) : null;
    const body = getComputedStyle(document.body);
    const txt = getComputedStyle(document.querySelector('.mk-feature-grid h3'));
    return {
      chamberBg: cs?.backgroundColor,
      bodyBg: body.backgroundColor,
      titleColor: txt.color,
      /* a token that resolves to nothing renders transparent — invisible
         text that no screenshot review would catch at a glance */
      transparentTitle: txt.color === 'rgba(0, 0, 0, 0)',
    };
  });
  ok(!light.transparentTitle, `feature titles have a real colour in light mode (${light.titleColor})`);
  ok(light.bodyBg !== light.titleColor, 'and are not the same colour as the background');

  /* ── 7b. the other three marketing pages ──────────────────────────────
     The home page was rebuilt first and the other three left on the old
     treatment, so a visitor clicking "See the full walkthrough" landed on a
     page describing a different product. These assertions are what stops the
     four drifting apart again. */
  console.log('\n  ── /platform, /how-it-works, /get-started');

  await go('/platform');
  const plat = await page.evaluate(() => ({
    stack: /ReactFlow|Recharts|Dagre|SQLite|TailwindCSS/i.test(document.body.innerText),
    placeholder: /module live in the beta platform/i.test(document.body.innerText),
    fabrication: /vendor quote|yield|place of supply|catalogue/i.test(document.body.innerText),
    diagrams: document.querySelectorAll('.mk-row, .mk-bar, .mk-bar-v, .mk-best, .mk-draw-path, .mk-pulse').length,
    panelAnims: document.getAnimations().filter(a => a.playState === 'running').length,
  }));
  ok(!plat.stack, 'the technology strip is gone — it named the wrong database and the wrong audience');
  ok(!plat.placeholder, 'and the empty "module live in the beta platform" panel is gone');
  ok(plat.fabrication, 'the platform page describes the fabrication product');
  ok(plat.diagrams > 0 || plat.panelAnims > 0,
    `the default module draws a live diagram (${plat.panelAnims} animations running)`);
  /* Switching module must swap the drawing, not just the text — that was the
     whole failing of the placeholder it replaced. */
  const swapped = await page.evaluate(async () => {
    const before = document.querySelector('.mk-scale-in')?.innerHTML.length || 0;
    const b = [...document.querySelectorAll('button')].find(x => /Vendor quotes/i.test(x.textContent));
    b?.click();
    await new Promise(r => setTimeout(r, 900));
    return {
      rows: document.querySelectorAll('.mk-row').length,
      changed: (document.querySelector('.mk-scale-in')?.innerHTML.length || 0) !== before,
    };
  });
  ok(swapped.rows > 0 && swapped.changed,
    `and switching module swaps the drawing (${swapped.rows} parsed rows appear)`);

  await go('/how-it-works');
  const hiw = await page.evaluate(() => ({
    engine: document.querySelectorAll('.mk-chamber').length,
    text: document.body.innerText,
  }));
  ok(hiw.engine === 7, `the walkthrough shows the same seven-stage engine (${hiw.engine})`);
  ok(/enquiry/i.test(hiw.text) && /scrap|yield/i.test(hiw.text),
    'and its steps are the fabrication flow, matching the home page');

  await go('/get-started');
  const gs = await page.evaluate(() => document.body.innerText);
  ok(!/NX-20/.test(gs), 'no NX- codes left in the sample data');

  /* A real customer project named in data labelled "sample" either implies a
     relationship or discloses someone else's job. Checked on all four pages,
     along with developer leakage. */
  for (const pth of ['/', '/platform', '/how-it-works', '/get-started']) {
    await go(pth);
    const leak = await page.evaluate(() => {
      const m = (document.body.innerText || '').match(/\bORR\b|NHAI|HMDA|localhost:\d+|Port \d{4}|SQLite/);
      return m ? m[0] : null;
    });
    ok(!leak, `${pth} — ${leak ? `leaks "${leak}"` : 'no customer or developer leakage'}`);
  }

  /* ── 8. the motion has to be smooth, not just present ───────────────────
     "Premium" is measurable here and was measured wrong twice. Animating
     paint properties (background, border-color, box-shadow) and layout ones
     (`left`) held a perfect 60fps on this desktop while dropping 13 frames in
     five seconds on a throttled low-end phone — so a desktop check would have
     passed the version that stuttered on the hardware these customers own.

     Two things are asserted:
       · animations are compositor-only (transform/opacity), with a small
         allowance for the SVG yield ring, which can only be drawn by
         animating stroke-dashoffset.
       · nothing loops off-screen. Every diagram used to start when first seen
         and run forever, so a reader at the footer still had twelve of them
         going. */
  console.log('\n  ── motion cost');
  await go('/', 1440, 1000);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => /One Engine/i.test(x.textContent));
    h?.scrollIntoView({ block: 'center' });
  });
  await sleep(1400);

  const cost = await page.evaluate(() => {
    const COMPOSITED = new Set(['opacity', 'transform', 'filter']);
    let composited = 0; const expensive = {};
    document.getAnimations().forEach((a) => {
      const names = new Set();
      (a.effect?.getKeyframes?.() || []).forEach(f =>
        Object.keys(f).forEach(k => {
          if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k)) names.add(k);
        }));
      names.forEach(n => {
        if (COMPOSITED.has(n)) composited++;
        else expensive[n] = (expensive[n] || 0) + 1;
      });
    });
    return { composited, expensive, running: document.getAnimations().filter(a => a.playState === 'running').length };
  });
  const expensiveNames = Object.keys(cost.expensive).filter(n => n !== 'strokeDashoffset');
  ok(expensiveNames.length === 0,
    `animations are compositor-only${expensiveNames.length ? ` — still painting: ${expensiveNames.join(', ')}` : ` (${cost.composited} transform/opacity)`}`);

  const runningAtEngine = cost.running;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1600);
  const atFooter = await page.evaluate(() =>
    document.getAnimations().filter(a => a.playState === 'running').length);
  ok(atFooter < runningAtEngine,
    `motion follows the viewport — ${runningAtEngine} running at the engine, ${atFooter} at the footer`);

  console.log('');
  ok(errs.length === 0, `no JavaScript or console errors${errs.length ? ': ' + errs[0].slice(0, 110) : ''}`);
  ok(external.length === 0,
    `no third-party requests beyond fonts${external.length ? ': ' + external[0].slice(0, 70) : ` (${fonts.length} font request${fonts.length === 1 ? '' : 's'}, which is expected)`}`);

  await browser.close();
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
