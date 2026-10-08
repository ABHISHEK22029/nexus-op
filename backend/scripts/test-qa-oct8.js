#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The tester's report of 8 October, the backend half, as checks.

   1. Money is exact. The columns were REAL (≈7 significant digits), so a
      line of ₹14,25,41,685 came back ₹14,25,42,000 and SUMs drifted.
   2. Amount in words for any size ("Rupees undefined Hundred…" before).
   3. Lines and adjustments are checked: a line with figures but no
      description, a unit that is not a unit, and a discount bigger than the
      sub-total are refused — a blank spare row is still dropped quietly.
   4. "Run now" catches a schedule all the way up in one press, dates each
      document on the day it was due, runs only this company's schedules,
      and a second press makes nothing.
   5. Reminders can be switched off, and saving one setting does not reset
      the other.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.
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
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'qa8-%@example.test'`);
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    await c.query('DELETE FROM recurring_runs WHERE profile_id IN (SELECT id FROM recurring_profiles WHERE owner_id = ANY($1))', [ids]).catch(() => {});
    await c.query('DELETE FROM recurring_profiles WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM automation_settings WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map((r) => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'qa8-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'qa8-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `QA ${tag}`, email: `qa8-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

(async () => {
  const swept = await cleanup();
  if (swept) console.log(`   (swept ${swept} account(s) left by an earlier failed run)`);
  try {
    const a = await register('a');
    const b = await register('b');
    if (!a.token || !b.token) throw new Error('could not register test accounts');
    const cust = await call(a, 'POST', '/customers', { name: `Buyer ${stamp}`, gstin: '33BBBBB0000B1Z5' });
    const customerId = cust.body.id;

    console.log('\n  ── 1. money is exact');
    const big = await call(a, 'POST', '/sales-invoices', {
      customerId, gstRate: 18, interstate: true,
      items: [
        { description: 'Big line', uom: 'nos', quantity: 1251480000, rate: 100 },
        { description: 'Odd line', uom: 'kg', quantity: 558987, rate: 255 },
      ],
    });
    ok(big.status === 200, `a large invoice saves (${big.status} ${big.body.error || ''})`);
    const inv = (await call(a, 'GET', `/sales-invoices/${big.body.id}`)).body;
    const odd = (inv.items || []).find((l) => l.description === 'Odd line');
    ok(odd && Number(odd.amount) === 142541685, `₹14,25,41,685 is stored as ₹14,25,41,685 (was ₹14,25,42,000): ${odd?.amount}`);
    ok(Number(inv.sub_total) === 125290541685, `the sub-total is exact: ${inv.sub_total}`);
    ok(typeof inv.sub_total === 'number', 'and it arrives as a number, as before');
    const igst = Math.round(125290541685 * 0.18 * 100) / 100;
    ok(Number(inv.igst) === igst, `IGST is exact to the paisa: ${inv.igst}`);

    console.log('\n  ── 2. amount in words, any size');
    ok(!/undefined/.test(inv.amount_in_words || '') && /Crore/.test(inv.amount_in_words || ''), `"${(inv.amount_in_words || '').slice(0, 70)}…"`);

    console.log('\n  ── 3. lines and adjustments are checked');
    const noDesc = await call(a, 'POST', '/sales-invoices', { customerId, items: [{ description: '', quantity: 5, rate: 10 }] });
    ok(noDesc.status === 400 && /Line 1/.test(noDesc.body.error || ''), `a line with figures but no description is refused (${noDesc.status}: ${noDesc.body.error})`);
    const junkUnit = await call(a, 'POST', '/sales-invoices', { customerId, items: [{ description: 'X', uom: '123333333444', quantity: 1, rate: 1 }] });
    ok(junkUnit.status === 400 && /not a unit/.test(junkUnit.body.error || ''), `a number as the unit is refused (${junkUnit.status})`);
    const tooMuch = await call(a, 'POST', '/sales-invoices', { customerId, discount: 500, items: [{ description: 'X', uom: 'nos', quantity: 1, rate: 100 }] });
    ok(tooMuch.status === 400 && /more than the sub-total/.test(tooMuch.body.error || ''), `a discount bigger than the sub-total is refused (${tooMuch.status})`);
    const spare = await call(a, 'POST', '/sales-quotations', {
      customerId, items: [{ description: 'Bracket', uom: 'nos', quantity: 2, rate: 50 }, { description: '', quantity: '', rate: '' }],
    });
    ok(spare.status === 200, `a blank spare row is still dropped quietly (${spare.status} ${spare.body.error || ''})`);
    const qd = spare.body.id ? (await call(a, 'GET', `/sales-quotations/${spare.body.id}`)).body : {};
    ok((qd.items || []).length === 1, `…leaving the one real line (${(qd.items || []).length})`);

    console.log('\n  ── 4. "Run now"');
    const sched = await call(a, 'POST', '/recurring', {
      docType: 'expense', title: 'Generator diesel', amount: 1000, frequency: 'daily', nextRun: daysAgo(3), payload: { category: 'Diesel / Fuel' },
    });
    const otherSched = await call(b, 'POST', '/recurring', {
      docType: 'expense', title: 'Other company rent', amount: 500, frequency: 'daily', nextRun: daysAgo(2),
    });
    ok(sched.status === 200 && otherSched.status === 200, 'two companies each have a schedule that has fallen behind');
    const run1 = await call(a, 'POST', '/recurring/run-now');
    ok(run1.body.expenses === 4, `one press catches up all four missed days, not one (${run1.body.expenses})`);
    const made = await q1(`SELECT expense_date::text AS expense_date FROM expenses WHERE owner_id = $1 AND description = 'Generator diesel' ORDER BY expense_date`, [a.user.orgId ?? a.user.id]);
    ok(JSON.stringify(made.map((m) => m.expense_date)) === JSON.stringify([daysAgo(3), daysAgo(2), daysAgo(1), daysAgo(0)]),
      `each expense is dated the day it was due (${made.map((m) => m.expense_date).join(', ')})`);
    const run2 = await call(a, 'POST', '/recurring/run-now');
    ok(run2.body.expenses === 0 && run2.body.next && run2.body.next.next_run === daysAgo(-1), `a second press makes nothing, and says the next is tomorrow (${run2.body.next?.next_run})`);
    const otherMade = await q1(`SELECT count(*)::int AS n FROM expenses WHERE description = 'Other company rent'`);
    ok(otherMade[0].n === 0, `another company's schedule is left alone (${otherMade[0].n} made)`);

    console.log('\n  ── 5. reminders can be switched off');
    const s0 = (await call(a, 'GET', '/automation-settings')).body;
    ok(s0.reminders_enabled === true, 'reminders are on by default');
    await call(a, 'PUT', '/automation-settings', { po_approval_threshold: 40000 });
    const off = await call(a, 'PUT', '/automation-settings', { reminders_enabled: false });
    const s1 = (await call(a, 'GET', '/automation-settings')).body;
    ok(off.status === 200 && s1.reminders_enabled === false && Number(s1.po_approval_threshold) === 40000,
      `switched off, and the threshold kept its value (${s1.reminders_enabled}, ₹${s1.po_approval_threshold})`);
    await call(a, 'PUT', '/automation-settings', { po_approval_threshold: 50000 });
    const s2 = (await call(a, 'GET', '/automation-settings')).body;
    ok(s2.reminders_enabled === false, 'saving the threshold does not switch reminders back on');
    const bad = await call(a, 'PUT', '/automation-settings', { po_approval_threshold: -5 });
    ok(bad.status === 400, `a negative threshold is refused (${bad.status})`);
    /* an overdue invoice: no reminder while off, one once on */
    const due = await call(a, 'POST', '/sales-invoices', { customerId, dueDate: daysAgo(5), invoiceDate: daysAgo(35), items: [{ description: 'Overdue', uom: 'nos', quantity: 1, rate: 1000 }] });
    await call(a, 'POST', '/recurring/run-now');
    let st = await q1('SELECT reminder_stage FROM sales_invoices WHERE id = $1', [due.body.id]);
    ok(st[0]?.reminder_stage === 0, 'with reminders off, an overdue invoice is not chased');
    await call(a, 'PUT', '/automation-settings', { reminders_enabled: true });
    await call(a, 'POST', '/recurring/run-now');
    st = await q1('SELECT reminder_stage FROM sales_invoices WHERE id = $1', [due.body.id]);
    ok(st[0]?.reminder_stage === 1, 'switched back on, it is');
  } catch (e) {
    fail++; console.log(`   ❌ ${e.message}`);
  } finally {
    await cleanup();
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
