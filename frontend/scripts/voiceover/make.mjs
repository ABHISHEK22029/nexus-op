#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Records the voice-overs: the homepage walkthrough and the product film.

   Reads the two scripts — src/components/marketing/flow/narration.js for
   the homepage, and every chapter's beats in film/chapters.js for the
   film — and speaks each sentence with Kokoro-82M, an open text-to-speech
   model (Apache-2.0, so the recordings are ours to ship). Runs on this
   machine: no account, no API key, nothing sent anywhere but the one-time
   model download from Hugging Face.

     npm install                    once, in this folder
     node make.mjs                  record every sentence not yet recorded
     node make.mjs --only film      just the film (or --only home)
     node make.mjs --chapter receipt   just one chapter of the film
     node make.mjs --force          record again even what is recorded
     node make.mjs --check          say what is missing; records nothing,
                                    loads no model, exits 1 if anything is
     node make.mjs --voice bf_emma --speed 1.05 --force
     node make.mjs --samples        one line in several voices, to choose by ear

   Each sentence becomes public/voice/<hash of its words>.mp3, and
   src/components/marketing/flow/voice-clips.json lists the clips and their
   lengths for both pages. A sentence already recorded in the same voice
   is left alone, so changing one line re-records one clip. Clips that
   neither script uses any more are deleted — whichever script was asked
   for, so recording the homepage never deletes the film's clips.
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NARRATION, sentences, clipName } from '../../src/components/marketing/flow/narration.js';
import { CHAPTERS } from '../../src/components/marketing/film/chapters.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..', '..');
const OUT = path.join(FRONT, 'public', 'voice');
const MANIFEST = path.join(FRONT, 'src', 'components', 'marketing', 'flow', 'voice-clips.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);
const VOICE = arg('voice', 'af_heart');
const SPEED = Number(arg('speed', '1'));
const CHAPTER = arg('chapter', null);
const ONLY = CHAPTER ? 'film' : arg('only', null);
const FORCE = flag('force');
const CHECK = flag('check');
const SAMPLES = flag('samples');
const KBPS = 64;

if (ONLY && !['home', 'film'].includes(ONLY)) { console.error(`--only takes home or film, not "${ONLY}"`); process.exit(2); }
if (CHAPTER && !CHAPTERS.some((c) => c.key === CHAPTER)) {
  console.error(`no chapter "${CHAPTER}" — the chapters are: ${CHAPTERS.map((c) => c.key).join(', ')}`);
  process.exit(2);
}

/* ── the scripts: every sentence, where it is spoken, and its clip ── */
const lines = {
  home: Object.entries(NARRATION).map(([key, line]) => ({ where: key, line })),
  film: CHAPTERS.flatMap((c) => (c.beats || []).filter((b) => b.voice).map((b) => ({ where: `${c.key}.${b.key}`, chapter: c.key, line: b.voice }))),
};
const SCRIPTS = Object.fromEntries(Object.entries(lines).map(([name, list]) => [
  name,
  list.flatMap(({ where, chapter, line }) => sentences(line).map((s) => ({ script: name, where, chapter, s, name: clipName(s) }))),
]));
const ALL = [...SCRIPTS.home, ...SCRIPTS.film];
const USED = new Set(ALL.map((x) => x.name));

const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { clips: {} };
const sameVoice = old.voice === VOICE && Number(old.speed) === SPEED;
const have = (name) => Boolean(old.clips?.[name]) && fs.existsSync(path.join(OUT, name));

const wanted = ALL.filter((x) => (!ONLY || x.script === ONLY) && (!CHAPTER || x.chapter === CHAPTER));
const todo = [];
for (const x of wanted) {
  if (todo.some((y) => y.name === x.name)) continue;          // one clip, however often it is said
  if (FORCE || !sameVoice || !have(x.name)) todo.push(x);
}

/* ── --check: what is missing, without loading anything ── */
if (CHECK) {
  for (const [name, list] of Object.entries(SCRIPTS)) {
    const miss = list.filter((x) => !have(x.name));
    console.log(`${name.padEnd(5)} ${list.length - miss.length}/${list.length} sentences recorded`);
    for (const x of miss) console.log(`   missing  ${x.where.padEnd(28)} ${x.s}`);
  }
  const orphans = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3') && !USED.has(f)) : [];
  if (orphans.length) console.log(`${orphans.length} clip(s) no script uses any more (the next recording deletes them)`);
  if (old.voice && !sameVoice) console.log(`recorded in ${old.voice} at ${old.speed}×; asked for ${VOICE} at ${SPEED}×`);
  process.exit(ALL.some((x) => !have(x.name)) ? 1 : 0);
}

if (!SAMPLES && !sameVoice && old.voice && !FORCE) {
  console.error(`the clips are in ${old.voice} at ${old.speed}×. Mixing voices would sound like two narrators —`);
  console.error('pass --force (and no --only/--chapter) to record everything again in the new voice.');
  process.exit(2);
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

/* The model leaves a little air at each end; keep 60 ms of it, so clips
   played back to back sound like one speaker pausing, not two takes. */
const trim = (samples, rate) => {
  const floor = 0.004, pad = Math.round(rate * 0.06);
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < floor) a++;
  while (b > a && Math.abs(samples[b]) < floor) b--;
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad));
};

let tts = null;
const say = async (text, voice) => {
  if (!tts) {
    console.log('loading Kokoro-82M (first run downloads the model, ~310 MB)…');
    const { KokoroTTS } = await import('kokoro-js');
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  }
  const audio = await tts.generate(text, { voice, speed: SPEED });
  const clip = trim(audio.audio, audio.sampling_rate);
  return { mp3: await toMp3(clip, audio.sampling_rate), ms: Math.round((clip.length / audio.sampling_rate) * 1000) };
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

/* The manifest lists, in script order, every clip that exists for a
   sentence still in use; it is rewritten after each new clip, so a run
   stopped halfway keeps what it recorded. */
const clips = {};
const writeManifest = () => {
  const ordered = {};
  for (const x of ALL) if (clips[x.name] && !ordered[x.name]) ordered[x.name] = clips[x.name];
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ voice: VOICE, speed: SPEED, clips: ordered }, null, 2)}\n`);
};
for (const x of ALL) if (have(x.name) && sameVoice) clips[x.name] = old.clips[x.name];

fs.mkdirSync(OUT, { recursive: true });
console.log(`${todo.length} sentence(s) to record${ONLY ? ` (${CHAPTER ? `chapter ${CHAPTER}` : ONLY})` : ''}, voice ${VOICE}`);
let bytes = 0;
for (const x of todo) {
  const { mp3, ms } = await say(x.s, VOICE);
  fs.writeFileSync(path.join(OUT, x.name), mp3);
  clips[x.name] = ms;
  bytes += mp3.length;
  writeManifest();
  console.log(`  ${x.where.padEnd(28)} ${x.name.padEnd(12)} ${(ms / 1000).toFixed(1)}s  ${x.s}`);
}
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.mp3') && !USED.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log(`  removed ${f} (no sentence uses it)`); }
}
writeManifest();

for (const [name, list] of Object.entries(SCRIPTS)) {
  const names = [...new Set(list.map((x) => x.name))];
  const ms = names.reduce((a, n) => a + (clips[n] || 0), 0);
  console.log(`${name.padEnd(5)} ${names.filter((n) => clips[n]).length}/${names.length} clips, ${(ms / 1000).toFixed(1)}s of speech`);
}
if (todo.length) console.log(`recorded ${todo.length} clip(s), ${(bytes / 1024).toFixed(0)} KB`);
