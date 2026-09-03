#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   perf-endpoints — how does every screen's data feel at this size?

   Reports the median and worst of several runs per endpoint, because a
   single sample on a hosted database says more about the network than about
   the query. Anything the user waits more than a second for is called out.

   Usage: BASE=http://localhost:5099 EMAIL=… PASSWORD=… node scripts/perf-endpoints.js
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.BASE || 'http://localhost:5099';
const RUNS = Number(process.env.RUNS || 5);

const ENDPOINTS = [
  ['dashboard (all work)',      '/dashboard'],
  ['setup readiness',           '/setup/readiness'],
  ['customers',                 '/customers?limit=25&offset=0'],
  ['customers p10',             '/customers?limit=25&offset=250'],
  ['vendors',                   '/vendors?limit=25&offset=0'],
  ['raw materials',             '/raw-materials?limit=25&offset=0'],
  ['raw materials search',      '/raw-materials?limit=25&search=board'],
  ['products',                  '/skus?limit=25&offset=0'],
  ['customer orders',           '/customer-orders?limit=25&offset=0'],
  ['sales invoices',            '/sales-invoices?limit=25&offset=0'],
  ['delivery challans',         '/delivery-challans?limit=25&offset=0'],
  ['production',                '/production?limit=25&offset=0'],
  ['stock on hand',             '/inventory'],
  ['material requirements',     '/material-requirements'],
  ['material req (short only)', '/material-requirements?shortOnly=true'],
  ['payables',                  '/payables?limit=25&offset=0'],
  ['activity log',              '/activities?limit=25'],
  ['vendor supplies',           '/vendor-items?limit=25&offset=0'],
];

const ms = (n) => `${n.toFixed(0)}ms`;

(async () => {
  const token = await (await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
  })).json().then(d => d.token);
  if (!token) { console.error('could not sign in'); process.exit(1); }
  const headers = { Authorization: `Bearer ${token}` };

  console.log(`\n  endpoint                        median    worst   rows   status`);
  console.log('  ' + '─'.repeat(66));

  const slow = [];
  for (const [label, path] of ENDPOINTS) {
    const times = [];
    let rows = '—', status = 0;
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      try {
        const r = await fetch(`${BASE}${path}`, { headers });
        const body = await r.json().catch(() => null);
        times.push(performance.now() - t0);
        status = r.status;
        if (i === 0 && body) {
          rows = Array.isArray(body) ? body.length
            : typeof body.total === 'number' ? body.total
            : Array.isArray(body.items) ? body.items.length : '—';
        }
      } catch (e) { times.push(NaN); status = 'ERR'; }
    }
    const ok = times.filter(t => !isNaN(t)).sort((a, b) => a - b);
    if (!ok.length) { console.log(`  ${label.padEnd(30)} unreachable`); continue; }
    const med = ok[Math.floor(ok.length / 2)];
    const worst = ok[ok.length - 1];
    const flag = med > 1000 ? '🔴' : med > 500 ? '🟠' : '  ';
    if (med > 500) slow.push({ label, path, med, worst, rows });
    console.log(`  ${label.padEnd(30)}${ms(med).padStart(7)}${ms(worst).padStart(9)}${String(rows).padStart(7)}   ${status} ${flag}`);
  }

  console.log('\n' + '  ' + '─'.repeat(66));
  if (!slow.length) console.log('\n  ✅ every endpoint under half a second at this size\n');
  else {
    console.log(`\n  ${slow.length} endpoint(s) a person would notice waiting for:\n`);
    slow.forEach((s, i) => console.log(`   ${i + 1}. ${s.label} — median ${ms(s.med)}, worst ${ms(s.worst)}  (${s.rows} rows)\n      ${s.path}`));
    console.log('');
  }
  process.exit(0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
