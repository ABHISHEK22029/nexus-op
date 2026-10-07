#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Keeps the product film honest. No browser — runs in a second, and is
   part of `npm run check`.

   The film may only show what Maks Ops really does. These checks fail the
   moment the film and the product disagree:

     registry   every chapter folder has a script and a scene, keys match
                folders, beats start at 0 and run in order inside the
                chapter
     voice      at most two sentences a beat, none over 120 characters,
                no record numbers (they would read out wrongly and date
                the recording); with --require-voice, every sentence is
                recorded and fits its beat
     truth      every label a chapter claims to show still appears in the
                app's source — rename "Send enquiry" in the app and the
                film fails until it is updated too
     numbers    the sample transaction adds up: 143 + 180 = 323, the
                order total, buildable 57, the PO over its threshold
     formats    every record number is exactly what the backend issues
                (shared/docNumber, shared/docSeries)
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, '..');
const SRC = path.join(FRONT, 'src');
const FILM = path.join(SRC, 'components', 'marketing', 'film');
const require = createRequire(import.meta.url);
const REQUIRE_VOICE = process.argv.includes('--require-voice');

const { CHAPTERS } = await import(pathURL(path.join(FILM, 'chapters.js')));
const TX = await import(pathURL(path.join(SRC, 'components', 'marketing', 'data', 'transaction.js')));
const NARR = await import(pathURL(path.join(SRC, 'components', 'marketing', 'flow', 'narration.js')));
function pathURL(p) { return new URL(`file:///${p.replace(/\\/g, '/')}`).href; }

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✖ ${msg}`); };
const section = (name, fn) => { const before = failures; fn(); if (failures === before) console.log(`✅ ${name}`); };

/* ── registry ── */
section(`film registry: ${CHAPTERS.length} chapters, every one complete and in order`, () => {
  const folders = fs.readdirSync(path.join(FILM, 'chapters'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const keys = CHAPTERS.map((c) => c.key);
  for (const f of folders) if (!keys.includes(f)) fail(`chapters/${f} exists but is not listed in chapters.js`);
  if (new Set(keys).size !== keys.length) fail('two chapters share a key');
  for (const c of CHAPTERS) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.key)) fail(`${c.key}: a key must be lower-case letters, digits and dashes — it is a link`);
    for (const file of ['script.js', 'Scene.jsx']) {
      if (!fs.existsSync(path.join(FILM, 'chapters', c.key, file))) fail(`${c.key}: missing ${file}`);
    }
    if (!c.title || !c.kicker || !c.sr || !c.seo?.body) fail(`${c.key}: needs title, kicker, sr and seo.body`);
    if (!(c.duration > 0)) fail(`${c.key}: no duration`);
    const beats = c.beats || [];
    if (!beats.length || beats[0].at !== 0) fail(`${c.key}: the first beat must start at 0`);
    beats.forEach((b, i) => {
      if (!b.key) fail(`${c.key}: beat ${i} has no key`);
      if (i && !(b.at > beats[i - 1].at)) fail(`${c.key}.${b.key}: beats must run in order`);
      if (b.at >= c.duration) fail(`${c.key}.${b.key}: starts after the chapter ends`);
    });
  }
});

/* ── voice ── */
const ID_LIKE = /\b(ENQ|QT|CO|PO|GRN|PROD|DC|INV)-\d|FY\d{4}|\/\d{3}\b/;
section('film narration: short, spoken sentences with no record numbers in them', () => {
  for (const c of CHAPTERS) {
    for (const b of c.beats || []) {
      if (!b.voice) continue;
      const parts = NARR.sentences(b.voice);
      if (parts.length > 2) fail(`${c.key}.${b.key}: ${parts.length} sentences — keep a beat to two`);
      for (const s of parts) {
        if (s.length > 120) fail(`${c.key}.${b.key}: a sentence of ${s.length} characters — keep them under 120`);
        if (ID_LIKE.test(s)) fail(`${c.key}.${b.key}: "${s}" reads out a record number`);
      }
    }
  }
});

const manifestPath = path.join(SRC, 'components', 'marketing', 'flow', 'voice-clips.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
{
  const missing = [], tooLong = [];
  for (const c of CHAPTERS) {
    (c.beats || []).forEach((b, i) => {
      if (!b.voice) return;
      const end = i + 1 < c.beats.length ? c.beats[i + 1].at : c.duration;
      const ms = NARR.sentences(b.voice).reduce((sum, s) => {
        const clip = manifest.clips[NARR.clipName(s)];
        if (!clip) missing.push(`${c.key}.${b.key}: ${s}`);
        return sum + (clip || 0);
      }, 0);
      if (ms && ms > end - b.at + 1500) tooLong.push(`${c.key}.${b.key}: ${(ms / 1000).toFixed(1)}s of voice for a ${((end - b.at) / 1000).toFixed(1)}s beat`);
    });
  }
  if (REQUIRE_VOICE) {
    section('film voice: every sentence recorded, and every line fits its beat', () => {
      missing.forEach((m) => fail(`not recorded — run scripts/voiceover/make.mjs --only film: ${m}`));
      tooLong.forEach((m) => fail(m));
    });
  } else if (missing.length || tooLong.length) {
    console.log(`·  film voice: ${missing.length} sentence(s) not yet recorded, ${tooLong.length} too long for their beat (strict with --require-voice)`);
  } else {
    console.log('✅ film voice: every sentence recorded, and every line fits its beat');
  }
}

/* ── truth ── */
section('film truth: every app label the film shows still exists in the app', () => {
  for (const c of CHAPTERS) {
    for (const [file, label] of c.truth || []) {
      const p = path.join(SRC, file);
      if (!fs.existsSync(p)) { fail(`${c.key}: ${file} no longer exists`); continue; }
      if (!fs.readFileSync(p, 'utf8').includes(label)) fail(`${c.key}: "${label}" is no longer in ${file} — the film shows something the app does not`);
    }
  }
});

/* ── roles ── */
section('film roles: the film\'s copy of every role equals the backend\'s, and every claim holds', () => {
  const roles = require(path.resolve(FRONT, '..', 'backend', 'shared', 'roles.js'));
  const snapPath = path.join(FILM, 'data', 'roles.snapshot.js');
  if (!fs.existsSync(snapPath)) { fail('data/roles.snapshot.js is missing — run npm run film:roles'); return; }
  const src = fs.readFileSync(snapPath, 'utf8');
  const json = src.slice(src.indexOf('{', src.indexOf('export const ROLES')), src.indexOf('};', src.indexOf('export const ROLES')) + 1);
  const snap = JSON.parse(json);
  for (const [role, { permissions }] of Object.entries(snap)) {
    const live = roles.permissionsFor(role).permissions;
    if (JSON.stringify(permissions) !== JSON.stringify(live)) fail(`${role}: the film's permissions differ from backend/shared/roles.js — run npm run film:roles`);
  }
  for (const c of CHAPTERS) {
    for (const cl of c.claims || []) {
      const got = roles.can(cl.role, cl.resource, cl.action);
      if (got !== cl.expect) fail(`${c.key}: claims ${cl.role} ${cl.expect ? 'may' : 'may not'} ${cl.action} ${cl.resource}, but the backend says ${got ? 'may' : 'may not'}`);
    }
  }
});

/* ── numbers ── */
section('film numbers: the sample transaction adds up', () => {
  const { STOCK, SUB, HALF_GST, ROUND_OFF, TOTAL, QTY, RATE, MATERIAL, PO_VALUE, APPROVAL_THRESHOLD } = TX;
  if (STOCK.onHand + STOCK.short !== STOCK.needed) fail('on hand + short ≠ needed');
  if (STOCK.after !== STOCK.onHand + STOCK.short) fail('stock after receipt ≠ on hand + received');
  if (Math.floor(STOCK.onHand / MATERIAL.perPiece) !== STOCK.buildable) fail('buildable ≠ on hand ÷ per piece, rounded down');
  if (QTY * RATE !== SUB) fail('quantity × rate ≠ subtotal');
  if (SUB + 2 * HALF_GST + ROUND_OFF !== TOTAL) fail('subtotal + GST + round-off ≠ total');
  if (!(PO_VALUE > APPROVAL_THRESHOLD)) fail('the PO is meant to be held for sign-off — its value must exceed the threshold');
});

/* ── formats ── */
section('film formats: record numbers are what the backend issues', () => {
  const docNumber = require(path.resolve(FRONT, '..', 'backend', 'shared', 'docNumber.js'));
  const docSeries = require(path.resolve(FRONT, '..', 'backend', 'shared', 'docSeries.js'));
  const ids = TX.makeIds(TX.FILM_DATE);
  const fy = docNumber.financialYear(TX.FILM_DATE);
  if (TX.financialYear(TX.FILM_DATE) !== fy) fail(`financial year: film says ${TX.financialYear(TX.FILM_DATE)}, backend says ${fy}`);
  const po = docNumber.docNumber({ profile: { tradeName: TX.SELLER.name }, seq: 18, date: TX.FILM_DATE });
  if (ids.po !== po) fail(`PO number: film ${ids.po}, backend ${po}`);
  const series = { qt: ['quotation', 7], co: ['customer_order', 12], dc: ['delivery_challan', 9], inv: ['sales_invoice', 147] };
  for (const [k, [type, seq]] of Object.entries(series)) {
    const s = docSeries.SERIES[type];
    const want = docSeries.render(s.prefix, seq, s.pad, TX.FILM_DATE);
    if (ids[k] !== want) fail(`${k}: film ${ids[k]}, backend ${want}`);
  }
  if (ids.enq !== `ENQ-${String(42).padStart(4, '0')}`) fail('enquiry number format');
  if (ids.grn !== `GRN-${String(31).padStart(5, '0')}`) fail('goods receipt number format');
  if (ids.prod !== `PROD-${String(5).padStart(4, '0')}`) fail('production order number format');
  for (const [k, re] of Object.entries(TX.ID_PATTERNS)) if (!re.test(ids[k])) fail(`${k}: ${ids[k]} does not match its pattern`);
});

if (failures) { console.log(`\n${failures} problem(s) with the product film`); process.exit(1); }
