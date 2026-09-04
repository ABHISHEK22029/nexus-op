#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Does the Requirement field survive a round trip?

   The column exists and is in the writable list, and 0 of 39 customers
   have a value. That is consistent with "nobody has typed one yet" and
   equally consistent with "the write path silently drops it" — which is
   exactly what happened to doc_prefix, written by the form and absent
   from the SELECT, so it read back blank forever.

   Writes to a real customer, reads it back through the list endpoint the
   grid uses (not a direct SELECT — the list is where doc_prefix failed),
   then restores the original value.
   ══════════════════════════════════════════════════════════════════════ */
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

(async () => {
  const auth = { 'Content-Type': 'application/json' };
  const t = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: auth, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  auth.Authorization = `Bearer ${t}`;

  const list = await (await fetch(`${API}/customers?limit=1`, { headers: auth })).json();
  const row = (list.items || list)[0];
  if (!row) { console.error('no customers to test against'); process.exit(1); }
  const before = { requirement: row.requirement ?? null, requirement_category: row.requirement_category ?? null };
  console.log(`\n  customer #${row.id} — ${row.name}\n`);

  const CAT = 'Fire doors', TEXT = '90-minute fire-rated door sets, site-measured';

  /* ── write ── */
  const put = await fetch(`${API}/customers/${row.id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ ...row, requirement_category: CAT, requirement: TEXT }),
  });
  ok(put.ok, `PATCH accepted (${put.status})`);

  /* ── read back through the LIST, which is what the grid renders ── */
  const back = await (await fetch(`${API}/customers?limit=200`, { headers: auth })).json();
  const got = (back.items || back).find(c => c.id === row.id);
  ok(!!got, 'customer still present in the list');
  ok(got?.requirement_category === CAT, `list returns requirement_category → ${JSON.stringify(got?.requirement_category)}`);
  ok(got?.requirement === TEXT, `list returns requirement → ${JSON.stringify(got?.requirement)}`);

  /* There is no GET /customers/:id — registerOwnedCrud registers list,
     create, patch and delete only, and the edit form opens from the row it
     already has in the list. So the list read above IS the read path. */

  /* ── does the search box find it? a field you cannot search for is
        half a feature on a list of 39 ── */
  const found = await (await fetch(`${API}/customers?search=${encodeURIComponent('fire-rated')}`, { headers: auth })).json();
  const hits = (found.items || found).length;
  ok(hits > 0, `search "fire-rated" matches the requirement text (${hits} hit(s))`);

  /* ── restore ── */
  await fetch(`${API}/customers/${row.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ ...row, ...before }),
  });
  const afterList = await (await fetch(`${API}/customers?limit=200`, { headers: auth })).json();
  const restored = (afterList.items || afterList).find(c => c.id === row.id) || {};
  ok((restored.requirement ?? null) === before.requirement, 'original value restored');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
