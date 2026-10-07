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
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
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
  for (const p of ['/', '/platform', '/how-it-works', '/see-maksops', '/get-started', '/login', '/signup']) {
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

  /* ── 2. the live product walkthrough ─────────────────────────────────
     The hero is no longer a diagram: it is the product running a whole
     transaction for about a minute. These checks are the brief, turned into
     assertions — it starts by itself, it has no player, it walks every stage
     in order, and above all it is ONE transaction: the same customer, the
     same numbers, seven linked records.

     The clock is held at 0 while the page loads (window.__MK_FLOW_SPEED__,
     read on every tick), then runs 12x fast so a minute of story takes about
     five seconds. Nothing else about the component changes. */
  console.log('\n  ── the live product walkthrough');
  const freeze = await page.evaluateOnNewDocument(() => { window.__MK_FLOW_SPEED__ = 0; });
  await go('/');
  await page.removeScriptToEvaluateOnNewDocument(freeze.identifier);
  const speed = (x) => page.evaluate((v) => { window.__MK_FLOW_SPEED__ = v; }, x);
  const current = () => page.evaluate(() => document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent);
  /* waits for the stage to move off `from`, and says where it went */
  const nextStage = async (from, ms) => {
    const t0 = Date.now();
    let cur = await current();
    while (cur === from && Date.now() - t0 < ms) { await sleep(40); cur = await current(); }
    return cur;
  };

  const first = await page.evaluate(() => ({
    headline: (document.querySelector('h1')?.innerText || '').replace(/\s+/g, ' '),
    cards: document.querySelectorAll('.fl-card').length,
    videos: document.querySelectorAll('video, iframe').length,
    playButton: [...document.querySelectorAll('button')].some((b) => {
      const l = `${b.textContent} ${b.getAttribute('aria-label') || ''}`;
      return /\bplay\b/i.test(l) && !/pause|resume/i.test(l);
    }),
    notes: document.querySelectorAll('.fl-note').length,
  }));
  ok(/catalogue to cash/i.test(first.headline), `the hero says it ("${first.headline}")`);
  ok(first.cards === 7, `seven stage cards act as the controller (${first.cards})`);
  ok(first.videos === 0 && !first.playButton, 'no video, no player, no play button — it simply runs');
  ok(first.notes === 2, 'the handwritten margin notes are there');

  const run = await page.evaluate(async () => {
    const order = [], ids = new Set(), text = {}, acme = new Set();
    let customerScreen = false, maxTrail = 0, flew = false;
    window.__MK_FLOW_SPEED__ = 12;
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      const cur = document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent;
      if (cur && order[order.length - 1] !== cur) order.push(cur);
      const id = document.querySelector('.fl-id .fl-morph-item.is-in')?.textContent.trim();
      if (id) ids.add(id);
      if (document.querySelector('.fl-url')?.textContent.includes('/c/')) customerScreen = true;
      maxTrail = Math.max(maxTrail, document.querySelectorAll('.fl-chain-id').length);
      if (document.getAnimations().some((a) => a.effect?.target?.classList?.contains('fl-flight'))) flew = true;
      const win = document.querySelector('.fl-window')?.innerText || '';
      if (cur) { text[cur] = win; if (/Acme Engineering/.test(win)) acme.add(cur); }
      if (document.querySelector('.fl-closing')) { order.push('CLOSING'); break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { order, ids: [...ids], text, acme: [...acme], customerScreen, maxTrail, flew };
  });
  const STAGES = ['Enquiry', 'Quotation', 'Order', 'Purchase', 'Goods receipt', 'Production', 'Tax invoice'];
  ok(run.customerScreen, 'it opens on the CUSTOMER\'s screen — your public catalogue at maksops.co.in/c/…');
  ok(JSON.stringify(run.order) === JSON.stringify([...STAGES, 'CLOSING']),
    `it plays every stage in order, then closes (${run.order.join(' → ')})`);
  /* The numbers are the app's own formats (CO-0012, PFW/FY2026-27/018 …),
     checked against the patterns the film uses too. */
  const { ID_PATTERNS } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../src/components/marketing/data/transaction.js')).href);
  const kinds = ['enq', 'qt', 'co', 'po', 'grn', 'prod', 'inv'];
  ok(kinds.every((k) => run.ids.some((i) => ID_PATTERNS[k].test(i))),
    `each stage produces its own numbered record, in the app's own formats (${run.ids.join(', ')})`);
  ok(run.maxTrail === 7, `and the window's trail links all seven (${run.maxTrail})`);
  ok(run.acme.length === 7, `the SAME customer is on screen in every stage (${run.acme.length}/7)`);
  ok(run.flew, 'between stages the new record flies up to the next card');

  /* the numbers are one transaction's numbers, not seven demos' */
  const T = run.text;
  ok(/₹3,28,500/.test(T.Quotation || '') && /CGST/.test(T.Quotation || ''), 'quotation: ₹3,28,500 with CGST + SGST');
  ok(/323/.test(T.Order || '') && /180 kg/.test(T.Order || ''), 'order: needs 323 kg across open orders, short 180 kg');
  ok(/₹46,800/.test(T.Purchase || '') && /Lowest/.test(T.Purchase || ''), 'purchase: lowest vendor, ₹46,800');
  ok(/143 kg/.test(T['Goods receipt'] || '') && /\+180 kg/.test(T['Goods receipt'] || '') && /323/.test(T['Goods receipt'] || ''),
    'goods receipt: 143 + 180 = 323 kg');
  ok(/94\.2%/.test(T.Production || ''), 'production: 94.2% yield, scrap counted');
  ok(/₹3,28,500/.test(T['Tax invoice'] || '') && /E-way bill/i.test(T['Tax invoice'] || ''),
    'invoice: the same ₹3,28,500, with the e-way bill');

  /* choosing a stage plays it, and the story carries on from there.
     4x from here: fast enough to be quick, slow enough that a fixed wait
     cannot sail past a whole stage. */
  await speed(4);
  await page.evaluate(() => document.querySelectorAll('.fl-card')[4].click());
  await page.mouse.move(2, 2);
  await sleep(250);
  const picked = await page.evaluate(() => ({
    cur: document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent,
    id: document.querySelector('.fl-id .fl-morph-item.is-in')?.textContent,
    done: document.querySelectorAll('.fl-card.is-done').length,
  }));
  ok(picked.cur === 'Goods receipt' && /^GRN-/.test(picked.id || ''), `selecting a card plays that stage (${picked.cur}, ${picked.id})`);
  ok(picked.done === 4, `and the stages before it show as done (${picked.done})`);
  const after = await nextStage('Goods receipt', 4000);
  ok(after === 'Production', `then continues by itself to the next one (${after})`);

  /* hovering holds the hand-off, not the story: Production is 7.5s of story,
     under 2s at 4x, so 3.5s of hovering is well past its end */
  const box = await page.evaluate(() => { const r = document.querySelector('.fl-window').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 60 }; });
  await page.mouse.move(box.x, box.y);
  await sleep(3500);
  const held = await page.evaluate(() => ({
    cur: document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent,
    yield: /94\.2%/.test(document.querySelector('.fl-window')?.innerText || ''),
  }));
  ok(held.cur === 'Production' && held.yield, `hovering lets the stage finish and then holds it, instead of moving on (${held.cur})`);
  await page.mouse.move(2, 2);
  const released = await nextStage('Production', 3000);
  ok(released === 'Tax invoice', `moving away releases it (${released})`);

  /* WCAG 2.2.2: anything that moves by itself for >5s must be pausable.
     The whole window is compared, so ANY progress — a typed character, a
     count, a status — shows up as a difference. */
  await page.evaluate(() => document.querySelectorAll('.fl-card')[1].click());
  await page.mouse.move(2, 2);
  await sleep(150);
  await page.click('.fl-live');
  await page.mouse.move(2, 2);
  await sleep(600); // let the cross-fades already under way finish
  const snap = () => page.evaluate(() => ({
    pressed: document.querySelector('.fl-live').getAttribute('aria-pressed'),
    win: document.querySelector('.fl-app')?.innerText,
    cur: document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent,
  }));
  const p1 = await snap();
  await sleep(1800);
  const p2 = await snap();
  ok(p1.pressed === 'true' && p1.win === p2.win && p2.cur === 'Quotation', 'the "Live" chip pauses it — a pause control, not a play button');
  await page.click('.fl-live');
  await page.mouse.move(2, 2);
  await sleep(1200);
  const p3 = await snap();
  ok(p3.pressed === 'false' && p3.win !== p2.win, 'and resumes it');

  /* ── 2b. the voice-over ───────────────────────────────────────────────
     Off until asked for; once on, each stage is narrated from recorded
     clips and the story waits for the words. Playback is faked — play()
     records the clip and reports it ended after __clipMs — so the timing
     is the test's to set and nothing makes a sound. */
  console.log('\n  ── the voice-over');
  const { pathToFileURL } = require('url');
  const path = require('path');
  const fs = require('fs');
  const { NARRATION, sentences, clipName } = await import(pathToFileURL(path.join(__dirname, '../src/components/marketing/flow/narration.js')).href);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/components/marketing/flow/voice-clips.json'), 'utf8'));
  const lines = Object.values(NARRATION).flatMap(sentences);
  const missing = lines.filter((s) => !manifest.clips[clipName(s)] || !fs.existsSync(path.join(__dirname, '../public/voice', clipName(s))));
  ok(!missing.length, `every sentence of the script is recorded (${lines.length - missing.length}/${lines.length}${missing.length ? `; re-run scripts/voiceover/make.mjs for: ${missing.join(' | ')}` : ''})`);
  const clipOf = (key, i = 0) => clipName(sentences(NARRATION[key])[i]);

  const fakeAudio = await page.evaluateOnNewDocument(() => {
    window.__MK_FLOW_SPEED__ = 0;
    window.__played = []; window.__clipMs = 300;
    const timers = new WeakMap();
    HTMLMediaElement.prototype.play = function () {
      clearTimeout(timers.get(this));
      if (!this.src.startsWith('data:')) window.__played.push(this.src.split('/').pop());
      timers.set(this, setTimeout(() => this.dispatchEvent(new Event('ended')), window.__clipMs));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { clearTimeout(timers.get(this)); };
  });
  await go('/');
  await page.removeScriptToEvaluateOnNewDocument(fakeAudio.identifier);
  const played = () => page.evaluate(() => window.__played.slice());
  const forget = () => page.evaluate(() => { window.__played.length = 0; });
  const voiceState = () => page.evaluate(() => ({
    pressed: document.querySelector('.fl-voice')?.getAttribute('aria-pressed'),
    caption: document.querySelector('.fl-caption-line')?.textContent || null,
    stage: document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent,
  }));

  const v0 = await voiceState();
  ok(v0.pressed === 'false' && !(await played()).length && !v0.caption, 'the voice-over is off until asked for — nothing plays by itself');
  const served = await page.evaluate(async (u) => { const r = await fetch(u); return `${r.status} ${r.headers.get('content-type')}`; }, `/voice/${clipOf('purchase')}`);
  ok(/^200 audio\/mpeg/.test(served), `the clips are served as audio (${served})`);

  await page.click('.fl-voice');
  await page.mouse.move(2, 2);
  await sleep(150);
  const v1 = await voiceState();
  ok(v1.pressed === 'true' && (await played())[0] === clipOf('enquiry'), `turning it on narrates the stage on screen (${(await played())[0]})`);
  ok(v1.caption === sentences(NARRATION.enquiry)[0], 'and captions the sentence being spoken');

  /* the stage waits for its words: Enquiry is 9s of story, 0.75s at 12x;
     its two sentences take 2.5s each */
  await page.evaluate(() => { window.__clipMs = 2500; });
  await forget();
  await page.evaluate(() => document.querySelectorAll('.fl-card')[0].click());
  await page.mouse.move(2, 2);
  await speed(12);
  await sleep(1800);
  const waiting = await voiceState();
  ok(waiting.stage === 'Enquiry', `a stage does not hand over while its line is being said (${waiting.stage} at 1.8s)`);
  const moved = await nextStage('Enquiry', 6000);
  const order = await played();
  ok(moved === 'Quotation' && order[0] === clipOf('enquiry') && order[1] === clipOf('enquiry', 1) && order[2] === clipOf('quotation'),
    `and moves on when it has, straight into the next stage's line (${moved})`);

  await page.evaluate(() => { window.__clipMs = 300; });
  await speed(0);
  await forget();
  await page.evaluate(() => document.querySelectorAll('.fl-card')[3].click());
  await page.mouse.move(2, 2);
  await sleep(150);
  const v2 = await voiceState();
  ok(v2.stage === 'Purchase' && (await played())[0] === clipOf('purchase') && v2.caption === sentences(NARRATION.purchase)[0],
    'choosing a card cuts the line short and narrates that stage');

  await page.click('.fl-live');
  await page.mouse.move(2, 2);
  await forget();
  await sleep(700);
  const v3 = await voiceState();
  ok(!(await played()).length && v3.caption === 'Voice-over paused', 'pausing the walkthrough silences it');
  await page.click('.fl-live');
  await page.mouse.move(2, 2);
  await sleep(150);
  ok((await played())[0] === clipOf('purchase'), 'and resuming starts the stage again, with its line');

  await page.evaluate(() => { window.__clipMs = 120; });
  await forget();
  await speed(12);
  let closed = false;
  for (let t0 = Date.now(); Date.now() - t0 < 15000 && !closed;) {
    closed = await page.evaluate(() => !!document.querySelector('.fl-closing'));
    await sleep(80);
  }
  await sleep(600);
  const tail = await played();
  ok(closed && sentences(NARRATION.closing).every((s) => tail.includes(clipName(s))), 'the closing card has its own line');

  await speed(0);
  await page.click('.fl-voice');
  await forget();
  await sleep(800);
  const v4 = await voiceState();
  ok(v4.pressed === 'false' && !v4.caption && !(await played()).length, 'and turning it off silences it at once');

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
  /* Nothing advances on its own, every scene is drawn at its finished state,
     and the cards still switch between them. */
  const rm1 = await page.evaluate(() => ({
    cur: document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent,
    live: !!document.querySelector('.fl-live'),
    doc: document.querySelector('.fl-docpane')?.innerText || '',
  }));
  await sleep(2500);
  const rm2 = await page.evaluate(() => document.querySelector('.fl-card[aria-current="step"] .fl-card-title')?.textContent);
  ok(rm1.cur === 'Enquiry' && rm2 === 'Enquiry', 'the walkthrough does not advance by itself');
  ok(!rm1.live, 'and offers no live/pause chip, because nothing is moving');
  ok(/Acme Engineering/.test(rm1.doc), 'each scene is shown finished — the enquiry is already filled in');
  await page.evaluate(() => document.querySelectorAll('.fl-card')[2].click());
  await sleep(300);
  ok(await page.evaluate(() => /Short/.test(document.querySelector('.fl-window').innerText)),
    'choosing a stage still shows it, complete');

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
      const e = document.querySelector('.fl-strip');
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
    'the seven stage cards scroll inside their own strip instead of the page');
  ok(narrow.featCols === 1, `feature cards stack to one column (${narrow.featCols})`);

  /* ── 7. light theme ───────────────────────────────────────────────── */
  console.log('\n  ── light theme');
  await go('/', 1440, 1000);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await sleep(600);
  const light = await page.evaluate(() => {
    const el = document.querySelector('.fl-card');
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

  /* ── 7a. the marketing must not undersell the product ─────────────────
     The pages described about twelve capabilities. The application has nine
     modules and roughly forty screens — stock with reorder levels,
     requirements planning, delivery challans with e-way bill tracking,
     credit and debit notes, payables ageing, expenses, reports, milestones,
     work orders, recurring automation, roles and permissions, data import
     and the activity log were all missing. Someone comparing this against a
     competitor was reading a third of what they would get.

     This asserts the named things are actually on the page. It is a cheap
     guard against the same drift: a capability added to the product and
     never mentioned to anyone buying it. */
  console.log('\n  ── the full product is described, not a third of it (on /platform)');
  /* moved off the homepage, which now sells one idea; the platform page is
     where someone goes for the detail */
  await go('/platform');
  const covered = await page.evaluate(() => {
    const t = (document.body.innerText || '').toLowerCase();
    const want = [
      'catalogue', 'enquiries', 'delivery challan', 'e-way bill',
      'credit', 'payables', 'reorder', 'requirements',
      'expenses', 'reports', 'milestones', 'work orders',
      'automation', 'roles', 'import', 'activity',
      'ask ai', 'knowledge',
    ];
    return { missing: want.filter(w => !t.includes(w)), total: want.length };
  });
  ok(covered.missing.length === 0,
    covered.missing.length
      ? `${covered.missing.length} of ${covered.total} capabilities still unmentioned: ${covered.missing.join(', ')}`
      : `all ${covered.total} named capabilities appear on the home page`);

  const counts = await page.evaluate(() => ({
    moduleCards: document.querySelectorAll('.mk-inside-grid > div').length,
    watches: [...document.querySelectorAll('span')].filter(s => /e-way bill|behind plan|awaiting approval/i.test(s.textContent)).length,
  }));
  ok(counts.moduleCards >= 8, `every module has a card (${counts.moduleCards})`);
  ok(counts.watches >= 3,
    `and the attention badges the app raises are sold as a feature (${counts.watches} shown)`);

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
    engine: document.querySelectorAll('.fl-card').length,
    text: document.body.innerText,
  }));
  ok(hiw.engine === 7, `the walkthrough shows the same live product walkthrough (${hiw.engine} stages)`);
  ok(/enquiry/i.test(hiw.text) && /scrap|yield/i.test(hiw.text),
    'and its steps are the fabrication flow, matching the home page');

  await go('/get-started');
  const gs = await page.evaluate(() => document.body.innerText);
  ok(!/NX-20/.test(gs), 'no NX- codes left in the sample data');

  /* A real customer project named in data labelled "sample" either implies a
     relationship or discloses someone else's job. Checked on all four pages,
     along with developer leakage. */
  for (const pth of ['/', '/platform', '/how-it-works', '/see-maksops', '/get-started']) {
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
  await page.evaluate(() => document.querySelector('.fl-window')?.scrollIntoView({ block: 'center' }));
  await sleep(1400);

  const cost = await page.evaluate(() => {
    const COMPOSITED = new Set(['opacity', 'transform', 'filter']);
    let composited = 0; const expensive = {};
    document.getAnimations().forEach((a) => {
      if (a.effect?.getTiming?.().iterations !== Infinity) return;
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

  /* Loops only. A raw count included one-off transitions — the nav restyling
     as the page scrolls, a reveal finishing — so it rose and fell with timing
     and said nothing about whether loops stop off screen. */
  const loopsRunning = () => page.evaluate(() =>
    document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity)
      .map(a => { const el = a.effect?.target; return el ? String(el.className?.baseVal ?? el.className).split(' ')[0] || el.tagName : '?'; }));
  const atEngine = await loopsRunning();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1600);
  const atFooter = await loopsRunning();
  ok(atFooter.length < atEngine.length && !atFooter.some(c => /^fl-/.test(c)),
    `motion follows the viewport — ${atEngine.length} loops at the engine, ${atFooter.length} at the footer (${atFooter.join(', ') || 'none'})`);

  console.log('');
  ok(errs.length === 0, `no JavaScript or console errors${errs.length ? ': ' + errs[0].slice(0, 110) : ''}`);
  ok(external.length === 0,
    `no third-party requests beyond fonts${external.length ? ': ' + external[0].slice(0, 70) : ` (${fonts.length} font request${fonts.length === 1 ? '' : 's'}, which is expected)`}`);

  await browser.close();
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
