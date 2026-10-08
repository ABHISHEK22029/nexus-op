#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The Automation centre, end to end: every rule it offers, as checks.

   1. Recurring schedules — every document type × every frequency, and the
      validation in front of them (create and edit).
   2. When the next one falls: a schedule on the 31st stays on the month's
      last day (31 Jan, 28 Feb, 31 Mar), quarterly and yearly the same, and
      a leap-day schedule comes back on 29 Feb in a leap year.
   3. "Run now" makes exactly the documents that are due, once; nothing for
      a paused or a future schedule; catches up to a cap and says so; and
      two presses at once do not make anything twice.
   4. What it makes is right: the amount, CGST+SGST or IGST by the same
      rule as an invoice raised by hand, the date it was due, a number from
      the company's own series (in that date's financial year), the amount
      in words — and it is in the Expenses / Sales invoices lists.
   5. One company cannot see, change, delete or run another's; roles
      without the permission are refused.
   6. The history of a schedule says what it made, and the ids resolve.
   7. Overdue reminders: one notification per overdue invoice, never two;
      none while switched off; the switch persists.
   8. The PO approval threshold: validated, 0 means off, and every way of
      raising or editing a PO is held for sign-off above it.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.

     API_BASE=http://localhost:5098 node scripts/test-automation.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'autom-%@example.test'`);
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    await c.query('DELETE FROM recurring_runs WHERE profile_id IN (SELECT id FROM recurring_profiles WHERE owner_id = ANY($1))', [ids]).catch(() => {});
    await c.query('DELETE FROM recurring_profiles WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM automation_settings WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM quote_lines WHERE quotation_id IN (SELECT id FROM quotations WHERE owner_id = ANY($1))', [ids]).catch(() => {});
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map((r) => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'autom-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'autom-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Autom ${tag}`, email: `autom-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const email = `autom-${tag}-${stamp}@example.test`;
  const made = await call(owner, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
  if (![200, 201].includes(made.status)) throw new Error(`could not add a ${role}: ${made.status} ${made.body.error || ''}`);
  const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json();
  return { ...r, id: made.body.id ?? r.user?.id };
};
const rowsOf = (b) => (Array.isArray(b) ? b : b.items || b.rows || []);

/* ── calendar arithmetic, written independently of the server's ──
   Occurrence k of a month-based schedule is the start date's day of the
   month, k × step months on, clamped to that month's last day. Computed
   from the start each time, never chained, so a drift cannot hide here. */
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => {
  const [y, m, d0] = iso.split('-').map(Number);
  /* a start on a month's last day stays on the month end (the owner's rule) */
  const day = d0 === new Date(Date.UTC(y, m, 0)).getUTCDate() ? 31 : d0;
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
};
const STEP = { daily: [1, 'd'], weekly: [7, 'd'], monthly: [1, 'm'], quarterly: [3, 'm'], yearly: [12, 'm'] };
const nth = (start, freq, k) => { const [n, u] = STEP[freq]; return u === 'd' ? addDays(start, n * k) : addMonths(start, n * k); };
const occurrences = (start, freq, today, max = 1000) => {
  const out = [];
  for (let k = 0; k < max; k++) { const d = nth(start, freq, k); if (d > today) break; out.push(d); }
  return out;
};
const fyOf = (iso) => { const [y, m] = iso.split('-').map(Number); const s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };

let orgIds = [];
(async () => {
  const swept = await cleanup();
  if (swept) console.log(`   (swept ${swept} account(s) left by an earlier failed run)`);
  try {
    const [{ today }] = await q1(`SELECT ((NOW() AT TIME ZONE 'Asia/Kolkata')::date)::text AS today`);
    const ago = (n) => addDays(today, -n);
    console.log(`   (the server's today, in India: ${today})`);

    const A = await register('a');
    const B = await register('b');
    if (!A.token || !B.token) throw new Error('could not register test accounts');
    const orgA = A.user.orgId ?? A.user.org_id ?? A.user.id;
    const orgB = B.user.orgId ?? B.user.org_id ?? B.user.id;
    orgIds = [orgA, orgB];
    await call(A, 'PUT', '/company-profile', { name: 'Autom Fab Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });
    await call(B, 'PUT', '/company-profile', { name: 'Other Works', gstin: '29AABCO1234F1Z5', stateCode: '29' });
    const cust = async (who, body) => (await call(who, 'POST', '/customers', { ...body, name: `${body.name} ${stamp}` })).body.id;
    const cLocal = await cust(A, { name: 'Local Buyer', state: 'Telangana', gstin: '36ABCDE1234F1Z5', billing_address: 'Hyderabad' });
    const cMh = await cust(A, { name: 'Mumbai Buyer', state: 'Maharashtra', gstin: '27ABCDE1234F1Z5', billing_address: 'Mumbai' });
    const cKaNoGstin = await cust(A, { name: 'Bengaluru Shop', state: 'Karnataka', billing_address: 'Bengaluru' });
    const cShipsOut = await cust(A, { name: 'Ships Elsewhere', state: 'Telangana', gstin: '36ABCDE9999F1Z5', shipping_state: 'Maharashtra', billing_address: 'Hyderabad', shipping_address: 'Pune' });
    const cOfB = await cust(B, { name: 'B Customer', state: 'Karnataka', billing_address: 'Mysuru' });

    /* ── 1 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 1. schedules: every type × every frequency, and validation');
    const FREQS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    const future = addDays(today, 30);
    const madeIds = [];
    for (const f of FREQS) {
      const e = await call(A, 'POST', '/recurring', { docType: 'expense', title: `Exp ${f}`, amount: 1000, frequency: f, nextRun: future, payload: { category: 'Rent' } });
      const i = await call(A, 'POST', '/recurring', { docType: 'sales_invoice', title: `Inv ${f}`, customerId: cLocal, amount: 2000, frequency: f, nextRun: future, payload: { gstRate: 18, termsDays: 15 } });
      ok(e.status === 200 && i.status === 200 && e.body.frequency === f && i.body.frequency === f,
        `${f}: an expense and an invoice schedule are created (${e.status}/${i.status} ${e.body.error || i.body.error || ''})`);
      madeIds.push(e.body.id, i.body.id);
    }
    const listA = (await call(A, 'GET', '/recurring')).body;
    ok(Array.isArray(listA) && madeIds.every((id) => listA.some((p) => p.id === id)), 'all ten are listed');
    const shown = (listA || []).find((p) => p.title === 'Inv monthly');
    ok(shown && shown.next_run === future && Number(shown.amount) === 2000 && shown.customer_name && shown.active === true,
      `with their next run, amount, customer and state (${shown?.next_run}, ${shown?.amount}, ${shown?.customer_name})`);

    const bad = [
      [{ docType: 'expense', title: '', amount: 10, nextRun: future }, 'no title'],
      [{ docType: 'expense', title: '   ', amount: 10, nextRun: future }, 'a blank title'],
      [{ docType: 'expense', title: 'x', amount: 0, nextRun: future }, 'an amount of 0'],
      [{ docType: 'expense', title: 'x', amount: -5, nextRun: future }, 'a negative amount'],
      [{ docType: 'expense', title: 'x', amount: 'lots', nextRun: future }, 'an amount that is not a number'],
      [{ docType: 'expense', title: 'x', amount: 10 }, 'no first run date'],
      [{ docType: 'expense', title: 'x', amount: 10, nextRun: '2026-02-30' }, 'a date that does not exist (30 Feb)'],
      [{ docType: 'expense', title: 'x', amount: 10, nextRun: 'next tuesday' }, 'a date that is not a date'],
      [{ docType: 'expense', title: 'x', amount: 10, nextRun: future, frequency: 'hourly' }, 'an unknown frequency'],
      [{ docType: 'purchase_order', title: 'x', amount: 10, nextRun: future }, 'an unknown document type'],
      [{ docType: 'sales_invoice', title: 'x', amount: 10, nextRun: future }, 'an invoice with no customer'],
      [{ docType: 'sales_invoice', title: 'x', amount: 10, nextRun: future, customerId: cOfB }, "an invoice to another company's customer"],
      [{ docType: 'sales_invoice', title: 'x', amount: 10, nextRun: future, customerId: cLocal, payload: { gstRate: -3 } }, 'a negative GST rate'],
      [{ docType: 'sales_invoice', title: 'x', amount: 10, nextRun: future, customerId: cLocal, payload: { termsDays: 'soon' } }, 'payment terms that are not a number of days'],
    ];
    for (const [body, what] of bad) {
      const r = await call(A, 'POST', '/recurring', body);
      ok(r.status === 400 && r.body.error, `refused: ${what} (${r.status}: ${r.body.error || ''})`);
    }
    const leftovers = (await call(A, 'GET', '/recurring')).body.filter((p) => !madeIds.includes(p.id));
    ok(leftovers.length === 0, 'and nothing refused was saved');

    const target = madeIds[0];
    const badEdits = [
      [{ amount: 0 }, 'an amount of 0'], [{ amount: 'x' }, 'a non-number amount'],
      [{ title: '  ' }, 'a blank title'], [{ frequency: 'fortnightly' }, 'an unknown frequency'],
      [{ nextRun: '2026-13-01' }, 'an impossible date'], [{ active: 'yes' }, 'active that is not true/false'],
    ];
    for (const [body, what] of badEdits) {
      const r = await call(A, 'PATCH', `/recurring/${target}`, body);
      ok(r.status === 400, `an edit is refused too: ${what} (${r.status})`);
    }
    const invSched = madeIds[1];
    const toB = await call(A, 'PATCH', `/recurring/${invSched}`, { customerId: cOfB });
    ok(toB.status === 400, `an invoice schedule cannot be pointed at another company's customer (${toB.status})`);
    const noCust = await call(A, 'PATCH', `/recurring/${invSched}`, { customerId: null });
    ok(noCust.status === 400, `nor left with no customer (${noCust.status})`);
    const goodEdit = await call(A, 'PATCH', `/recurring/${target}`, { amount: 1500, title: 'Exp daily (edited)' });
    ok(goodEdit.status === 200 && Number(goodEdit.body.amount) === 1500 && goodEdit.body.title === 'Exp daily (edited)', 'a good edit is saved');
    // Out of the way: the rest of the run works on its own schedules.
    for (const id of madeIds) await call(A, 'DELETE', `/recurring/${id}`);
    ok((await call(A, 'GET', '/recurring')).body.length === 0, 'deleting removes them');

    /* ── 2 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 2. when the next one falls (month ends, quarters, leap day)');
    const Y = today >= `${today.slice(0, 4)}-03-31` ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    let leap = Number(today.slice(0, 4)); while (!(leap % 4 === 0 && (leap % 100 !== 0 || leap % 400 === 0)) || `${leap}-02-29` > today) leap--;
    const cases = [
      { title: 'Month-end rent', frequency: 'monthly', start: `${Y}-01-31` },
      { title: 'Quarterly AMC', frequency: 'quarterly', start: `${Y - 1}-11-30` },
      { title: 'Leap-day licence', frequency: 'yearly', start: `${leap}-02-29` },
      { title: 'Weekly cleaning', frequency: 'weekly', start: ago(15) },
      { title: 'Daily diesel', frequency: 'daily', start: ago(3) },
    ];
    for (const cs of cases) {
      const r = await call(A, 'POST', '/recurring', { docType: 'expense', title: cs.title, amount: 100, frequency: cs.frequency, nextRun: cs.start, payload: { category: 'Test' } });
      cs.id = r.body.id;
      cs.expect = occurrences(cs.start, cs.frequency, today);
    }
    const run = await call(A, 'POST', '/recurring/run-now');
    ok(run.status === 200, `Run now (${run.status} ${run.body.error || ''})`);
    for (const cs of cases) {
      const got = (await q1(`SELECT expense_date::text AS d FROM expenses WHERE owner_id = $1 AND description = $2 ORDER BY expense_date`, [orgA, cs.title])).map((x) => x.d);
      ok(JSON.stringify(got) === JSON.stringify(cs.expect),
        `${cs.frequency} from ${cs.start}: ${got.length} made, dated ${got.slice(0, 4).join(', ')}${got.length > 4 ? '…' : ''}${JSON.stringify(got) === JSON.stringify(cs.expect) ? '' : ` — expected ${cs.expect.join(', ')}`}`);
      const [p = {}] = cs.id ? await q1('SELECT next_run::text AS n, runs_count FROM recurring_profiles WHERE id = $1', [cs.id]) : [];
      const nextExpected = nth(cs.start, cs.frequency, cs.expect.length);
      ok(p.n === nextExpected && p.runs_count === cs.expect.length, `…and its next run is ${p.n} (expected ${nextExpected})`);
    }
    const monthEnd = (await q1(`SELECT expense_date::text AS d FROM expenses WHERE owner_id = $1 AND description = 'Month-end rent' ORDER BY expense_date`, [orgA])).map((x) => x.d);
    ok(monthEnd[1] === `${Y}-02-${Y % 4 === 0 ? 29 : 28}` && monthEnd[2] === `${Y}-03-31`,
      `31 Jan → ${monthEnd[1]} → ${monthEnd[2]}: back on the 31st after February, not stuck on the 28th`);
    // The rule itself, beyond today's calendar.
    const { nextOccurrence, dayOf } = require('../controllers/RecurringController');
    const anchors = [['2026-04-30', 31], ['2026-02-28', 31], ['2028-02-28', 28], ['2028-02-29', 31], ['2026-01-30', 30], ['2026-01-31', 31], ['2026-06-15', 15]];
    const badAnchor = anchors.filter(([d, want]) => typeof dayOf !== 'function' || dayOf(d) !== want);
    ok(!badAnchor.length, `a schedule started on a month's last day stays on month ends (30 Apr → 31 May → 30 Jun); others keep their day${badAnchor.length ? ` — wrong: ${badAnchor.map((a) => a[0]).join(', ')}` : ''}`);
    const aprStart = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Month-end from April', amount: 10, frequency: 'monthly', nextRun: `${Number(today.slice(0, 4)) + 1}-04-30` });
    const [aprRow] = await q1('SELECT payload FROM recurring_profiles WHERE id = $1', [aprStart.body.id]);
    ok(Number(aprRow?.payload?.anchorDay) === 31, `saved with the month-end anchor (${aprRow?.payload?.anchorDay})`);
    await call(A, 'DELETE', `/recurring/${aprStart.body.id}`);
    const rule = [
      ['2026-01-31', 'monthly', 31, '2026-02-28'], ['2026-02-28', 'monthly', 31, '2026-03-31'],
      ['2028-01-31', 'monthly', 31, '2028-02-29'], ['2026-04-30', 'monthly', 31, '2026-05-31'],
      ['2026-01-30', 'monthly', 30, '2026-02-28'], ['2026-02-28', 'monthly', 30, '2026-03-30'],
      ['2025-11-30', 'quarterly', 30, '2026-02-28'], ['2026-02-28', 'quarterly', 30, '2026-05-30'],
      ['2028-02-29', 'yearly', 29, '2029-02-28'], ['2031-02-28', 'yearly', 29, '2032-02-29'],
      ['2026-12-31', 'monthly', 31, '2027-01-31'], ['2026-12-29', 'weekly', 29, '2027-01-05'],
      ['2028-02-28', 'daily', 28, '2028-02-29'],
    ];
    const wrong = rule.filter(([d, f, a, want]) => typeof nextOccurrence !== 'function' || nextOccurrence(d, f, a) !== want);
    ok(!wrong.length, `the rule: ${rule.length - wrong.length}/${rule.length} cases right${wrong.length ? ` — wrong: ${wrong.map((w) => `${w[0]} ${w[1]}`).join(', ')}` : ''}`);

    /* ── 3 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 3. "Run now": exactly what is due, once');
    const again = await call(A, 'POST', '/recurring/run-now');
    ok(again.status === 200 && again.body.generated === 0 && (again.body.items || []).length === 0, `a second press makes nothing (${again.body.generated})`);
    ok(again.body.next && again.body.next.next_run > today, `and says what comes next (${again.body.next?.title} on ${again.body.next?.next_run})`);
    const paused = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Paused thing', amount: 50, frequency: 'daily', nextRun: ago(2) });
    const pz = await call(A, 'PATCH', `/recurring/${paused.body.id}`, { active: false });
    const later = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Not yet', amount: 50, frequency: 'monthly', nextRun: addDays(today, 1) });
    const r3 = await call(A, 'POST', '/recurring/run-now');
    const pausedMade = await q1(`SELECT count(*)::int n FROM expenses WHERE owner_id = $1 AND description IN ('Paused thing','Not yet')`, [orgA]);
    ok(pz.status === 200 && pz.body.active === false && r3.body.generated === 0 && pausedMade[0].n === 0,
      'a paused schedule and one not due until tomorrow make nothing');
    const resumed = await call(A, 'PATCH', `/recurring/${paused.body.id}`, { active: true });
    const r4 = await call(A, 'POST', '/recurring/run-now');
    ok(resumed.status === 200 && r4.body.expenses === 3, `resumed, it catches up its three days (${r4.body.expenses})`);
    await call(A, 'DELETE', `/recurring/${paused.body.id}`); await call(A, 'DELETE', `/recurring/${later.body.id}`);

    const capped = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Seventy days behind', amount: 10, frequency: 'daily', nextRun: ago(70) });
    const c1 = await call(A, 'POST', '/recurring/run-now');
    ok(c1.body.expenses === 62, `a long-neglected schedule catches up at most 62 in one press (${c1.body.expenses})`);
    ok((c1.body.behind || []).some((b) => b.profile === 'Seventy days behind'), `…and the answer says it is still behind (${JSON.stringify(c1.body.behind || null)})`);
    const c2 = await call(A, 'POST', '/recurring/run-now');
    ok(c2.body.expenses === 9 && !(c2.body.behind || []).length, `the next press finishes it (${c2.body.expenses}), 71 in all`);
    const seventy = await q1(`SELECT count(DISTINCT expense_date)::int d, count(*)::int n FROM expenses WHERE owner_id = $1 AND description = 'Seventy days behind'`, [orgA]);
    ok(seventy[0].n === 71 && seventy[0].d === 71, `one per day, no day twice (${seventy[0].n} documents, ${seventy[0].d} dates)`);
    await call(A, 'DELETE', `/recurring/${capped.body.id}`);

    // Two (and four) presses at once.
    const race = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Raced', amount: 10, frequency: 'daily', nextRun: ago(9) });
    const raced = await Promise.all([1, 2, 3, 4].map(() => call(A, 'POST', '/recurring/run-now')));
    const reported = raced.reduce((s, r) => s + (r.body.expenses || 0), 0);
    const inDb = await q1(`SELECT count(*)::int n, count(DISTINCT expense_date)::int d FROM expenses WHERE owner_id = $1 AND description = 'Raced'`, [orgA]);
    ok(raced.every((r) => r.status === 200) && inDb[0].n === 10 && inDb[0].d === 10 && reported === 10,
      `four presses at the same moment make the ten documents once (${inDb[0].n} in the database, ${reported} reported, statuses ${raced.map((r) => r.status).join('/')})`);
    await call(A, 'DELETE', `/recurring/${race.body.id}`);

    /* ── 4 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 4. what it makes is right');
    const exp = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'Office rent', amount: 45000.5, frequency: 'monthly', nextRun: today, payload: { category: 'Rent', paidTo: 'Mr Landlord', paymentMode: 'Bank' } });
    const r5 = await call(A, 'POST', '/recurring/run-now');
    const item = (r5.body.items || []).find((i) => i.profile === 'Office rent');
    ok(item && item.type === 'expense' && item.date === today, `the answer names it, its type and its date (${JSON.stringify(item)})`);
    const expList = rowsOf((await call(A, 'GET', '/expenses')).body);
    const e1 = expList.find((e) => e.description === 'Office rent');
    ok(e1 && Number(e1.amount) === 45000.5 && e1.category === 'Rent' && e1.paid_to === 'Mr Landlord' && e1.payment_mode === 'Bank' && String(e1.expense_date).slice(0, 10) === today,
      `the expense is in the Expenses list with its amount, category, payee and date (${e1 && `${e1.amount} ${e1.category} ${e1.paid_to} ${e1.expense_date}`})`);
    await call(A, 'DELETE', `/recurring/${exp.body.id}`);

    // Invoices: the company's own numbering, in the financial year of each date.
    const series = await call(A, 'PUT', '/document-series/sales_invoice', { prefix: 'AUT/{FY}/', pad: 3 });
    ok(series.status === 200, `the company numbers invoices AUT/{FY}/001 (${series.status} ${series.body.error || ''})`);
    const manualSplit = async (customerId) => {
      const m = await call(A, 'POST', '/sales-invoices', { customerId, gstRate: 12, items: [{ description: 'reference', uom: 'nos', quantity: 1, rate: 1000 }] });
      const inv = (await call(A, 'GET', `/sales-invoices/${m.body.id}`)).body;
      await call(A, 'DELETE', `/sales-invoices/${m.body.id}`);
      return inv;
    };
    const taxCases = [
      ['a customer in our own state', cLocal, false],
      ['a customer in another state (by GSTIN)', cMh, true],
      ['an unregistered customer in another state (no GSTIN)', cKaNoGstin, true],
      ['a customer billed here but shipped to another state', cShipsOut, true],
    ];
    for (const [what, customerId, inter] of taxCases) {
      const ref = await manualSplit(customerId);
      const s = await call(A, 'POST', '/recurring', { docType: 'sales_invoice', title: `Retainer ${customerId}`, customerId, amount: 25000, frequency: 'monthly', nextRun: today, payload: { gstRate: 12, termsDays: 15 } });
      const peeked = (await call(A, 'GET', '/sales-invoices/next-number')).body.number;
      const r = await call(A, 'POST', '/recurring/run-now');
      const it = (r.body.items || []).find((i) => i.profile === `Retainer ${customerId}`);
      const runs = (await call(A, 'GET', `/recurring/${s.body.id}/runs`)).body;
      const invId = Array.isArray(runs) && runs[0]?.result_id;
      const inv = invId ? (await call(A, 'GET', `/sales-invoices/${invId}`)).body : {};
      const split = inv.interstate ? `IGST ${inv.igst}` : `CGST ${inv.cgst} + SGST ${inv.sgst}`;
      ok(!!inv.interstate === inter && !!ref.interstate === inter && Number(inv.gst_total) === 3000 &&
         (inter ? Number(inv.igst) === 3000 && Number(inv.cgst) === 0 : Number(inv.cgst) === 1500 && Number(inv.sgst) === 1500),
        `${what}: ${split} — the same as an invoice raised by hand (${ref.interstate ? 'IGST' : 'CGST+SGST'})`);
      if (customerId === cLocal) {
        ok(it && it.type === 'sales_invoice' && it.date === today, 'the answer names the invoice and its date');
        ok(Number(inv.sub_total) === 25000 && Number(inv.net_amount) === 28000 && Number(inv.gst_rate) === 12,
          `₹25,000 + 12% = ₹28,000 (${inv.sub_total} + ${inv.gst_total} = ${inv.net_amount})`);
        ok(/Twenty Eight Thousand/i.test(inv.amount_in_words || '') && !/undefined/.test(inv.amount_in_words || ''), `in words: "${inv.amount_in_words}"`);
        ok(String(inv.invoice_date).slice(0, 10) === today && String(inv.due_date).slice(0, 10) === addDays(today, 15),
          `dated the day it was due, payable in 15 days (${String(inv.invoice_date).slice(0, 10)} → ${String(inv.due_date).slice(0, 10)})`);
        ok(new RegExp(`^AUT/${fyOf(today)}/\\d{3}$`).test(inv.invoice_number || '') && inv.invoice_number === peeked && runs[0]?.result_ref === inv.invoice_number,
          `numbered from the company's series — the next number, ${peeked} (${inv.invoice_number})`);
        ok((inv.items || []).length === 1 && inv.items[0].description === `Retainer ${customerId}` && Number(inv.items[0].amount) === 25000,
          'with one line: the schedule, ₹25,000');
        ok(inv.place_of_supply && inv.bill_to_name, `with a place of supply and a bill-to like any invoice (${inv.place_of_supply}, ${inv.bill_to_name})`);
        const invList = rowsOf((await call(A, 'GET', '/sales-invoices')).body);
        ok(invList.some((x) => x.id === invId), 'and it is in the Sales invoices list');
      }
      await call(A, 'DELETE', `/recurring/${s.body.id}`);
    }
    const fyStart = `${Y - 1}-11-30`;
    const fySched = await call(A, 'POST', '/recurring', { docType: 'sales_invoice', title: 'Quarterly across years', customerId: cLocal, amount: 1000, frequency: 'quarterly', nextRun: fyStart, payload: { gstRate: 18 } });
    await call(A, 'POST', '/recurring/run-now');
    const fyInvs = await q1(`SELECT si.id, si.invoice_number, si.invoice_date::text AS d, si.notes,
                                     (SELECT description FROM sales_invoice_items WHERE sales_invoice_id = si.id LIMIT 1) AS line
                                FROM sales_invoices si WHERE si.owner_id = $1 AND si.notes LIKE $2 ORDER BY si.id`,
      [orgA, `%#${fySched.body.id}%`]);
    const periods = occurrences(fyStart, 'quarterly', today);
    ok(fyInvs.length === periods.length && fyInvs.every((x) => x.d === today && x.invoice_number.startsWith(`AUT/${fyOf(today)}/`)),
      `missed invoices are issued today, numbered in this year's series — never dated back into a filed year (${fyInvs.length} × ${fyInvs[0]?.d}, ${fyInvs.map((x) => x.invoice_number).join(', ')})`);
    const nums = fyInvs.map((x) => Number(x.invoice_number.split('/').pop()));
    ok(nums.every((n, i) => i === 0 || n === nums[i - 1] + 1), 'their numbers run on in order, so the series stays in date order');
    const late = fyInvs.filter((x) => /raised late by catch-up/.test(x.notes || ''));
    ok(late.length >= fyInvs.length - 1 && fyInvs.slice(0, -1).every((x) => /the quarter from/.test(x.line || '')),
      `each one names the quarter it bills: “${fyInvs[0]?.line}”`);
    await call(A, 'DELETE', `/recurring/${fySched.body.id}`);

    /* ── 5 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 5. one company, one set of schedules; roles');
    const aSched = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'A only', amount: 10, frequency: 'daily', nextRun: ago(1) });
    const bList = (await call(B, 'GET', '/recurring')).body;
    ok(Array.isArray(bList) && !bList.some((p) => p.id === aSched.body.id), "another company does not see it");
    const bPause = await call(B, 'PATCH', `/recurring/${aSched.body.id}`, { active: false });
    const bDel = await call(B, 'DELETE', `/recurring/${aSched.body.id}`);
    const bRuns = await call(B, 'GET', `/recurring/${aSched.body.id}/runs`);
    ok(bPause.status === 404 && bDel.status === 404 && bRuns.status === 404,
      `nor pause, delete or read its history (${bPause.status}, ${bDel.status}, ${bRuns.status})`);
    const bRun = await call(B, 'POST', '/recurring/run-now');
    const [still] = await q1('SELECT active, next_run::text n FROM recurring_profiles WHERE id = $1', [aSched.body.id]);
    ok(bRun.status === 200 && bRun.body.generated === 0 && still.active === true && still.n === ago(1), "and its Run now leaves A's schedule alone");

    const FIN = await member(A, 'fin', 'Finance');
    const VIEW = await member(A, 'view', 'Viewer');
    const SALES = await member(A, 'sales', 'Sales');
    const PROC = await member(A, 'proc', 'Procurement');
    const me = async (who) => (await call(who, 'GET', '/auth/me')).body.permissions || {};
    const finPerm = await me(FIN);
    const finInvoices = (finPerm['sales-invoices'] || []).includes('write');
    const fl = await call(FIN, 'GET', '/recurring');
    ok(fl.status === 200 && fl.body.some((p) => p.id === aSched.body.id), "Finance sees the company's schedules");
    const fe = await call(FIN, 'POST', '/recurring', { docType: 'expense', title: 'Finance expense', amount: 10, frequency: 'monthly', nextRun: future });
    ok(fe.status === 200, `Finance may schedule an expense (${fe.status})`);
    const fi = await call(FIN, 'POST', '/recurring', { docType: 'sales_invoice', title: 'Finance invoice', customerId: cLocal, amount: 10, frequency: 'monthly', nextRun: future });
    ok(fi.status === (finInvoices ? 200 : 403),
      `…and an invoice only if the role may raise invoices (it ${finInvoices ? 'may' : 'may not'}: ${fi.status})`);
    const fr = await call(FIN, 'POST', '/recurring/run-now');
    ok(fr.status === 200, `Finance may press Run now (${fr.status})`);
    const vl = await call(VIEW, 'GET', '/recurring');
    const vp = await call(VIEW, 'POST', '/recurring', { docType: 'expense', title: 'x', amount: 10, nextRun: future });
    const vr = await call(VIEW, 'POST', '/recurring/run-now');
    const vpz = await call(VIEW, 'PATCH', `/recurring/${aSched.body.id}`, { active: false });
    const vd = await call(VIEW, 'DELETE', `/recurring/${aSched.body.id}`);
    ok(vl.status === 200 && [vp, vr, vpz, vd].every((r) => r.status === 403),
      `a Viewer may look but not create, run, pause or delete (${[vl, vp, vr, vpz, vd].map((r) => r.status).join(', ')})`);
    const sl = await call(SALES, 'GET', '/recurring');
    const pl = await call(PROC, 'GET', '/recurring');
    const sr = await call(SALES, 'POST', '/recurring/run-now');
    ok(sl.status === 403 && pl.status === 403 && sr.status === 403, `Sales and Procurement are refused (${sl.status}, ${pl.status}, ${sr.status})`);
    const vs = await call(VIEW, 'GET', '/automation-settings');
    const vput = await call(VIEW, 'PUT', '/automation-settings', { po_approval_threshold: 1 });
    const fput = await call(FIN, 'PUT', '/automation-settings', { reminders_enabled: false });
    const pput = await call(PROC, 'PUT', '/automation-settings', { po_approval_threshold: 0 });
    ok(vs.status === 200 && [vput, fput, pput].every((r) => r.status === 403),
      `only the Owner changes automation settings (Viewer reads ${vs.status}; Viewer/Finance/Procurement write ${vput.status}/${fput.status}/${pput.status})`);
    await call(A, 'DELETE', `/recurring/${aSched.body.id}`);
    if (fe.body.id) await call(A, 'DELETE', `/recurring/${fe.body.id}`);
    if (fi.body.id) await call(A, 'DELETE', `/recurring/${fi.body.id}`);

    /* ── 6 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 6. the history says what was made');
    const hx = await call(A, 'POST', '/recurring', { docType: 'expense', title: 'History expense', amount: 75, frequency: 'weekly', nextRun: ago(8) });
    const hi = await call(A, 'POST', '/recurring', { docType: 'sales_invoice', title: 'History invoice', customerId: cLocal, amount: 500, frequency: 'monthly', nextRun: today });
    await call(A, 'POST', '/recurring/run-now');
    const hxRuns = (await call(A, 'GET', `/recurring/${hx.body.id}/runs`)).body;
    const hiRuns = (await call(A, 'GET', `/recurring/${hi.body.id}/runs`)).body;
    ok(hxRuns.length === 2 && hiRuns.length === 1, `two expenses and one invoice recorded (${hxRuns.length}, ${hiRuns.length})`);
    const expOpen = await Promise.all(hxRuns.map((r) => call(A, 'GET', `/expenses/${r.result_id}`)));
    ok(expOpen.every((r) => r.status === 200 && r.body.description === 'History expense'), 'each expense id opens the expense it made');
    ok(hxRuns.map((r) => String(r.doc_date || '').slice(0, 10)).sort().join() === [ago(8), ago(1)].join(),
      `each entry carries the date of the document, not just the day it ran (${hxRuns.map((r) => r.doc_date).join(', ')})`);
    const invOpen = await call(A, 'GET', `/sales-invoices/${hiRuns[0].result_id}`);
    ok(invOpen.status === 200 && invOpen.body.invoice_number === hiRuns[0].result_ref, `the invoice id opens ${hiRuns[0].result_ref}`);
    await call(A, 'DELETE', `/expenses/${hxRuns[0].result_id}`);
    const after = (await call(A, 'GET', `/recurring/${hx.body.id}/runs`)).body;
    ok(after.some((r) => r.result_id === hxRuns[0].result_id && r.doc_exists === false), 'a document deleted since is shown as gone, not as a dead link');
    const notes = await q1(`SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND type = 'RECURRING_GENERATED' AND message LIKE '%History expense%'`, [A.user.id]);
    ok(notes[0].n === 1, `one notification for the two expenses caught up, not one each (${notes[0].n})`);
    await call(A, 'DELETE', `/recurring/${hx.body.id}`); await call(A, 'DELETE', `/recurring/${hi.body.id}`);

    /* ── 7 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 7. overdue reminders');
    const s0 = (await call(A, 'GET', '/automation-settings')).body;
    ok(s0.reminders_enabled === true, 'on by default');
    const overdue = async (who, customerId, tag) => (await call(who, 'POST', '/sales-invoices', {
      customerId, invoiceDate: ago(40), dueDate: ago(10), items: [{ description: `Overdue ${tag}`, uom: 'nos', quantity: 1, rate: 1000 }],
    })).body.id;
    const od1 = await overdue(A, cLocal, '1'), od2 = await overdue(A, cMh, '2');
    const notDue = (await call(A, 'POST', '/sales-invoices', { customerId: cLocal, invoiceDate: today, dueDate: addDays(today, 5), items: [{ description: 'Not due', uom: 'nos', quantity: 1, rate: 10 }] })).body.id;
    const paid = await overdue(A, cLocal, 'paid');
    const [{ net_amount: paidNet }] = await q1('SELECT net_amount FROM sales_invoices WHERE id = $1', [paid]);
    const pay = await call(A, 'POST', `/sales-invoices/${paid}/payment`, { amount: Number(paidNet), mode: 'Bank' });
    const odB = await overdue(B, cOfB, 'B');
    const off = await call(A, 'PUT', '/automation-settings', { reminders_enabled: false });
    const offRead = (await call(A, 'GET', '/automation-settings')).body;
    const rOff = await call(A, 'POST', '/recurring/run-now');
    ok(off.status === 200 && offRead.reminders_enabled === false && rOff.body.reminders === 0, 'switched off, it stays off and nothing is chased');
    const badToggle = await call(A, 'PUT', '/automation-settings', { reminders_enabled: 'yes' });
    ok(badToggle.status === 400, `"yes" is not true or false (${badToggle.status})`);
    await call(A, 'PUT', '/automation-settings', { reminders_enabled: true });
    const presses = await Promise.all([1, 2, 3].map(() => call(A, 'POST', '/recurring/run-now')));
    const sent = presses.reduce((s, r) => s + (r.body.reminders || 0), 0);
    const per = await q1(`SELECT entity_id, count(*)::int n FROM notifications WHERE user_id = $1 AND type = 'INVOICE_OVERDUE' GROUP BY entity_id`, [A.user.id]);
    const n = (id) => per.find((x) => x.entity_id === id)?.n || 0;
    ok(sent === 2 && n(od1) === 1 && n(od2) === 1, `switched on, each overdue invoice is chased once — even with three presses at once (${sent} sent; ${n(od1)} + ${n(od2)})`);
    ok(pay.status === 200 && n(paid) === 0 && n(notDue) === 0, 'not a paid invoice, nor one not yet due');
    const [msg] = await q1(`SELECT message, link FROM notifications WHERE user_id = $1 AND type = 'INVOICE_OVERDUE' AND entity_id = $2`, [A.user.id, od1]);
    ok(/₹1,180 outstanding, 10 day\(s\) past due/.test(msg?.message || '') && msg.link === `/sales-invoices/${od1}`, `it says how much and how late, and links to it ("${msg?.message}")`);
    const finNote = await q1(`SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND type = 'INVOICE_OVERDUE'`, [FIN.id]);
    console.log(`      (who hears: the Owner — Finance got ${finNote[0].n}; see the report)`);
    const again2 = await call(A, 'POST', '/recurring/run-now');
    ok(again2.body.reminders === 0, 'a later press does not chase them again');
    const [bStage] = await q1('SELECT reminder_stage FROM sales_invoices WHERE id = $1', [odB]);
    ok(bStage.reminder_stage === 0, "and another company's overdue invoice is not touched by this company's press");

    /* ── 8 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 8. the PO approval threshold');
    for (const [v, what] of [[-1, 'negative'], ['abc', 'not a number'], [true, 'true'], [null, 'null'], ['', 'empty'], [1e17, 'absurdly large']]) {
      const r = await call(A, 'PUT', '/automation-settings', { po_approval_threshold: v });
      ok(r.status === 400, `a ${what} threshold is refused (${r.status})`);
    }
    const vendor = (await call(A, 'POST', '/vendors', { name: `Autom Metals ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' })).body;
    const po = async (value, extra = {}) => call(A, 'POST', '/po', { vendorId: vendor.id, itemName: `Steel ${value}`, quantity: 1, unitPrice: value,
      items: [{ sno: 1, description: `Steel ${value}`, uom: 'kg', quantity: 1, unitPrice: value }], ...extra });
    const zero = await call(A, 'PUT', '/automation-settings', { po_approval_threshold: 0 });
    const big0 = await po(1000000);
    ok(zero.status === 200 && big0.body.approvalStatus === 'Not Required', `0 means off: a ₹10,00,000 PO needs no sign-off (${big0.body.approvalStatus})`);
    const set = await call(A, 'PUT', '/automation-settings', { po_approval_threshold: '50000' });
    ok(set.status === 200 && Number(set.body.po_approval_threshold) === 50000, `a threshold of ₹50,000 is saved (${set.body.po_approval_threshold})`);
    const under = await po(40000), at = await po(50000), over = await po(60000);
    ok(under.body.approvalStatus === 'Not Required' && at.body.approvalStatus === 'Not Required', 'under it, and exactly at it, no sign-off');
    ok(over.body.approvalStatus === 'Pending Approval', `above it, held for sign-off (${over.body.approvalStatus})`);
    const early = await call(A, 'PATCH', `/po/${over.body.id}/approve`);
    ok(early.status === 409, `it cannot be approved before sign-off (${early.status})`);
    const procSign = await call(PROC, 'PATCH', `/po/${over.body.id}/approval`, { decision: 'Approved' });
    ok(procSign.status === 403, `Procurement, who raise POs, cannot sign one off (${procSign.status})`);
    const finSign = await call(FIN, 'PATCH', `/po/${over.body.id}/approval`, { decision: 'Approved' });
    const approved = await call(A, 'PATCH', `/po/${over.body.id}/approve`);
    ok(finSign.status === 200 && approved.status === 200, `Finance signs it off, then it is approved (${finSign.status}, ${approved.status})`);
    const appr = await q1(`SELECT count(*)::int n FROM notifications WHERE type = 'APPROVAL_NEEDED' AND entity_type = 'po' AND entity_id = $1 AND user_id = ANY($2)`, [over.body.id, [A.user.id, FIN.id, PROC.id]]);
    const apprProc = await q1(`SELECT count(*)::int n FROM notifications WHERE type = 'APPROVAL_NEEDED' AND entity_id = $1 AND user_id = $2`, [over.body.id, PROC.id]);
    ok(appr[0].n >= 2 && apprProc[0].n === 0, `the Owner and Finance were asked to sign it off; Procurement was not (${appr[0].n})`);

    const noLines = await call(A, 'POST', '/po', { vendorId: vendor.id, itemName: 'Plate, no line list', quantity: 100, unitPrice: 1000 });
    const [nl] = await q1('SELECT approval_status FROM purchase_orders WHERE id = $1', [noLines.body.id]);
    const nlApprove = await call(A, 'PATCH', `/po/${noLines.body.id}/approve`);
    ok(nl.approval_status === 'Pending Approval' && nlApprove.status === 409,
      `a ₹1,00,000 PO sent without a line list is held too (${nl.approval_status}; approve ${nlApprove.status})`);

    const raise = await call(A, 'POST', `/po/${under.body.id}/items`, [{ sno: 1, description: 'Steel, more of it', uom: 'kg', quantity: 7, unitPrice: 10000 }]);
    const raisedApprove = await call(A, 'PATCH', `/po/${under.body.id}/approve`);
    ok(raise.body.approvalStatus === 'Pending Approval' && raisedApprove.status === 409, 'raising a pending PO above the limit holds it for sign-off');
    const cheapOk = await call(A, 'PATCH', `/po/${at.body.id}/approve`);
    const sneak = await call(A, 'POST', `/po/${at.body.id}/items`, [{ sno: 1, description: 'Steel, much more', uom: 'kg', quantity: 90, unitPrice: 10000 }]);
    const [sneaked] = await q1('SELECT status, approval_status FROM purchase_orders WHERE id = $1', [at.body.id]);
    const [sneakSum] = await q1('SELECT COALESCE(SUM(quantity * "unitPrice"),0)::numeric v FROM po_line_items WHERE "poId" = $1', [at.body.id]);
    ok(cheapOk.status === 200 && sneak.status === 409 && Number(sneakSum.v) === 50000,
      `an approved PO cannot be raised to ₹9,00,000 afterwards (${sneak.status}; lines worth ₹${sneakSum.v}, ${sneaked.status}/${sneaked.approval_status})`);

    const rfq = (await call(A, 'POST', '/quotations', { partDescription: 'SS304 sheet', quantity: 100, unit: 'kg' })).body;
    const line = (await call(A, 'POST', `/quotations/${rfq.id}/quote`, { vendorId: vendor.id, unitPrice: 900 })).body;
    await call(A, 'POST', `/quotations/${rfq.id}/select`, { quoteLineId: line.id });
    const gen = await call(A, 'POST', `/quotations/${rfq.id}/generate-po`, {});
    const [gp] = gen.body.poId ? await q1('SELECT approval_status FROM purchase_orders WHERE id = $1', [gen.body.poId]) : [{}];
    const genApprove = gen.body.poId ? await call(A, 'PATCH', `/po/${gen.body.poId}/approve`) : { status: 0 };
    ok(gen.status === 200 && gp.approval_status === 'Pending Approval' && genApprove.status === 409,
      `a ₹90,000 PO raised from a vendor comparison is held too (${gen.status}; ${gp.approval_status}; approve ${genApprove.status})`);
  } catch (e) {
    fail++; console.log(`   ❌ threw: ${e.stack || e.message}`);
  } finally {
    const n = await cleanup();
    ok(n === 6, `test accounts and everything they made removed (${n} accounts)`);
    const [left] = await q1(`SELECT
        (SELECT count(*)::int FROM users WHERE email LIKE 'autom-%@example.test') AS users,
        (SELECT count(*)::int FROM recurring_profiles WHERE owner_id = ANY($1)) +
        (SELECT count(*)::int FROM expenses WHERE owner_id = ANY($1)) +
        (SELECT count(*)::int FROM sales_invoices WHERE owner_id = ANY($1)) +
        (SELECT count(*)::int FROM purchase_orders WHERE owner_id = ANY($1)) +
        (SELECT count(*)::int FROM customers WHERE owner_id = ANY($1)) AS rows`, [orgIds]);
    ok(left.users === 0 && left.rows === 0, `nothing left behind (${left.users} accounts, ${left.rows} rows of theirs)`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
