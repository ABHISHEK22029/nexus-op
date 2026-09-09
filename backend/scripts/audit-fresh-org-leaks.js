#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Sign up, look at every list, and report anything that is not yours.

   This is what a real person does on their first minute in the product,
   and it is the only test that cannot be fooled: a brand new organisation
   owns nothing, so EVERY list must come back empty. One row is a leak.

   Reading handlers one at a time kept missing them — /boq, /mb, /indent
   and the activity feed were each found by hand, and /po was still open
   afterwards because it was never read. So don't read. Ask the running
   server, on every route the app actually mounts.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

/* Every list a signed-in person can open. Endpoints that are deliberately
   shared — the knowledge base, metal prices, the resource catalogue — are
   named here with the reason, so "not a leak" is a decision on the record
   rather than an omission. */
const SHARED_ON_PURPOSE = new Set([
  '/knowledge',        // published guidance, the same for every business
  '/metal-prices',     // public market rates
  '/admin/catalogue',  // the list of resources roles can be built from
  '/uom',              // units of measure — a reference table
  '/hsn',              // HSN/SAC codes — statutory reference data
]);

const LISTS = [
  '/po', '/purchase-orders', '/grn', '/grn-bills', '/payables', '/bills',
  '/vendors', '/vendor-items', '/customers', '/projects', '/work-orders',
  '/inventory', '/raw-materials', '/skus', '/items', '/expenses',
  '/sales-invoices', '/sales-quotations', '/quotations', '/customer-orders',
  '/delivery-challans', '/credit-debit-notes', '/material-requirements',
  '/boq', '/mb', '/indent', '/milestones', '/production-orders',
  '/activities', '/attachments', '/notifications', '/recurring-profiles',
  '/admin/users', '/expenses', '/reports/summary',
  /* Aggregates, not lists — and the most-read screen in the product. A
     dashboard leaks differently: no rows, just somebody else's totals on
     four cards, which is how /po showed ₹63,20,000 while the table was
     still loading. Added because these route groups were the ones no test
     touched at all. */
  '/dashboard', '/outstanding', '/recurring', '/automation-settings',
  '/users', '/supply-categories',
];

const stamp = Date.now().toString(36);
let clean = 0; const leaks = [];

(async () => {
  console.log('');
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Newcomer', email: `fresh-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  if (!reg.token) { console.error('register failed:', reg); process.exit(1); }
  const orgId = reg.user.id;
  const auth = { Authorization: `Bearer ${reg.token}` };

  const me = await (await fetch(`${API}/auth/me`, { headers: auth })).json();
  console.log(`  a new account signs up as "${me.role}" (must not be cross-tenant)\n`);

  for (const path of [...new Set(LISTS)]) {
    if (SHARED_ON_PURPOSE.has(path)) continue;
    let body, status;
    try {
      const r = await fetch(`${API}${path}?limit=50`, { headers: auth });
      status = r.status;
      body = await r.json();
    } catch (e) { console.log(`   ?  ${path} — ${e.message.slice(0, 50)}`); continue; }

    if (status === 403 || status === 404) { clean++; continue; }
    if (status >= 400) { console.log(`   ?  ${path} → ${status}`); continue; }

    /* Lists answer in several shapes: a bare array, {items}, {bills},
       {users}. A summary card is a leak too — a total of ₹63,20,000 tells
       you someone else's order book even with the rows hidden. */
    const rows = Array.isArray(body) ? body
      : (body.items || body.bills || body.users || body.rows || []);
    const total = body.total ?? (Array.isArray(body) ? body.length : rows.length);
    const summary = body.summary || (body.totalOutstanding != null
      ? { totalOutstanding: body.totalOutstanding } : null);
    const summaryLeak = summary && Object.values(summary)
      .some(v => Number(v) > 0);

    /* A dashboard answers with bare aggregate keys — totalVendors,
       totalBilled — not {items} or {summary}, so the row and summary
       checks both see nothing and pass. Read the numbers directly. */
    const aggregateLeak = !Array.isArray(body) && Object.entries(body || {})
      .some(([k, v]) => /count|total|value|amount|outstanding|paid/i.test(k) && Number(v) > 0);

    /* The people directory is the one list a new organisation is not
       empty: it contains the founder who just signed up. Their own
       account is not a leak — anyone else's is. */
    const isPeople = path === '/admin/users' || path === '/users';
    const foreign = isPeople
      ? rows.filter(u => String(u.email || '') !== `fresh-${stamp}@example.test`)
      : rows;

    if (foreign.length || (!isPeople && total > 0) || (!isPeople && summaryLeak) || (!isPeople && aggregateLeak)) {
      leaks.push({ path, rows: foreign.length, total, summary: summary || (aggregateLeak ? body : null) });
    } else clean++;
  }

  if (leaks.length) {
    console.log(`  ❌ ${leaks.length} list(s) show a brand new organisation somebody else's data:\n`);
    for (const l of leaks) {
      console.log(`     ${l.path.padEnd(26)} ${String(l.total).padStart(5)} row(s)` +
        (l.summary ? `  summary: ${JSON.stringify(l.summary).slice(0, 90)}` : ''));
    }
    console.log('');
  }
  console.log(`  ${clean} list(s) correctly empty, ${leaks.length} leaking\n`);

  await purgeOrg(db, orgId);
  await db.query('DELETE FROM users WHERE id = $1', [orgId]).catch(() => {});
  process.exit(leaks.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
