#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Records the homepage ad's voice-over.

   Reads VOICE in src/components/marketing/ad/script.js and speaks each
   line with Kokoro-82M, the same open text-to-speech model as the
   walkthrough (make.mjs) — on this machine, no account, no API key. The
   ad is an advertisement, so it is read a touch quicker than the calm
   walkthrough; the voice is the same, so the site has one narrator.

     node make-ad.mjs                  record every line not yet recorded
     node make-ad.mjs --force          record them all again
     node make-ad.mjs --check          say what is missing; records nothing
     node make-ad.mjs --voice af_bella --speed 1.1 --force

   Each line becomes public/voice/ad/<hash of its words>.mp3, and
   src/components/marketing/ad/voice-clips.json lists the clips and their
   lengths (the ad plays them by name; check-film.mjs measures them). A
   line already recorded in the same voice and speed is left alone; clips
   no line uses any more are deleted. The walkthrough's and the film's
   clips (public/voice/*.mp3, make.mjs) are never touched.
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE } from '../../src/components/marketing/ad/script.js';
import { clipName } from '../../src/components/marketing/flow/narration.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..', '..');
const OUT = path.join(FRONT, 'public', 'voice', 'ad');
const MANIFEST = path.join(FRONT, 'src', 'components', 'marketing', 'ad', 'voice-clips.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);
const VOICE_ID = arg('voice', 'af_heart');
const SPEED = Number(arg('speed', '1.08'));
const FORCE = flag('force');
const CHECK = flag('check');
const KBPS = 64;

const LINES = VOICE.map((v) => ({ ...v, name: clipName(v.text) }));
const USED = new Set(LINES.map((l) => l.name));
const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { clips: {} };
const sameVoice = old.voice === VOICE_ID && Number(old.speed) === SPEED;
const have = (name) => Boolean(old.clips?.[name]) && fs.existsSync(path.join(OUT, name));

if (CHECK) {
  const miss = LINES.filter((l) => !have(l.name));
  console.log(`ad ${LINES.length - miss.length}/${LINES.length} lines recorded${old.voice ? ` (${old.voice} at ${old.speed}×)` : ''}`);
  for (const l of miss) console.log(`   missing  ${String(l.at).padStart(6)} ms  ${l.text}`);
  process.exit(miss.length ? 1 : 0);
}

/* Float samples → MP3. Mono, the model's own 24 kHz. */
const toMp3 = async (samples, rate) => {
  const lame = await import('@breezystack/lamejs');
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

/* Keep 60 ms of the air the model leaves at each end. */
const trim = (samples, rate) => {
  const floor = 0.004, pad = Math.round(rate * 0.06);
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < floor) a++;
  while (b > a && Math.abs(samples[b]) < floor) b--;
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad));
};

/* Every line as loud as the next. The model's takes vary by several dB —
   a short line can come out noticeably quieter — and in an ad a quiet line
   sounds like a mistake. So each clip is brought to the same loudness
   (RMS). A sharp consonant would otherwise cap how far a line can come
   up, so the few samples above −4.4 dBFS are rounded off by a soft knee
   that never passes −1 dBFS — a limiter, as a voice is mastered for
   broadcast — instead of the whole line being held down. */
const TARGET_RMS = 10 ** (-19 / 20);
const PEAK_CAP = 10 ** (-1 / 20);
const KNEE = 0.6;
const measure = (samples) => {
  let sum = 0, peak = 0;
  for (const s of samples) { sum += s * s; peak = Math.max(peak, Math.abs(s)); }
  return { rms: Math.sqrt(sum / Math.max(1, samples.length)), peak };
};
const limit = (y) => {
  const a = Math.abs(y);
  return a <= KNEE ? y : Math.sign(y) * (KNEE + (PEAK_CAP - KNEE) * Math.tanh((a - KNEE) / (PEAK_CAP - KNEE)));
};
const level = (samples) => {
  const raw = measure(samples);
  let gain = TARGET_RMS / raw.rms;
  let out = samples;
  for (let pass = 0; pass < 4; pass++) {         // the knee takes a little level; make it back
    out = Float32Array.from(samples, (s) => limit(s * gain));
    const now = measure(out).rms;
    if (Math.abs(now - TARGET_RMS) / TARGET_RMS < 0.01) break;
    gain *= TARGET_RMS / now;
  }
  const now = measure(out);
  return { out, levels: { rms: +now.rms.toFixed(4), peak: +now.peak.toFixed(4), raw: +raw.rms.toFixed(4) } };
};

let tts = null;
const say = async (text) => {
  if (!tts) {
    console.log('loading Kokoro-82M (first run downloads the model, ~310 MB)…');
    const { KokoroTTS } = await import('kokoro-js');
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  }
  const audio = await tts.generate(text, { voice: VOICE_ID, speed: SPEED });
  const { out, levels } = level(trim(audio.audio, audio.sampling_rate));
  return { mp3: await toMp3(out, audio.sampling_rate), ms: Math.round((out.length / audio.sampling_rate) * 1000), levels };
};

const clips = {};
const levels = {};
for (const l of LINES) {
  if (have(l.name) && sameVoice) { clips[l.name] = old.clips[l.name]; if (old.levels?.[l.name]) levels[l.name] = old.levels[l.name]; }
}
const writeManifest = () => {
  const ordered = {}, lv = {};
  for (const l of LINES) if (clips[l.name]) { ordered[l.name] = clips[l.name]; if (levels[l.name]) lv[l.name] = levels[l.name]; }
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ voice: VOICE_ID, speed: SPEED, clips: ordered, levels: lv }, null, 2)}\n`);
};

fs.mkdirSync(OUT, { recursive: true });
const todo = LINES.filter((l) => FORCE || !sameVoice || !have(l.name));
console.log(`${todo.length} line(s) to record, voice ${VOICE_ID} at ${SPEED}×`);
for (const l of todo) {
  const { mp3, ms, levels: lv } = await say(l.text);
  fs.writeFileSync(path.join(OUT, l.name), mp3);
  clips[l.name] = ms;
  levels[l.name] = lv;
  writeManifest();
  console.log(`  ${String(l.at).padStart(6)} ms  ${(ms / 1000).toFixed(1)}s  ${l.text}`);
}
writeManifest();
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.mp3') && !USED.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log(`  removed ${f} (no line uses it)`); }
}

/* Where a line would still be speaking when the next begins. */
LINES.forEach((l, i) => {
  const next = LINES[i + 1];
  const end = l.at + (clips[l.name] || 0);
  if (next && end > next.at - 120) console.log(`  ⚠ "${l.text}" runs to ${end} ms, into the next line at ${next.at}`);
});
console.log('done');
