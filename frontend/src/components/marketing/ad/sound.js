import { useEffect, useRef } from 'react';
import { CUES } from './script';

/* ══════════════════════════════════════════════════════════════════════
   The ad's sound — made in the browser, not downloaded.

   Each cue in script.js names one of the small instruments below: a
   tick, a soft kick for the pulse, a breath of filtered noise for a
   whoosh, a short chime, a warning interval, a rising sweep, and two
   chords. Web Audio builds them as they are needed, so there is no file
   to fetch, and the noise is drawn from a fixed seed so every visit
   hears the same thing.

   Nothing is created until a person turns the sound on: browsers allow
   audio only after a click, and a visitor who never asks for sound never
   pays for an AudioContext. The ad tells the whole story without it.
   ══════════════════════════════════════════════════════════════════════ */

let ctx = null;
let master = null;
let noise = null;

const audio = () => {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(comp).connect(ctx.destination);
  /* one second of noise from a fixed seed (mulberry32) */
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return ctx;
};

const env = (g, at, peak, attack, release) => {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
};

const tone = (freq, { type = 'sine', at, peak = 0.08, attack = 0.005, release = 0.2, to = null, dest = master } = {}) => {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + attack + release);
  env(g, at, peak, attack, release);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + attack + release + 0.05);
};

const hiss = ({ at, dur, from, to, q = 1.2, peak = 0.12, type = 'bandpass' }) => {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = ctx.createGain();
  env(g, at, peak, dur * 0.45, dur * 0.55);
  s.connect(f).connect(g).connect(master);
  s.start(at, 0, dur + 0.05);
};

const chord = (freqs, { at, peak = 0.05, attack = 0.25, release = 2.2, type = 'triangle' }) => {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.connect(master);
  freqs.forEach((f, i) => tone(f, { type, at: at + i * 0.04, peak, attack, release, dest: lp }));
};

const INSTRUMENTS = {
  tick: (at) => tone(2400, { at, peak: 0.025, release: 0.03 }),
  click: (at) => hiss({ at, dur: 0.03, from: 3200, to: 2600, q: 2, peak: 0.16, type: 'highpass' }),
  pulse: (at) => tone(92, { at, peak: 0.22, attack: 0.004, release: 0.32, to: 46 }),
  whoosh: (at) => hiss({ at, dur: 0.7, from: 380, to: 2600, q: 0.9, peak: 0.1 }),
  hush: (at) => hiss({ at, dur: 0.4, from: 1800, to: 300, q: 0.7, peak: 0.05, type: 'lowpass' }),
  chime: (at) => { tone(1318.5, { type: 'triangle', at, peak: 0.05, release: 0.9 }); tone(1975.5, { at: at + 0.07, peak: 0.03, release: 0.8 }); },
  warn: (at) => { tone(392, { type: 'triangle', at, peak: 0.07, release: 0.3 }); tone(370, { type: 'triangle', at: at + 0.24, peak: 0.07, release: 0.45 }); },
  rise: (at) => { tone(260, { at, peak: 0.05, attack: 0.9, release: 0.4, to: 780 }); hiss({ at, dur: 1.2, from: 500, to: 4000, q: 0.8, peak: 0.04 }); },
  open: (at) => chord([220, 277.2, 329.6, 440], { at, peak: 0.04, attack: 0.5, release: 2.6 }),
  resolve: (at) => chord([261.6, 329.6, 392, 523.3], { at, peak: 0.05, attack: 0.6, release: 3.2 }),
  brand: (at) => { tone(784, { type: 'triangle', at, peak: 0.06, release: 1.4 }); tone(1174.7, { type: 'sine', at: at + 0.12, peak: 0.045, release: 1.8 }); },
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

/* The picture's clock reaches React twenty times a second — too coarse
   for a rhythm. So each update books the cues of the next 150 ms at their
   exact moments on the audio clock, and remembers how far it has booked.
   A replay or a jump starts the booking again from the new place, so it
   never fires a burst of the cues it skipped. */
const AHEAD = 150;
export function useAdSound(ms, { on, playing }) {
  const booked = useRef(-1);
  useEffect(() => {
    if (!on || !playing || !ctx) { booked.current = ms; return; }
    if (ms < booked.current - AHEAD - 50 || ms > booked.current + 400) booked.current = ms;
    const until = ms + AHEAD;
    const base = ctx.currentTime + 0.03;
    for (const c of CUES) {
      if (c.at > booked.current && c.at <= until) INSTRUMENTS[c.name]?.(base + Math.max(0, c.at - ms) / 1000);
    }
    booked.current = Math.max(booked.current, until);
  }, [ms, on, playing]);
}

export const supportsSound = () => typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
