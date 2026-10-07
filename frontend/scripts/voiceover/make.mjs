#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Records the homepage walkthrough's voice-over.

   Reads the script from src/components/marketing/flow/narration.js and
   speaks each sentence with Kokoro-82M, an open text-to-speech model
   (Apache-2.0, so the recordings are ours to ship). Runs on this machine:
   no account, no API key, nothing sent anywhere but the one-time model
   download from Hugging Face.

     npm install                  once, in this folder
     node make.mjs                record every sentence → public/voice/
     node make.mjs --voice bf_emma --speed 1.05
     node make.mjs --samples      one line in several voices, to choose by ear

   Each sentence becomes public/voice/<hash of its words>.mp3, and
   src/components/marketing/flow/voice-clips.json lists the clips and their
   lengths for the page. Clips no sentence uses any more are deleted.
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KokoroTTS } from 'kokoro-js';
import * as lame from '@breezystack/lamejs';
import { NARRATION, sentences, clipName } from '../../src/components/marketing/flow/narration.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..', '..');
const OUT = path.join(FRONT, 'public', 'voice');
const MANIFEST = path.join(FRONT, 'src', 'components', 'marketing', 'flow', 'voice-clips.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const VOICE = arg('voice', 'af_heart');
const SPEED = Number(arg('speed', '1'));
const SAMPLES = process.argv.includes('--samples');
const KBPS = 64;

/* Float samples → MP3. Mono, the model's own 24 kHz. */
const toMp3 = (samples, rate) => {
  const enc = new lame.Mp3Encoder(1, rate, KBPS);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) parts.push(Buffer.from(b));
  }
  const end = enc.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
};

/* The model leaves a little air at each end; keep 60 ms of it, so clips
   played back to back sound like one speaker pausing, not two takes. */
const trim = (samples, rate) => {
  const floor = 0.004, pad = Math.round(rate * 0.06);
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < floor) a++;
  while (b > a && Math.abs(samples[b]) < floor) b--;
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad));
};

console.log(`loading Kokoro-82M (first run downloads the model, ~310 MB)…`);
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });

const say = async (text, voice) => {
  const audio = await tts.generate(text, { voice, speed: SPEED });
  const clip = trim(audio.audio, audio.sampling_rate);
  return { mp3: toMp3(clip, audio.sampling_rate), ms: Math.round((clip.length / audio.sampling_rate) * 1000) };
};

if (SAMPLES) {
  const dir = path.join(HERE, 'samples');
  fs.mkdirSync(dir, { recursive: true });
  const line = NARRATION.purchase;
  for (const v of ['af_heart', 'af_bella', 'bf_emma', 'am_michael', 'bm_george']) {
    const { mp3, ms } = await say(line, v);
    fs.writeFileSync(path.join(dir, `${v}.mp3`), mp3);
    console.log(`  ${v}.mp3  ${(ms / 1000).toFixed(1)}s`);
  }
  console.log(`\nsamples in ${dir}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const clips = {};
let bytes = 0;
for (const [key, line] of Object.entries(NARRATION)) {
  for (const s of sentences(line)) {
    const name = clipName(s);
    const { mp3, ms } = await say(s, VOICE);
    fs.writeFileSync(path.join(OUT, name), mp3);
    clips[name] = ms;
    bytes += mp3.length;
    console.log(`  ${key.padEnd(10)} ${name.padEnd(12)} ${(ms / 1000).toFixed(1)}s  ${s}`);
  }
}
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.mp3') && !clips[f]) { fs.unlinkSync(path.join(OUT, f)); console.log(`  removed ${f} (no sentence uses it)`); }
}
fs.writeFileSync(MANIFEST, `${JSON.stringify({ voice: VOICE, speed: SPEED, clips }, null, 2)}\n`);
const total = Object.values(clips).reduce((a, b) => a + b, 0);
console.log(`\n${Object.keys(clips).length} clips, ${(total / 1000).toFixed(1)}s of speech, ${(bytes / 1024).toFixed(0)} KB, voice ${VOICE}`);
