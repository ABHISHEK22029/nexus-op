import { useEffect, useRef } from 'react';
import { CUES, SCORE, TEMPO } from './script';

/* ══════════════════════════════════════════════════════════════════════
   The ad's sound — a score and its accents, made in the browser.

   script.js writes it down (SCORE: chords and how hard the beat drives,
   section by section; CUES: the accents on the picture). This file turns
   that into notes and plays them with Web Audio: pads of detuned saws, a
   plucked bass, a kick, a snare, hats, and the accents. No files, and
   the noise comes from a fixed seed, so every visit hears the same thing.

   Written to be heard on a laptop or a phone, whose speakers give out
   below ~150 Hz: every low sound carries harmonics or a click that
   those speakers can play, and the mix is brought up to a normal level
   (peaks around −3 dBFS) through a compressor.

   Nothing exists until a person presses Sound — browsers allow audio only
   after a click, and a visitor who never asks never pays for it. Pausing
   the ad suspends the audio clock, so the music stops where the picture
   stops and resumes in step; a jump (Replay, a seek) fades out whatever
   was playing and picks the score up at the new place, sustained chords
   included.
   ══════════════════════════════════════════════════════════════════════ */

const BAR = 240000 / TEMPO;          // 4/4: 2500 ms at 96
const STEP = BAR / 16;               // a sixteenth

/* ── the notes ── */
const N = {
  E2: 82.41, F2: 87.31, G2: 98, A2: 110, C3: 130.81, D3: 146.83,
  F3: 174.61, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, Gs4: 415.3,
  G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  C6: 1046.5, E6: 1318.51, G6: 1567.98, B6: 1975.53,
};
const CHORDS = {
  Am7: { bass: N.A2, pad: [N.A3, N.C4, N.E4, N.G4] },
  Fmaj7: { bass: N.F2, pad: [N.F3, N.A3, N.C4, N.E4] },
  C: { bass: N.C3, pad: [N.C4, N.E4, N.G4] },
  Cmaj7: { bass: N.C3, pad: [N.C4, N.E4, N.G4, N.B4] },
  Cmaj9: { bass: N.C3, pad: [N.C4, N.E4, N.G4, N.B4, N.D5] },
  G: { bass: N.G2, pad: [N.G3, N.B3, N.D4, N.G4] },
  Dm7: { bass: N.D3, pad: [N.D4, N.F4, N.A4, N.C5] },
  E: { bass: N.E2, pad: [N.E4, N.Gs4, N.B4] },
};

/* ── the score, as a list of notes ── */
const BRIGHT = { none: 0.45, pulse: 0.6, drive: 0.9, open: 0.75 };
export const EVENTS = (() => {
  const ev = [];
  for (const s of SCORE) {
    if (s.groove === 'tension') { ev.push({ at: s.from, name: 'drone', dur: s.to - s.from }); continue; }
    let bar = 0;
    for (let at = s.from; at < s.to; at += BAR, bar++) {
      const chord = s.chords[bar % s.chords.length];
      ev.push({ at, name: 'pad', dur: Math.min(BAR, s.to - at), chord, bright: BRIGHT[s.groove] ?? 0.6 });
      const g = s.groove;
      if (g === 'none') continue;
      for (let k = 0; k < 16; k++) {
        const t = at + k * STEP;
        if (t >= s.to) break;
        const bass = CHORDS[chord].bass;
        if ((g === 'drive' && k % 4 === 0) || (g === 'pulse' && (k === 0 || k === 8)) || (g === 'open' && k === 0)) ev.push({ at: t, name: 'kick' });
        if (g === 'drive' && (k === 4 || k === 12)) ev.push({ at: t, name: 'snare' });
        if ((g === 'pulse' || g === 'drive') && k % 2 === 0) ev.push({ at: t, name: 'bass', freq: bass, accent: k % 8 === 0 });
        if (g === 'open' && (k === 0 || k === 8)) ev.push({ at: t, name: 'bass', freq: bass, long: true });
        if (g === 'drive') ev.push({ at: t, name: 'hat', level: k % 4 === 2 ? 1 : 0.5 });
        if (g === 'pulse' && k % 4 === 2) ev.push({ at: t, name: 'hat', level: 0.8 });
        if (g === 'open' && k % 4 === 2) ev.push({ at: t, name: 'hat', level: 0.45 });
      }
    }
  }
  CUES.forEach((c, i) => ev.push({ ...c, i }));
  return ev.sort((a, b) => a.at - b.at);
})();

/* ── the instruments ── */
let ctx = null;
let master = null;
let bus = null;
let noise = null;

const audio = () => {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 8;
  comp.attack.value = 0.004; comp.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = 0.62;
  master.connect(comp).connect(ctx.destination);
  /* two seconds of noise from a fixed seed (mulberry32) */
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return ctx;
};

/* a fresh output for the notes booked from now on; the old one fades */
const freshBus = () => {
  if (bus) {
    const old = bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => old.disconnect(), 500);
  }
  bus = ctx.createGain();
  bus.connect(master);
};

/* a gain envelope: up in `a`, held to `hold`, down over `r` */
const shape = (g, at, peak, a, hold, r) => {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + a);
  if (hold > a) g.gain.setValueAtTime(peak, at + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(hold, a) + r);
  return at + Math.max(hold, a) + r + 0.05;
};

const osc = (type, freq, at, end, dest, { to = null, toAt = 0, detune = 0 } = {}) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + toAt);
  o.detune.value = detune;
  o.connect(dest);
  o.start(at); o.stop(end);
};

const filter = (type, freq, q = 0.7, dest = bus) => {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  f.connect(dest);
  return f;
};

const burst = ({ at, dur, type, from, to = from, q = 1, peak, a = 0.002 }) => {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = ctx.createGain();
  const end = shape(g, at, peak, a, a, dur);
  s.connect(f).connect(g).connect(bus);
  s.start(at, (at * 7.3) % 1.5, dur + 0.1);
  s.stop(end);
};

const tone = (freq, { at, type = 'sine', peak, a = 0.005, hold = 0, r = 0.3, to = null, toAt = 0.1, dest = bus }) => {
  const g = ctx.createGain();
  const end = shape(g, at, peak, a, hold, r);
  g.connect(dest);
  osc(type, freq, at, end, g, { to, toAt });
};

const PLAY = {
  pad: (at, e) => {
    const lp = filter('lowpass', 600 + 1800 * e.bright, 0.5);
    const g = ctx.createGain();
    const dur = e.dur / 1000;
    const end = shape(g, at, 0.05, 0.35, dur, 0.9);
    g.connect(lp);
    for (const f of CHORDS[e.chord].pad) {
      osc('sawtooth', f, at, end, g, { detune: -7 });
      osc('sawtooth', f, at, end, g, { detune: 7 });
    }
  },
  drone: (at, e) => {
    const dur = e.dur / 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.08);
    const lp = filter('lowpass', 900, 0.7);
    g.connect(lp);
    osc('sawtooth', N.A2, at, at + dur + 0.2, g, { to: N.E3 * 1.0, toAt: dur });
    osc('sawtooth', N.A2 * 1.5, at, at + dur + 0.2, g, { to: N.E3 * 1.5, toAt: dur, detune: 5 });
  },
  bass: (at, e) => {
    const lp = filter('lowpass', 300, 4);
    lp.frequency.setValueAtTime(e.accent ? 1800 : 1300, at);
    lp.frequency.exponentialRampToValueAtTime(260, at + 0.22);
    tone(e.freq, { at, type: 'sawtooth', peak: e.accent ? 0.34 : 0.26, a: 0.004, hold: e.long ? 0.4 : 0.08, r: e.long ? 0.5 : 0.16, dest: lp });
    tone(e.freq * 2, { at, type: 'square', peak: 0.05, a: 0.004, r: 0.12, dest: lp });
  },
  kick: (at) => {
    tone(165, { at, peak: 0.75, a: 0.002, r: 0.28, to: 48, toAt: 0.12 });
    burst({ at, dur: 0.012, type: 'highpass', from: 2500, peak: 0.22 });
  },
  snare: (at) => {
    burst({ at, dur: 0.14, type: 'bandpass', from: 1900, q: 0.7, peak: 0.32 });
    tone(196, { at, peak: 0.14, r: 0.07 });
  },
  hat: (at, e) => burst({ at, dur: 0.035, type: 'highpass', from: 7600, peak: 0.12 * (e.level ?? 1) }),
  blip: (at, e) => {
    const f = [N.G6, N.E6, 1760, 1174.66, N.C6][e.i % 5];
    tone(f, { at, type: 'triangle', peak: 0.2, r: 0.09 });
    tone(f * 1.5, { at: at + 0.05, type: 'sine', peak: 0.08, r: 0.08 });
  },
  hush: (at) => burst({ at, dur: 0.35, type: 'lowpass', from: 2400, to: 200, q: 0.7, peak: 0.14 }),
  whoosh: (at) => burst({ at, dur: 0.75, type: 'bandpass', from: 320, to: 3200, q: 0.9, peak: 0.34, a: 0.3 }),
  click: (at) => {
    burst({ at, dur: 0.02, type: 'highpass', from: 3000, q: 1.5, peak: 0.3 });
    tone(2100, { at, type: 'triangle', peak: 0.07, r: 0.03 });
  },
  land: (at) => {
    tone(330, { at, peak: 0.3, r: 0.22, to: 140, toAt: 0.16 });
    tone(N.E5, { at: at + 0.02, type: 'triangle', peak: 0.08, r: 0.4 });
  },
  chime: (at) => {
    tone(N.E6, { at, type: 'triangle', peak: 0.16, r: 1.1 });
    tone(N.B6, { at: at + 0.07, peak: 0.09, r: 1.0 });
  },
  warn: (at) => {
    const lp = filter('lowpass', 1100, 1);
    tone(N.G4, { at, type: 'square', peak: 0.13, hold: 0.18, r: 0.15, dest: lp });
    tone(N.Gs4 * 0.9, { at: at + 0.26, type: 'square', peak: 0.13, hold: 0.22, r: 0.3, dest: lp });
    tone(N.E2, { at, type: 'sawtooth', peak: 0.2, hold: 0.4, r: 0.5, dest: lp });
  },
  rise: (at) => {
    const lp = filter('lowpass', 600, 2);
    lp.frequency.setValueAtTime(500, at);
    lp.frequency.exponentialRampToValueAtTime(4000, at + 1.6);
    tone(N.C3, { at, type: 'sawtooth', peak: 0.12, a: 1.3, hold: 1.5, r: 0.3, to: N.C4, toAt: 1.6, dest: lp });
    burst({ at, dur: 1.6, type: 'bandpass', from: 600, to: 5000, q: 0.8, peak: 0.12, a: 1.2 });
  },
  resolve: (at) => {
    tone(N.C3, { at, type: 'triangle', peak: 0.2, a: 0.6, hold: 2.5, r: 2 });
    tone(N.C3 / 2, { at, peak: 0.08, a: 0.6, hold: 2.5, r: 2 });
    [N.C6, N.E6, N.G6].forEach((f, i) => tone(f, { at: at + 0.3 + i * 0.15, type: 'triangle', peak: 0.05, a: 0.4, hold: 1.5, r: 2 }));
  },
  brand: (at) => {
    [N.C5, N.G5, N.E6].forEach((f, i) => tone(f, { at: at + i * 0.13, type: 'triangle', peak: 0.16, r: 1.9 }));
    tone(N.C6, { at: at + 0.4, peak: 0.06, r: 2.2 });
  },
};

/** Turn the sound on (inside the click that asks for it). */
export const soundOn = () => {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return Boolean(c);
};

/** Silence it, without tearing it down. */
export const soundOff = () => {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
};

export const supportsSound = () => typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);

/* The picture's clock reaches React twenty-five times a second — too
   coarse to play a beat on. So each update books the notes of the next
   150 ms at their exact moments on the audio clock, and remembers how far
   it has booked. */
const AHEAD = 150;
export function useAdSound(ms, { on, playing, ended }) {
  const booked = useRef(null);
  useEffect(() => {
    if (!ctx) return;
    if (!on) { booked.current = null; return; }
    /* paused or scrolled away: stop the clock the notes are booked on, so
       they wait with the picture. At the end, let the last chord ring. */
    if (!playing) {
      if (!ended && ctx.state === 'running') ctx.suspend().catch(() => {});
      return;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const base = ctx.currentTime + 0.03;
    const jumped = booked.current == null || ms < booked.current - AHEAD - 60 || ms > booked.current + 400;
    if (jumped) {
      freshBus();
      /* chords already sounding at this moment start now, for what is left of them */
      for (const e of EVENTS) {
        if (e.dur && e.at <= ms && ms < e.at + e.dur - 200) PLAY[e.name]?.(base, { ...e, dur: e.at + e.dur - ms });
      }
      booked.current = ms;
    }
    const until = ms + AHEAD;
    for (const e of EVENTS) {
      if (e.at > booked.current && e.at <= until) PLAY[e.name]?.(base + Math.max(0, e.at - ms) / 1000, e);
    }
    booked.current = Math.max(booked.current, until);
  }, [ms, on, playing, ended]);
}
