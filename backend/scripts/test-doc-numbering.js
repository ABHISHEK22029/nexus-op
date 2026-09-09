#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Document numbers must be unique. Two ways they were not.

   Ten call sites built a number as COUNT(*) + 1. That fails when a
   document is deleted — the next one reuses its number — and when two
   people create at the same moment, because both counts complete before
   either insert commits.

   Neither is hypothetical. Four purchase orders on this database share
   Kirashi/FY2026-27/001.

   This raises documents concurrently and after deletions, and asserts the
   numbers are distinct. Everything it makes is removed at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const TAG = `SEQ-${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

let auth;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body };
};

(async () => {
  auth = { Authorization: `Bearer ${await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token)}` };

  const custs = (await call('/customers?limit=5')).body;
  const customerId = ((custs.items || custs)[0] || {}).id;
  const made = [];

  const raise = (n) => call('/sales-quotations', {
    method: 'POST',
    body: JSON.stringify({
      customerId, notes: TAG, gstRate: 18,
      items: [{ description: `${TAG} line ${n}`, quantity: 1, rate: 100 }],
    }),
  });

  /* ── 1. concurrently ──────────────────────────────────────
     In rounds of four, because PG_POOL_MAX is 4 and a wider burst simply
     exhausts the pool — the first version of this fired twenty at once and
     twelve came back "timeout exceeded when trying to connect", which
     measures the connection pool, not the numbering. Four at a time still
     races every allocation against three others, which is the thing being
     tested. The pool ceiling is a real limit and is reported separately. */
  console.log('\n  ── 20 quotations, four at a time, each round racing');
  const burst = [];
  for (let round = 0; round < 5; round++) {
    burst.push(...await Promise.all(
      Array.from({ length: 4 }, (_, i) => raise(round * 4 + i))));
  }
  const okCount = burst.filter(r => r.ok).length;
  ok(okCount === 20, `all 20 were accepted (${okCount})`);
  burst.forEach(r => { if (r.body?.id) made.push(r.body.id); });

  const numbers = burst.filter(r => r.ok).map(r => r.body.quoteNumber);
  const distinct = new Set(numbers);
  ok(distinct.size === numbers.length,
    `every number is distinct — ${distinct.size} unique out of ${numbers.length}` +
    (distinct.size === numbers.length ? '' :
      ` — repeated: ${numbers.filter((n, i) => numbers.indexOf(n) !== i).join(', ')}`));

  /* ── 2. after deletions ───────────────────────────────── */
  console.log('\n  ── delete five, then raise five more');
  const doomed = made.splice(0, 5);
  const deletedNumbers = burst
    .filter(r => doomed.includes(r.body?.id))
    .map(r => r.body.quoteNumber);
  for (const id of doomed) await call(`/sales-quotations/${id}`, { method: 'DELETE' });

  const again = [];
  for (let i = 0; i < 5; i += 4) {
    again.push(...await Promise.all(
      Array.from({ length: Math.min(4, 5 - i) }, (_, j) => raise(100 + i + j))));
  }
  again.forEach(r => { if (r.body?.id) made.push(r.body.id); });
  const newNumbers = again.filter(r => r.ok).map(r => r.body.quoteNumber);

  const reused = newNumbers.filter(n => deletedNumbers.includes(n));
  ok(reused.length === 0,
    `no deleted number was handed out again${reused.length ? ` — reused: ${reused.join(', ')}` : ''}`);
  console.log(`      freed: ${deletedNumbers.join(', ')}`);
  console.log(`      issued: ${newNumbers.join(', ')}`);

  /* ── 3. the sequence, not the row count ───────────────── */
  const { rows: [seq] } = await db.query(
    `SELECT last_seq FROM document_sequences
      WHERE doc_type = 'quotation' AND owner_id = (SELECT id FROM users WHERE LOWER(email)=LOWER($1))`,
    [EMAIL]);
  const { rows: [cnt] } = await db.query('SELECT COUNT(*) c FROM sales_quotations');
  ok(seq && Number(seq.last_seq) > Number(cnt.c),
    `the sequence has moved past the row count — ${seq?.last_seq} issued vs ${cnt.c} rows present`);

  /* ── 4. every existing number is unique WITHIN ITS COMPANY ─
     Per owner, not across the database. Rule 46 requires an invoice
     number to be unique for the supplier issuing it — every business
     starts at INV-0001, and two companies both having one is correct.
     The global check passed only while a single organisation had ever
     issued an invoice; the second one to sign up made it fail while
     nothing was actually wrong. */
  console.log('\n  ── within each company');
  for (const [table, col, label] of [
    ['sales_quotations', 'quote_number', 'quotations'],
    ['customer_orders', 'order_number', 'customer orders'],
    ['sales_invoices', 'invoice_number', 'sales invoices'],
    ['delivery_challans', 'challan_number', 'delivery challans'],
  ]) {
    const { rows } = await db.query(
      `SELECT owner_id, ${col} n, COUNT(*) k FROM ${table} WHERE ${col} IS NOT NULL
        GROUP BY 1, 2 HAVING COUNT(*) > 1`);
    ok(rows.length === 0,
      `${label}: no company issues the same number twice` +
      `${rows.length ? ` — ${rows.map(r => `owner ${r.owner_id}: ${r.n}×${r.k}`).join(', ')}` : ''}`);
  }

  /* ── clean up ─────────────────────────────────────────── */
  for (const id of made) await call(`/sales-quotations/${id}`, { method: 'DELETE' });
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM sales_quotations WHERE notes = $1', [TAG]);
  ok(Number(left.c) === 0, 'test quotations removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
