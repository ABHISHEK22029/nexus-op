#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Record the marketing videos as MP4 files: the 58-second ad, the
   homepage walkthrough ("From catalogue to cash") and the product film.

   They are not video files — the site draws them live. So this plays each
   one in a browser and captures it frame by frame, with time under its
   control instead of the clock's:

   · Time is stepped exactly 1/30 s per frame. Timers, requestAnimationFrame,
     performance.now and Date are replaced, and every CSS transition and
     keyframe animation is paused and set to the same moment — so each frame
     is exactly what a viewer would see at that instant, however long the
     machine takes to draw it. No dropped or doubled frames.
   · The voice-over is not played aloud. Each clip "plays" for its real
     length (voice-clips.json), so the story waits for the voice exactly as
     it does on the site, and the moment each clip starts is noted. The
     audio track is then built from the same clip files at those moments.
   · The ad's music is made by Web Audio. Its AudioContext is swapped for an
     OfflineAudioContext whose clock follows the stepped time, so the same
     notes are booked at the same moments, then rendered to a WAV.

   Nothing in the videos is changed: they run as on the site.

   Needs a production build served locally (vite build && vite preview) and
   ffmpeg (FFMPEG_PATH, or ffmpeg on PATH).
     UI_BASE=http://localhost:4174 OUT_DIR=… FFMPEG_PATH=… node scripts/record-videos.cjs [ad|walkthrough|film|all]
   SECONDS=5 records only the first few seconds, to check the setup.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const UI = process.env.UI_BASE || 'http://localhost:4174';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(UI)) {
  console.error('record against a local preview build, not the live site'); process.exit(1);
}
const OUT = process.env.OUT_DIR || path.join(os.homedir(), 'Downloads', 'MaksOps-videos');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FPS = Number(process.env.FPS || 30);
const STEP = 1000 / FPS;
const LIMIT_S = Number(process.env.SECONDS || 0);       // 0 = the whole video
const which = (process.argv[2] || 'all').toLowerCase();
const VOICE_DIR = path.join(__dirname, '..', 'public', 'voice');
const CLIPS = require(path.join(__dirname, '..', 'src', 'components', 'marketing', 'flow', 'voice-clips.json')).clips;

fs.mkdirSync(OUT, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-rec-'));
const log = (...a) => console.log(new Date().toLocaleTimeString('en-GB'), ...a);

/* ── what runs in the page before anything else ─────────────────────────── */
const VIRTUAL_TIME = (clips) => {
  let vnow = 0;
  const base = Date.now();
  const RealDate = Date;
  /* Date: new Date() and Date.now() follow the stepped clock */
  class VDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(base + vnow); }
    static now() { return base + vnow; }
  }
  window.Date = VDate;
  Object.defineProperty(performance, 'now', { value: () => vnow, configurable: true });

  /* timers and frames run only when the recorder steps the clock */
  let seq = 0;
  const timers = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn, args }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = ++seq; const every = Math.max(1, Number(ms) || 0); timers.set(id, { at: vnow + every, fn, args, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  let rafs = new Map();
  let rafSeq = 0;
  window.requestAnimationFrame = (cb) => { const id = ++rafSeq; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };

  /* the voice: each clip "plays" for its real length, and when it began is noted */
  const voiceLog = [];
  HTMLMediaElement.prototype.play = function play() {
    if (this.__vtEnd) { window.clearTimeout(this.__vtEnd); this.__vtEnd = null; }
    const src = this.currentSrc || this.src || '';
    const m = src.match(/\/voice\/([^/?#]+\.mp3)/);
    if (m) {
      const entry = { clip: m[1], at: vnow };
      voiceLog.push(entry);
      this.__vtEntry = entry;
      this.__vtEnd = window.setTimeout(() => {
        this.__vtEnd = null; this.__vtEntry = null;
        this.dispatchEvent(new Event('ended'));
      }, clips[m[1]] ?? 2500);
    }
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause() {
    if (this.__vtEnd) { window.clearTimeout(this.__vtEnd); this.__vtEnd = null; }
    if (this.__vtEntry) { this.__vtEntry.stop = vnow; this.__vtEntry = null; }
  };

  /* the ad's music: an offline context whose clock is the stepped clock */
  const RealOffline = window.OfflineAudioContext;
  function VAudioContext() {
    const ctx = new RealOffline(2, 48000 * 100, 48000);   // longer than the ad (92 s)
    const t0 = vnow;
    Object.defineProperty(ctx, 'currentTime', { get: () => Math.max(0, (vnow - t0) / 1000) });
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    ctx.suspend = () => Promise.resolve();
    ctx.resume = () => Promise.resolve();
    ctx.close = () => Promise.resolve();
    window.__vtAudio = { ctx, t0 };
    return ctx;
  }
  window.AudioContext = VAudioContext;
  window.webkitAudioContext = VAudioContext;

  window.__vt = {
    now: () => vnow,
    voice: () => voiceLog,
    /* move the clock on by ms: due timers in order, then one animation frame */
    advance(ms) {
      const target = vnow + ms;
      for (let guard = 0; guard < 100000; guard++) {
        let pick = null;
        for (const [id, t] of timers) if (t.at <= target && (!pick || t.at < pick[1].at)) pick = [id, t];
        if (!pick) break;
        const [id, t] = pick;
        vnow = Math.max(vnow, t.at);
        if (t.every) t.at = vnow + t.every; else timers.delete(id);
        try { typeof t.fn === 'function' && t.fn(...t.args); } catch (e) { console.error(e); }
      }
      vnow = target;
      const due = [...rafs.values()];
      rafs = new Map();
      for (const cb of due) { try { cb(vnow); } catch (e) { console.error(e); } }
    },
    /* every CSS transition and animation, held at the stepped moment */
    sync() {
      for (const a of document.getAnimations()) {
        if (a.__vstart == null) { a.__vstart = vnow; a.pause(); }
        try { a.currentTime = vnow - a.__vstart; } catch { /* finished and gone */ }
      }
    },
    /* the ad's music, rendered and returned as 16-bit stereo WAV (base64) */
    async renderAudio() {
      const a = window.__vtAudio;
      if (!a) return null;
      const buf = await a.ctx.startRendering();
      const n = buf.length, ch = 2;
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
      const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
      out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
      out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
      let o = 44;
      for (let i = 0; i < n; i++) {
        for (const s of [L[i], R[i]]) { const v = Math.max(-1, Math.min(1, s)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
      }
      const bytes = new Uint8Array(out.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { wav: btoa(bin), t0: a.t0 };
    },
  };
};

/* ── helpers ────────────────────────────────────────────────────────────── */
const run = (args) => new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
  p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg failed (${c}): ${err.slice(-1500)}`))));
});

/* a frame step: the clock, then React's work, then the animations */
async function step(page) {
  await page.evaluate((ms) => window.__vt.advance(ms), STEP);
  /* React commits and runs effects on MessageChannel tasks: let them run */
  await page.evaluate(() => new Promise((r) => {
    let n = 0;
    const c = new MessageChannel();
    c.port1.onmessage = () => { if (++n >= 4) r(); else c.port2.postMessage(0); };
    c.port2.postMessage(0);
  }));
  await page.evaluate(() => window.__vt.sync());
}

async function newPage(browser, { width, height, dpr = 1 }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.evaluateOnNewDocument(VIRTUAL_TIME, CLIPS);
  /* recording, not browsing: no scrollbars, no caret, no hover states */
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'html::-webkit-scrollbar{display:none} html{scrollbar-width:none} *{caret-color:transparent !important}';
      document.head.appendChild(s);
    });
  });
  page.on('pageerror', (e) => log('page error:', e.message));
  return page;
}

/* settle: real time passes for loading, the clock only a little */
async function settle(page, realMs = 1500) {
  const until = Date.now() + realMs;
  while (Date.now() < until) { await page.evaluate(() => window.__vt.advance(16)); await new Promise((r) => setTimeout(r, 40)); }
}

/* Wait (real time passing, the clock barely) until the selector has drawn. */
async function drawn(page, selector, realMs = 20000) {
  const until = Date.now() + realMs;
  while (Date.now() < until) {
    const h = await page.evaluate((sel) => document.querySelector(sel)?.getBoundingClientRect().height || 0, selector);
    if (h > 50) return true;
    await settle(page, 300);
  }
  throw new Error(`${selector} never appeared`);
}

/* The homepage loads the ad only when it is scrolled near: scroll to its
   section (always there), let it load, then centre the frame itself. */
async function toAd(page) {
  await page.evaluate(() => document.querySelector('.mk-ad-section')?.scrollIntoView({ block: 'center' }));
  await drawn(page, '.ad-frame');
  await page.evaluate(() => document.querySelector('.ad-frame').scrollIntoView({ block: 'center' }));
  await settle(page, 800);
}

/* Capture frames until done() says so, piping JPEGs into ffmpeg. */
async function capture(page, { name, clip, done, tailMs = 1500, size }) {
  const file = path.join(work, `${name}-video.mp4`);
  const scale = size ? ['-vf', `scale=${size.w}:${size.h}:flags=lanczos,setsar=1,format=yuv420p`] : ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p'];
  const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr = (ffErr + d).slice(-4000); });
  const finished = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`encode failed: ${ffErr}`)))));
  const startV = await page.evaluate(() => window.__vt.now());
  let frames = 0, endedAt = null;
  const maxFrames = LIMIT_S ? LIMIT_S * FPS : 30 * 60 * FPS;
  while (frames < maxFrames) {
    const shot = await page.screenshot({ type: 'jpeg', quality: 92, clip, captureBeyondViewport: false });
    if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r));
    frames++;
    if (frames % (FPS * 10) === 0) log(`${name}: ${frames / FPS}s recorded`);
    if (endedAt == null && await done(page)) endedAt = frames;
    if (endedAt != null && frames - endedAt >= Math.round((tailMs / 1000) * FPS)) break;
    await step(page);
  }
  ff.stdin.end();
  await finished;
  return { file, startV, seconds: frames / FPS };
}

/* The voice track: each clip at the moment it began, cut where it was stopped. */
async function voiceTrack(page, name, startV, seconds) {
  const entries = (await page.evaluate(() => window.__vt.voice())).filter((e) => e.at >= startV - 1);
  const out = path.join(work, `${name}-voice.wav`);
  if (!entries.length) {
    await run(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(seconds), out]);
    return { out, count: 0 };
  }
  /* one ffmpeg graph for all clips: trimmed, delayed, mixed */
  const inputs = [];
  const parts = [];
  entries.forEach((e, i) => {
    inputs.push('-i', path.join(VOICE_DIR, e.clip));
    const delay = Math.max(0, Math.round(e.at - startV));
    const len = ((e.stop ?? (e.at + (CLIPS[e.clip] || 2500))) - e.at) / 1000;
    parts.push(`[${i}:a]atrim=0:${len.toFixed(3)},aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[v${i}]`);
  });
  const graph = `${parts.join(';')};${entries.map((_, i) => `[v${i}]`).join('')}amix=inputs=${entries.length}:normalize=0:duration=longest,apad,atrim=0:${seconds.toFixed(3)}[out]`;
  const graphFile = path.join(work, `${name}-graph.txt`);
  fs.writeFileSync(graphFile, graph);
  await run(['-y', ...inputs, '-filter_complex_script', graphFile, '-map', '[out]', '-ar', '48000', out]);
  return { out, count: entries.length };
}

async function mux(name, video, audio, seconds, { audioOffset = 0 } = {}) {
  const final = path.join(OUT, `${name}.mp4`);
  const aIn = audioOffset > 0 ? ['-ss', (audioOffset / 1000).toFixed(3), '-i', audio] : ['-i', audio];
  await run(['-y', '-i', video, ...aIn, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-af', 'apad', '-t', seconds.toFixed(3), '-movflags', '+faststart', final]);
  return final;
}

/* ── the three videos ───────────────────────────────────────────────────── */
async function recordFilm(browser) {
  const page = await newPage(browser, { width: 1920, height: 1080 });
  await page.goto(`${UI}/see-maksops?mode=film`, { waitUntil: 'networkidle0' });
  await settle(page);
  const go = await page.$('.fm-poster-go');
  if (!go) throw new Error('the film\'s start button was not found');
  await go.click();
  await page.mouse.move(1919, 1079);
  await settle(page, 300);
  const r = await capture(page, {
    name: 'product-film', clip: undefined,
    done: (p) => p.evaluate(() => window.__MK_FILM__?.state()?.phase === 'ended'),
    tailMs: 2500,
  });
  const v = await voiceTrack(page, 'product-film', r.startV, r.seconds);
  const file = await mux('Maks Ops - Product film', r.file, v.out, r.seconds);
  await page.close();
  return { file, seconds: r.seconds, clips: v.count };
}

async function recordAd(browser) {
  /* measure the frame, then draw it at a scale that makes it 1920 wide */
  const probe = await newPage(browser, { width: 1440, height: 1100 });
  await probe.goto(`${UI}/`, { waitUntil: 'networkidle0' });
  await toAd(probe);
  const w = await probe.evaluate(() => document.querySelector('.ad-frame')?.getBoundingClientRect().width || 0);
  await probe.close();
  if (!w) throw new Error('the ad was not found on the homepage');
  const dpr = 1920 / w;

  const page = await newPage(browser, { width: 1440, height: 1100, dpr });
  await page.goto(`${UI}/`, { waitUntil: 'networkidle0' });
  await toAd(page);
  const sound = await page.$('.ad-ctl[aria-label="Sound"]');
  if (!sound) throw new Error('the ad\'s Sound button was not found');
  await sound.click();
  await page.mouse.move(0, 0);
  if (!(await page.evaluate(() => !!window.__vtAudio))) throw new Error('pressing Sound did not start the ad\'s audio');
  /* the frame only: its controls are not part of the film — hidden after
     the click, since a hidden button cannot be pressed */
  await page.addStyleTag({ content: '.ad-controls,.ad-progress{visibility:hidden !important} .mkt-nav{visibility:hidden !important} .ad-frame{border-radius:0 !important}' });
  await page.evaluate(() => window.__MK_AD__.seek(0));
  await step(page);
  const box = await page.evaluate(() => { const r = document.querySelector('.ad-canvas').getBoundingClientRect(); return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }; });
  if (process.env.DEBUG_REC) log('ad box', JSON.stringify(box), await page.evaluate(() => JSON.stringify({ y: window.scrollY, h: window.innerHeight, frames: document.querySelectorAll('.ad-frame').length })));
  const r = await capture(page, {
    name: 'ad', clip: box, size: { w: 1920, h: 1080 },
    done: (p) => p.evaluate(() => { const s = window.__MK_AD__?.state(); return !!s && (s.ended || s.phase === 'ended' || s.ms >= window.__MK_AD__.duration); }),
    tailMs: 1500,
  });
  const audio = await page.evaluate(() => window.__vt.renderAudio());
  if (!audio) throw new Error('the ad made no sound to record');
  const wav = path.join(work, 'ad-music.wav');
  fs.writeFileSync(wav, Buffer.from(audio.wav, 'base64'));
  const file = await mux('Maks Ops - 58 second ad', r.file, wav, r.seconds, { audioOffset: r.startV - audio.t0 });
  await page.close();
  return { file, seconds: r.seconds };
}

async function recordWalkthrough(browser) {
  const probe = await newPage(browser, { width: 1440, height: 1200 });
  await probe.goto(`${UI}/`, { waitUntil: 'networkidle0' });
  await probe.evaluate(() => document.querySelector('.fl-root')?.scrollIntoView({ block: 'center' }));
  await drawn(probe, '.fl-root');
  const w = await probe.evaluate(() => document.querySelector('.fl-root')?.getBoundingClientRect().width || 0);
  await probe.close();
  if (!w) throw new Error('the walkthrough was not found on the homepage');
  const M = 16;                       // a margin of page around it, so nothing touches the edge
  const dpr = 1920 / (w + 2 * M);

  const page = await newPage(browser, { width: 1440, height: 1200, dpr });
  await page.goto(`${UI}/`, { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '.mkt-nav{visibility:hidden !important}' });
  await page.evaluate(() => document.querySelector('.fl-root')?.scrollIntoView({ block: 'center' }));
  await drawn(page, '.fl-root');
  await page.evaluate(() => document.querySelector('.fl-root').scrollIntoView({ block: 'center' }));
  await settle(page, 500);
  const voice = await page.$('.fl-voice, button[aria-label="Voice-over"]');
  if (!voice) throw new Error('the walkthrough\'s voice button was not found');
  await voice.click();
  await page.mouse.move(0, 0);
  await step(page);
  const box = await page.evaluate(() => { const r = document.querySelector('.fl-root').getBoundingClientRect(); return { x: r.x + window.scrollX - 16, y: r.y + window.scrollY - 16, width: r.width + 32, height: r.height + 32 }; });
  /* one cycle: from stage 1, through stage 7 and the closing card, until it starts again */
  const stageNow = () => page.evaluate(() => {
    const items = [...document.querySelectorAll('.fl-strip [aria-label]')];
    const i = items.findIndex((el) => /showing now/.test(el.getAttribute('aria-label')));
    return i;
  });
  let seenLast = false;
  const r = await capture(page, {
    name: 'walkthrough', clip: box,
    done: async () => {
      const i = await stageNow();
      if (i >= 6) seenLast = true;
      return seenLast && i === 0;
    },
    tailMs: 0,
  });
  const v = await voiceTrack(page, 'walkthrough', r.startV, r.seconds);
  const file = await mux('Maks Ops - From catalogue to cash (walkthrough)', r.file, v.out, r.seconds);
  await page.close();
  return { file, seconds: r.seconds, clips: v.count };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
  const results = [];
  try {
    if (which === 'ad' || which === 'all') { log('recording the ad…'); results.push(['ad', await recordAd(browser)]); }
    if (which === 'walkthrough' || which === 'all') { log('recording the walkthrough…'); results.push(['walkthrough', await recordWalkthrough(browser)]); }
    if (which === 'film' || which === 'all') { log('recording the product film…'); results.push(['film', await recordFilm(browser)]); }
  } finally {
    await browser.close().catch(() => {});
  }
  for (const [k, r] of results) log(`${k}: ${r.file} — ${r.seconds.toFixed(1)} s${r.clips != null ? `, ${r.clips} voice clips` : ''}`);
  fs.rmSync(work, { recursive: true, force: true });
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
