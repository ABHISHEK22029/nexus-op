/* ══════════════════════════════════════════════════════════════════════
   The product film, in a browser.

   What it promises, as checks: it waits to be started; it plays every
   chapter in order and stops at the end; its controls, menu, timeline,
   links and keys all work; the voice-over waits for its lines and goes
   quiet when told; it holds up under reduced motion, on a 360px phone and
   in both themes; film mode is a clean 16:9 stage for recording; and the
   homepage never pays for any of it.

   Playback is faked (play() and speechSynthesis record what they were
   asked to say and report the end after __sayMs), so the timing is the
   test's and nothing makes a sound. window.__MK_FILM_SPEED__ runs the
   clock fast or holds it.

   Needs vite (dev or preview). Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const { pathToFileURL } = require('url');

const BASE = process.env.UI_BASE || 'http://localhost:4173';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(BASE)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAKE = () => {
  window.__MK_FILM_SPEED__ = 0;
  window.__said = []; window.__sayMs = 250; window.__cancels = 0;
  const timers = new WeakMap();
  HTMLMediaElement.prototype.play = function () {
    clearTimeout(timers.get(this));
    if (!this.src.startsWith('data:')) window.__said.push(`clip:${this.src.split('/').pop()}`);
    timers.set(this, setTimeout(() => this.dispatchEvent(new Event('ended')), window.__sayMs));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () { clearTimeout(timers.get(this)); };
  let queue = [], cur = null;
  const next = () => {
    if (cur || !queue.length) return;
    cur = queue.shift(); const u = cur;
    window.__said.push(u.text);
    u.onstart?.({});
    u.__t = setTimeout(() => { if (cur === u) { cur = null; u.onend?.({}); next(); } }, window.__sayMs);
  };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    paused: false, getVoices: () => [], addEventListener() {}, removeEventListener() {},
    speak(u) { if (String(u.text).trim()) { queue.push(u); next(); } },
    cancel() { window.__cancels++; const all = cur ? [cur, ...queue] : queue; if (cur) clearTimeout(cur.__t); cur = null; queue = []; all.forEach((u) => u.onerror?.({})); },
    resume() {}, pause() {},
  } });
};

(async () => {
  const { CHAPTERS, LAST_N } = await import(pathToFileURL(path.join(__dirname, '../src/components/marketing/film/chapters.js')).href);
  const { sentences } = await import(pathToFileURL(path.join(__dirname, '../src/components/marketing/flow/narration.js')).href);
  const KEYS = CHAPTERS.map((c) => c.key);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  await page.evaluateOnNewDocument(FAKE);
  const go = async (p, w = 1440, h = 1000) => {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !!window.__MK_FILM__, { timeout: 15000 }).catch(() => {});
    await sleep(500);
  };
  const state = () => page.evaluate(() => window.__MK_FILM__?.state());
  const speed = (v) => page.evaluate((x) => { window.__MK_FILM_SPEED__ = x; }, v);
  const said = () => page.evaluate(() => window.__said.slice());
  const forget = () => page.evaluate(() => { window.__said.length = 0; });
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(60); } return false; };

  /* ── the page ── */
  console.log('\n  ── the page');
  await go('/see-maksops');
  const pg = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText || '',
    entries: document.querySelectorAll('.smk-ch').length,
    watch: [...document.querySelectorAll('.smk-watch')].map((a) => a.getAttribute('href')),
    transcripts: document.querySelectorAll('.smk-ch details').length,
    nav: [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/see-maksops' && /See Maks Ops/.test(a.textContent)),
    footer: [...document.querySelectorAll('footer a')].some((a) => a.getAttribute('href') === '/see-maksops'),
    nexus: /Nexus/i.test(document.body.innerText),
    title: document.title,
  }));
  ok(/See Maks Ops/.test(pg.h1), `the page says what it is ("${pg.h1.replace(/\s+/g, ' ')}")`);
  ok(pg.entries === KEYS.length && pg.transcripts === KEYS.length, `every chapter is listed, with its transcript (${pg.entries}/${KEYS.length})`);
  ok(JSON.stringify(pg.watch) === JSON.stringify(KEYS.map((k) => `#${k}`)), 'and a "Watch from here" link to each');
  ok(pg.nav && pg.footer, 'the top menu and the footer link to it');
  ok(!pg.nexus && /See Maks Ops/.test(pg.title), `no "Nexus", and its own title ("${pg.title}")`);

  /* ── waits to be started ── */
  console.log('\n  ── starting');
  const s0 = await state();
  const poster = await page.evaluate(() => [...document.querySelectorAll('.fm-poster button')].map((b) => b.textContent.trim()));
  ok(!s0.started && poster.length === 2 && /voice-over/.test(poster[0]) && /muted/.test(poster[1]),
    `it waits to be started, with or without the voice (${poster.join(' | ')})`);
  await sleep(800);
  ok(!(await said()).length && (await state()).t === 0, 'and nothing moves or speaks until then');

  await page.click('.fm-poster-alt');
  await speed(40);
  const order = [];
  const reached = await until(async () => {
    const s = await state();
    if (s.key && order[order.length - 1] !== s.key) order.push(s.key);
    return s.phase === 'ended';
  }, 30000);
  ok(reached && JSON.stringify(order) === JSON.stringify(KEYS), `muted, it plays every chapter in order (${order.join(' → ')})`);
  await sleep(800);
  const sEnd = await state();
  ok(sEnd.phase === 'ended' && sEnd.key === KEYS[KEYS.length - 1], 'and stops at the end instead of looping');
  ok(await page.evaluate(() => document.querySelector('.fm-ctl.is-play')?.getAttribute('aria-label') === 'Watch again'), 'offering to watch it again');
  ok(!(await said()).length, 'without a sound');

  /* ── controls ── */
  console.log('\n  ── controls');
  await speed(0);
  const label = await page.evaluate(() => document.querySelector('.fm-ctl-label')?.innerText.replace(/\s+/g, ' ').trim());
  ok(new RegExp(`^${CHAPTERS[CHAPTERS.length - 1].n} / ${LAST_N} — `).test(label || ''), `the label says where it is ("${label}")`);
  await page.click('.fm-menu-host button');
  const items = await page.$$('.fm-menu-item');
  ok(items.length === KEYS.length, `the chapter menu lists them all (${items.length})`);
  await items[1].click(); await sleep(200);
  ok((await state()).key === KEYS[1], `choosing one goes there (${(await state()).key})`);
  await page.click('button[aria-label="Next chapter"]'); await sleep(150);
  const afterNext = (await state()).key;
  await page.click('button[aria-label="Previous chapter"]'); await sleep(150);
  ok(afterNext === KEYS[2] && (await state()).key === KEYS[1], 'next and previous step through them');
  await page.evaluate(() => window.__MK_FILM__.seek(window.__MK_FILM__.chapters[1], 5000)); await sleep(150);
  await page.click('button[aria-label="Start this chapter again"]'); await sleep(150);
  ok((await state()).t < 200, 'and the chapter can be started again');
  const segs = await page.$$('.fm-seg');
  await segs[0].click(); await sleep(150);
  ok(segs.length === KEYS.length && (await state()).key === KEYS[0], 'the timeline has a segment per chapter, and goes to it');

  const unnamed = await page.evaluate(() => [...document.querySelectorAll('.fm-player button')]
    .filter((b) => !(b.getAttribute('aria-label') || b.textContent).trim()).length);
  ok(unnamed === 0, `every control has a name (${unnamed} without)`);
  ok(await page.evaluate(() => document.querySelector('.fm-frame')?.getAttribute('aria-hidden') === 'true'
    && !document.querySelector('.fm-frame').querySelector('a, button, input, [tabindex]:not([tabindex="-1"])')),
  'the picture is hidden from screen readers, and nothing in it takes focus');

  /* pause is a pause: nothing in the picture changes */
  await speed(4);
  await page.click('.fm-ctl.is-play'); await sleep(500);
  const shot = () => page.evaluate(() => `${document.querySelector('.fm-frame')?.innerText}|${window.__MK_FILM__.state().t}`);
  const p1 = await shot(); await sleep(1200); const p2 = await shot();
  ok(p1 === p2 && (await page.evaluate(() => document.querySelector('.fm-ctl.is-play').getAttribute('aria-label'))) === 'Play', 'pausing stops the picture');
  await page.click('.fm-ctl.is-play'); await sleep(900);
  ok((await shot()) !== p2, 'and playing again moves it on');

  /* keys, only inside the player */
  await page.focus('button[aria-label="Captions"]');
  const ccBefore = await page.evaluate(() => document.querySelector('button[aria-label="Captions"]').getAttribute('aria-pressed'));
  await page.keyboard.press('c'); await sleep(100);
  const ccAfter = await page.evaluate(() => document.querySelector('button[aria-label="Captions"]').getAttribute('aria-pressed'));
  const k0 = (await state()).idx;
  await page.keyboard.press('ArrowRight'); await sleep(150);
  ok(ccBefore !== ccAfter && (await state()).idx === k0 + 1, 'C turns captions over and → moves on, while focus is in the player');
  await page.keyboard.press('c');
  await page.focus('body');
  await page.evaluate(() => document.activeElement?.blur());
  const k1 = (await state()).idx;
  await page.keyboard.press('ArrowRight'); await sleep(150);
  ok((await state()).idx === k1, 'and not when it is elsewhere on the page');

  /* ── links ── */
  console.log('\n  ── links');
  const hist0 = await page.evaluate(() => history.length);
  await page.evaluate(() => { window.location.hash = '#close'; }); await sleep(400);
  ok((await state()).key === 'close', 'a #chapter link moves the film there');
  await page.evaluate((k) => window.__MK_FILM__.seek(k, 0), KEYS[0]); await speed(40);
  await until(async () => (await state()).phase === 'ended', 20000);
  ok((await page.evaluate(() => history.length)) - hist0 <= 1, 'and the address follows it without filling the back button');
  ok(await page.evaluate(() => window.location.hash === '#close'), `the address names the chapter on screen (${await page.evaluate(() => location.hash)})`);
  await go('/');                       // a fresh load: a hash-only change would not reload
  await go('/see-maksops#customer');
  const deep = await state();
  ok(deep.key === 'customer' && !deep.started, 'opening a link to a chapter starts there, still waiting to be played');

  /* ── the voice ── */
  console.log('\n  ── the voice-over');
  await go('/see-maksops');
  await page.evaluate(() => { window.__sayMs = 2000; });
  await page.click('.fm-poster-go'); await sleep(250);
  const first = sentences(CHAPTERS[0].beats[0].voice)[0];
  const heard = await said();
  ok(heard[0] === first || heard[0]?.startsWith('clip:'), `"Play with voice-over" starts the first line ("${heard[0]}")`);
  ok(await page.evaluate((s) => document.querySelector('.fm-caption')?.innerText.includes(s), first), 'and captions it');
  await speed(20);
  await sleep(1500);
  ok((await state()).beat === CHAPTERS[0].beats[0].key, `the picture waits for the line to be said (${(await state()).beat} at 1.5s, a ${CHAPTERS[0].beats[1].at / 20}ms beat at 20×)`);
  const moved = await until(async () => (await state()).beat === CHAPTERS[0].beats[1].key, 6000);
  ok(moved, 'and moves on when it has');
  await speed(0); await forget();
  await page.click('.fm-menu-host button'); await (await page.$$('.fm-menu-item'))[1].click(); await sleep(250);
  const cut = await said();
  ok(cut[0] === sentences(CHAPTERS[1].beats[0].voice)[0] || cut[0]?.startsWith('clip:'), 'a jump cuts the line and says the new chapter\'s');
  await forget();
  await page.click('.fm-ctl.is-play'); await sleep(800);
  ok(!(await said()).length, 'pausing silences it');
  await page.click('button[aria-label="Voice-over"]'); await sleep(100);
  await page.click('.fm-ctl.is-play'); await forget(); await sleep(800);
  ok(!(await said()).length && await page.evaluate(() => document.querySelector('button[aria-label="Voice-over"]').getAttribute('aria-pressed') === 'false'),
    'turning it off keeps it off');
  ok(await page.evaluate(() => !!document.querySelector('.fm-caption:not(.is-empty)')), 'with captions still there, for reading');

  /* ── roles, end to end ── */
  if (KEYS.includes('team')) {
    console.log('\n  ── the team chapter shows each role its real menu');
    const nav = await import(pathToFileURL(path.join(__dirname, '../src/lib/navigation.js')).href);
    const rv = await import(pathToFileURL(path.join(__dirname, '../src/components/marketing/film/data/roleViews.js')).href);
    const team = CHAPTERS.find((c) => c.key === 'team');
    const views = team.beats.find((b) => b.key === 'views');
    await go('/see-maksops');
    await page.click('.fm-poster-alt'); await speed(0);
    for (const [role, offset] of [['Owner', 300], ['Sales', 2100], ['Procurement', 3900], ['Finance', 5800]]) {
      await page.evaluate((t) => window.__MK_FILM__.seek('team', t), views.at + offset); await sleep(300);
      const seen = await page.evaluate(() => ({
        role: document.querySelector('[data-role-view]')?.getAttribute('data-role-view'),
        modules: [...document.querySelectorAll('[data-nav-module]')].map((e) => e.getAttribute('data-nav-module')),
        items: [...document.querySelectorAll('[data-nav-item]')].map((e) => e.getAttribute('data-nav-item')),
      }));
      const can = rv.canFor(role);
      const want = {
        modules: nav.visibleModules(can, role, { contracting: false }).map((m) => m.key),
        items: nav.visibleItems('purchases', can, role, { contracting: false }).filter((i) => i.path).map((i) => i.path),
      };
      ok(seen.role === role && JSON.stringify(seen.modules) === JSON.stringify(want.modules) && JSON.stringify(seen.items) === JSON.stringify(want.items),
        `${role}: ${seen.modules.length} modules, Purchases shows ${seen.items.length} — as the app shows ${role}`);
    }
  }

  /* ── reduced motion ── */
  console.log('\n  ── prefers-reduced-motion');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await go('/see-maksops');
  await page.click('.fm-poster-alt'); await speed(40); await sleep(1500);
  const rm = await state();
  ok(rm.idx === 0 && rm.t === CHAPTERS[0].duration, 'nothing advances by itself; the chapter is shown finished');
  await page.click('button[aria-label="Next chapter"]'); await sleep(300);
  ok((await state()).idx === 1, 'and the controls still move through it');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  /* ── phones ── */
  console.log('\n  ── 360px wide');
  await go('/see-maksops', 360, 760);
  await page.click('.fm-poster-alt'); await speed(0);
  const narrow = await page.evaluate(() => !!document.querySelector('.fm-stage.is-narrow'));
  const over = [];
  for (const c of CHAPTERS) {
    for (const b of c.beats) {
      await page.evaluate((k, t) => window.__MK_FILM__.seek(k, t), c.key, Math.min(c.duration - 1, b.at + 3000)); await sleep(250);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (o > 8) over.push(`${c.key}.${b.key}: ${o}px`);
    }
  }
  ok(narrow, 'a phone gets the narrow stage');
  ok(!over.length, `no beat of any chapter pushes the page sideways${over.length ? ` (${over.join(', ')})` : ''}`);

  /* ── themes ── */
  console.log('\n  ── themes');
  await go('/see-maksops');
  await page.click('.fm-poster-alt'); await speed(0);
  await page.evaluate(() => window.__MK_FILM__.seek('customer', 26000)); await sleep(500);
  for (const theme of ['light', 'dark']) {
    /* every element eases its background over 250ms on a theme change */
    await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
    await sleep(450);
    const c = await page.evaluate(() => {
      const item = document.querySelector('.fm-panel-item.is-on'), panel = document.querySelector('.fm-panel');
      const row = document.querySelector('.fm-row-main b');
      return { item: getComputedStyle(item).color, row: getComputedStyle(row).color, bg: getComputedStyle(panel).backgroundColor };
    });
    ok(c.row !== c.bg && c.item !== c.bg && !/rgba\(0, 0, 0, 0\)/.test(c.row), `${theme}: the app's text has a real colour (${c.row} on ${c.bg})`);
  }

  /* ── film mode ── */
  console.log('\n  ── film mode, for recording');
  await go('/see-maksops?mode=film', 1600, 900);
  const fm = await page.evaluate(() => {
    const r = document.querySelector('.fm-canvas').getBoundingClientRect();
    return {
      nav: !!document.querySelector('nav a[href="/platform"]'), controls: !!document.querySelector('.fm-controls'),
      ratio: r.height / r.width, fits: r.height <= window.innerHeight + 1 && r.width <= window.innerWidth + 1,
      start: document.querySelector('.fm-poster-go')?.textContent.trim(),
    };
  });
  ok(!fm.nav && !fm.controls && Math.abs(fm.ratio - 0.5625) < 0.01 && fm.fits, `only a 16:9 stage, fitted to the window (${fm.ratio.toFixed(4)})`);
  ok(/Click to start/.test(fm.start || ''), 'waiting for a click to start');
  await page.click('.fm-poster-go'); await sleep(200);
  ok((await state()).started, 'which starts it');
  await page.evaluate(() => window.__MK_FILM__.seek('close', 4000)); await sleep(400);
  ok(await page.evaluate(() => /PFW\/FY2026-27\/018/.test(document.querySelector('.fm-frame').innerText)), 'with the pinned date, so a recording is the same every time');

  /* ── the homepage pays nothing for it ── */
  console.log('\n  ── the homepage');
  const loaded = [];
  page.on('request', (r) => loaded.push(r.url()));
  await go('/');
  await sleep(1500);
  /* The homepage ad shares the film's shell (the app window, the stage);
     the film itself — its player and its chapters — must not load. */
  ok(!loaded.some((u) => /ProductFilm|SeeMaksOps|\/film\/(chapters|controls)\/|\/film\/scenes/.test(u)), 'the homepage never downloads the film\'s player or chapters');
  const homeLink = await page.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/see-maksops'));
  ok(homeLink, 'and links to it under the walkthrough');
  await go('/how-it-works');
  await sleep(800);
  ok(await page.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/see-maksops')), 'How it works links to it too');

  console.log('');
  ok(errs.length === 0, `no JavaScript or console errors${errs.length ? ': ' + errs[0].slice(0, 140) : ''}`);
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
