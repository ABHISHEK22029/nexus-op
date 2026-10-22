/* ══════════════════════════════════════════════════════════════════════
   The homepage ad (components/marketing/ad), in a browser.

   What it promises, as checks: the homepage does not download it until
   the visitor scrolls near; it starts by itself once it is in view and
   pauses when it is not; Pause, Sound and Replay work, and no sound is
   made (no AudioContext even exists) until Sound is pressed; every
   caption appears on cue; the same moment always draws the same picture;
   it ends on a real "Test Maks Ops" link; under reduced motion it shows
   each scene finished; on a phone it plays as the same 16:9 film across
   the screen and never pushes the page sideways; and nothing logs an error.

   window.__MK_AD_SPEED__ runs the clock fast (12) or holds it (0), and
   window.__MK_AD__.seek(ms) goes anywhere.

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

/* count AudioContexts (none may exist before Sound is pressed), and
   splice a meter in front of the speakers to hear what actually comes out */
const SPY = () => {
  window.__audioContexts = 0;
  const AC = window.AudioContext;
  if (AC) {
    window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__audioContexts++; window.__ac = this; } };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) {
        const c = this.context;
        if (!c.__meter) { c.__meter = c.createAnalyser(); c.__meter.fftSize = 2048; }
        connect.call(this, c.__meter);
      }
      return connect.call(this, dest, ...rest);
    };
    window.__peak = () => {
      const m = window.__ac?.__meter;
      if (!m) return 0;
      const b = new Float32Array(m.fftSize);
      m.getFloatTimeDomainData(b);
      return b.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    };
  }
};

(async () => {
  const AD = await import(pathToFileURL(path.join(__dirname, '../src/components/marketing/ad/script.js')).href);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const open = async ({ width = 1440, height = 900, reduced = false } = {}) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.evaluateOnNewDocument(SPY);
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width, height });
    const loaded = [];
    page.on('request', (r) => loaded.push(r.url()));
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    await sleep(800);
    return { page, loaded };
  };
  const toAd = async (page) => {
    await page.evaluate(() => document.querySelector('.mk-ad-slot').scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => window.__MK_AD__, { timeout: 15000 });
    await sleep(500);
  };
  const state = (page) => page.evaluate(() => window.__MK_AD__.state());
  const seek = async (page, ms, wait = 700) => { await page.evaluate((x) => window.__MK_AD__.seek(x), ms); await sleep(wait); };
  const caption = (page) => page.evaluate(() => [...document.querySelectorAll('.ad-cap.is-in')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join(' | '));

  try {
    console.log('\n  ── on the homepage');
    const { page, loaded } = await open();
    /* the ad is the homepage's first screen: under the promise, with the
       features it shows as chips beneath it */
    const head = await page.evaluate(() => {
      const hero = document.querySelector('.mp-hero');
      return hero && {
        h: hero.querySelector('h1')?.textContent,
        first: hero === document.querySelector('.mp > section'),
        slot: Boolean(hero.querySelector('#the-film.mk-ad-slot')),
        chips: hero.querySelectorAll('.mp-chip').length,
      };
    });
    ok(head && /From catalogue\s*to cash/.test(head.h) && head.first && head.slot,
      `it is the first screen, under the promise ("${head?.h}")`);
    ok(head?.chips === 8, `with the eight features it shows under it, each to play it from (${head?.chips})`);
    ok(!(await page.evaluate(() => Boolean(document.querySelector('.fl-root')))),
      'and the walkthrough is not repeated under it: that is How It Works');
    ok(loaded.some((u) => /marketing\/ad\/ProductAd|ProductAd-/.test(u)),
      'its code is its own chunk, fetched after the page');

    console.log('\n  ── it starts by itself, in view');
    await toAd(page);
    let s0 = await state(page);
    await sleep(1500);
    let s1 = await state(page);
    ok(s1.started && s1.running && s1.ms > s0.ms, `once it is in view it plays (${Math.round(s0.ms)} → ${Math.round(s1.ms)} ms)`);
    ok(await page.evaluate(() => window.__audioContexts === 0), 'silently: no audio exists until Sound is pressed');
    ok(await page.evaluate(() => !window.__MK_AD_VOICE__), 'and the voice-over clips are not even fetched');
    await page.evaluate(() => document.querySelector('#catalogue').scrollIntoView({ block: 'start' }));
    await sleep(700);
    s0 = await state(page); await sleep(800); s1 = await state(page);
    ok(!s1.running && s1.ms === s0.ms, 'scrolled away, it pauses');
    await page.evaluate(() => document.querySelector('.mk-ad-slot').scrollIntoView({ block: 'center' }));
    await sleep(900);
    ok((await state(page)).running, 'and carries on when it is back in view');

    console.log('\n  ── controls');
    await page.click('.ad-controls button[aria-label="Pause"]');
    await sleep(250);            // the clock commits its last frame, then sleeps
    s0 = await state(page); await sleep(700); s1 = await state(page);
    ok(s1.paused && s1.ms === s0.ms, 'Pause holds it');
    await page.click('.ad-controls button[aria-label="Play"]');
    await sleep(600);
    ok((await state(page)).running, 'Play resumes it');
    await page.click('.ad-controls button[aria-label="Sound"]');
    await sleep(300);
    ok(await page.evaluate(() => window.__audioContexts === 1 && document.querySelector('.ad-controls button[aria-label="Sound"]').getAttribute('aria-pressed') === 'true'),
      'Sound makes the one audio context, and says it is on');
    /* it must be heard: the loudest moment in two seconds of the groove
       has to reach a normal level, not a whisper */
    await page.evaluate(() => { window.__MK_AD_SPEED__ = 1; });
    await seek(page, 20000, 100);
    let loudest = 0;
    for (let i = 0; i < 20; i++) { loudest = Math.max(loudest, await page.evaluate(() => window.__peak())); await sleep(100); }
    const dbfs = loudest > 0 ? 20 * Math.log10(loudest) : -Infinity;
    ok(dbfs > -10 && dbfs < 0, `with Sound on it plays at a normal level, without clipping (peak ${dbfs.toFixed(1)} dBFS)`);
    const voiceReady = await page.waitForFunction(() => window.__MK_AD_VOICE__ && window.__MK_AD_VOICE__.loaded() === window.__MK_AD_VOICE__.lines, { timeout: 15000 }).then(() => true).catch(() => false);
    const voice = await page.evaluate(() => ({ loaded: window.__MK_AD_VOICE__?.loaded(), lines: window.__MK_AD_VOICE__?.lines }));
    ok(voiceReady && voice.lines === AD.VOICE.length, `the narrator's lines load once Sound is on (${voice.loaded} of ${voice.lines})`);
    /* from somewhere else entirely, so arriving at the line is a jump */
    await seek(page, 60000, 400);
    const said0 = await page.evaluate(() => window.__MK_AD_VOICE__.said());
    await seek(page, 22300, 1300);
    ok(await page.evaluate((n) => window.__MK_AD_VOICE__.said() > n, said0), 'and the narrator speaks on cue ("One click turns it into a complete quotation…")');
    await page.click('.ad-controls button[aria-label="Pause"]');
    await sleep(400);
    ok(await page.evaluate(() => window.__ac.state === 'suspended'), 'pausing the picture pauses the music');
    await page.click('.ad-controls button[aria-label="Play"]');
    await sleep(400);
    ok(await page.evaluate(() => window.__ac.state === 'running'), 'and Play brings it back, in step');
    await page.click('.ad-controls button[aria-label="Sound"]');
    await sleep(300);
    ok(await page.evaluate(() => window.__ac.state === 'suspended'), 'Sound off silences it');
    await seek(page, 30000);
    await page.click('.ad-controls button[aria-label="Replay"]');
    await sleep(300);
    ok((await state(page)).ms < 1000, 'Replay goes back to the start');

    console.log('\n  ── the story');
    await page.evaluate(() => { window.__MK_AD_SPEED__ = 0; });
    for (const sc of AD.SCENES) {
      for (const c of sc.caption) {
        const at = sc.at + c.at + (c.until ? Math.min(400, (c.until - c.at) / 2) : 500);
        await seek(page, at, 450);
        const shown = await caption(page);
        ok(shown === c.text, `${sc.key}: "${c.text}"${shown === c.text ? '' : ` — showed "${shown}"`}`);
      }
    }
    const text = (ms) => seek(page, ms, 1200).then(() => page.evaluate(() => document.querySelector('.ad-canvas').innerText));
    const a = await text(33500); const b = await text(33500);
    ok(a === b && /Can build\s*57 of 120/.test(a), 'the same moment draws the same picture, every time (the order: "Can build 57 of 120")');
    ok(/All 120 can be built with stock on hand/.test(await text(53500)), 'after the goods receipt: "All 120 can be built with stock on hand"');
    await seek(page, 75500, 1200);
    const roles = await page.evaluate(() => ({
      active: document.querySelector('.ad-role.is-active')?.textContent.trim(),
      yes: [...document.querySelectorAll('.ad-cap-row.is-yes')].map((r) => r.textContent.trim()),
    }));
    ok(/Procurement/.test(roles.active) && roles.yes.join(',') === 'Purchase orders,Goods receipt',
      `the roles card shows what a role may do, from its real permissions (Procurement: ${roles.yes.join(', ')})`);
    ok(/Two invoices are overdue/.test(await text(79600)), 'Ask AI answers the question it was asked');
    const menu = await text(85600);
    ok(/not yet read/.test(menu) && /awaiting approval/.test(menu) && /missing an e-way bill/.test(menu), 'the menu counts what is waiting, in the app\'s own words');
    await seek(page, AD.AD_MS);
    const cta = await page.evaluate(() => { const l = document.querySelector('a.ad-cta'); return l && { href: l.getAttribute('href'), text: l.textContent.trim() }; });
    ok(cta && cta.href === '/login' && /Test Maks Ops/.test(cta.text), `it ends on a real link: "${cta?.text}" → ${cta?.href}`);
    ok(await page.evaluate(() => document.querySelectorAll('.ad-sr li').length) === AD.SCENES.length, 'the whole story is there as text for screen readers');
    ok(await page.evaluate(() => document.querySelector('.ad-canvas').getAttribute('aria-hidden') === 'true'), 'and the picture itself is hidden from them');
    await page.close();

    console.log('\n  ── reduced motion');
    const r = await open({ reduced: true });
    await toAd(r.page);
    await r.page.evaluate(() => { window.__MK_AD__.seek(51000); });
    await sleep(600);
    const rs = await state(r.page);
    const inv = AD.SCENES.find((x) => x.key === 'grn');
    ok(rs.reduced && rs.viewMs === inv.at + inv.still, 'each scene is shown finished');
    ok(await r.page.evaluate(() => document.querySelector('.ad-frame').classList.contains('is-reduced')), 'with plain fades, not movement');
    await r.page.close();

    console.log('\n  ── on a phone');
    const m = await open({ width: 390, height: 844 });
    await toAd(m.page);
    await m.page.evaluate(() => { window.__MK_AD_SPEED__ = 0; });
    const shape = await m.page.evaluate(() => { const r = document.querySelector('.ad-frame').getBoundingClientRect(); return { w: r.width, h: r.height }; });
    ok((await state(m.page)).layout === 'wide' && Math.abs(shape.h / shape.w - 720 / 1280) < 0.02,
      `it plays as the same 16:9 film, across the screen (${Math.round(shape.w)} × ${Math.round(shape.h)})`);
    let wide = 0;
    for (const ms of [1500, 9000, 13500, 19400, 25000, 31500, 37800, 42500, 47500, 52500, 58000, 64000, 70000, 76000, 82000, 90000]) {
      await seek(m.page, ms, 500);
      wide = Math.max(wide, await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    }
    ok(wide <= 0, 'no moment of it pushes the page sideways');
    await m.page.close();

    console.log('');
    ok(errors.length === 0, `no JavaScript or console errors${errors.length ? `: ${errors.slice(0, 3).join(' / ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ ${e.message}`);
  } finally {
    await browser.close();
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
