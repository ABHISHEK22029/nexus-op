#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   How loud each of the ad's voice-over clips is, and when it is said
   against its scene — the numbers behind "every line as loud as the
   next, and on its beat".

     node levels.mjs

   Reads what make-ad.mjs measured and wrote to the manifest (each clip's
   loudness and peak as it was encoded, and its length); loads no model
   and records nothing.
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE, SCENES, AD_MS } from '../../src/components/marketing/ad/script.js';
import { clipName } from '../../src/components/marketing/flow/narration.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, '..', '..', 'src', 'components', 'marketing', 'ad', 'voice-clips.json');
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const levels = m.levels || {};
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

console.log(`voice ${m.voice} at ${m.speed}×\n`);
let lo = Infinity, hi = -Infinity;
for (const v of VOICE) {
  const name = clipName(v.text);
  const ms = m.clips[name];
  const scene = [...SCENES].reverse().find((s) => s.at <= v.at);
  const end = SCENES[SCENES.indexOf(scene) + 1]?.at ?? AD_MS;
  const l = levels[name];
  if (l) { lo = Math.min(lo, db(l.rms)); hi = Math.max(hi, db(l.rms)); }
  console.log(`${(v.at / 1000).toFixed(2).padStart(6)}s ${scene.key.padEnd(11)} +${String(v.at - scene.at).padStart(4)} ms in, ends ${String(end - (v.at + ms)).padStart(5)} ms before the scene does`
    + `${l ? `   ${db(l.rms).toFixed(1)} dB rms, peak ${db(l.peak).toFixed(1)}` : ''}   ${v.text}`);
}
if (Number.isFinite(lo)) console.log(`\nloudness spread: ${(hi - lo).toFixed(1)} dB (${lo.toFixed(1)} … ${hi.toFixed(1)} dB rms)`);
