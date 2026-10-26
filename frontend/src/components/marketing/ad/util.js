/* ══════════════════════════════════════════════════════════════════════
   Plain helpers the ad's acts share: where things go, how numbers count,
   how text types, when the pointer clicks, and the transaction's record
   numbers. No JSX here (parts.jsx and screens.jsx hold the components).
   ══════════════════════════════════════════════════════════════════════ */
import { makeIds } from '../data/transaction';

/** The transaction's record numbers, for today (the PO's year follows it). */
export const IDS = makeIds();

/** A box in canvas pixels, [left, top, width, height?], as a style. */
export const box = ([left, top, width, height]) => ({ left, top, width, height });

/** Ease out (cubic) between 0 and 1. */
const ease = (x) => 1 - (1 - x) ** 3;

/** `t` → 0…1 between `from` and `from + dur`, eased. */
export const prog = (t, from, dur) => ease(Math.min(1, Math.max(0, (t - from) / dur)));

/** A number counting from `a` to `b` over `dur` from `from`. */
export const count = (t, from, dur, a, b) => a + (b - a) * prog(t, from, dur);

/** Indian grouping, as the app prints money: 3,28,500. */
export const inr = (n, dp = 0) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** The first characters of `s` typed by `t` (one every `per` ms from `from`). */
export const typed = (s, t, from, per = 45) => s.slice(0, Math.max(0, Math.floor((t - from) / per)));

/* The pointer takes this long to glide to a waypoint (ad.css, .reel-cursor). */
export const GLIDE = 520;

/** A waypoint that clicks at `when`: the pointer sets off in time to arrive then. */
export const clickAt = (when, x, y) => ({ at: when - GLIDE, x, y, click: true });

/* Window events between a page and its ad (ProductAd.jsx): jump the ad to a
   time (detail: ms), and the ad announcing the scene it reached (detail: key). */
export const AD_SEEK = 'mk-reel-seek';
export const AD_SCENE = 'mk-reel-scene';
/* Start the ad from the top with its sound on (dispatched inside a click). */
export const AD_SOUND = 'mk-reel-sound';
