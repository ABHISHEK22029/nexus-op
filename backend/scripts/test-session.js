#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A session in use renews itself (middleware/auth.js, X-Session-Token).

     past half its 12 hours, an answer carries a fresh token; before that,
     none; the fresh one works, is good for another 12 hours, and keeps the
     person's company and current role; a save gets one too
     an expired token, a token from before a password change and a token
     of a switched-off account are refused, and none is renewed
     a browser on another address is allowed to read the header

   The app's side (the sign-in box over the page, nothing typed lost) is
   frontend/scripts/test-session-ui.cjs.

   Local backend (SCHEDULER=off) and throwaway @example.test companies that
   are deleted at the end. Refuses a deployed host.
     API_BASE=http://localhost:5097 node scripts/test-session.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
const HOUR = 3600;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'ss-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'ss-%@example.test' AND id <> org_id`);
    return (await c.query(`DELETE FROM users WHERE email LIKE 'ss-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (token, method, url, body, headers = {}) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, fresh: r.headers.get('x-session-token'), headers: r.headers, body: await r.json().catch(() => ({})) };
};
/* A token as the server would have signed it `hoursAgo` hours ago. */
const aged = (user, hoursAgo, extra = {}) => {
  const iat = Math.floor(Date.now() / 1000) - Math.round(hoursAgo * HOUR);
  return jwt.sign({ sub: user.id, org: user.org_id ?? user.id, email: user.email, role: user.role, name: user.name,
    iatMs: iat * 1000, iat, ...extra }, JWT_SECRET, { expiresIn: '12h' });
};
const claims = (t) => jwt.decode(t) || {};

(async () => {
  await cleanup();
  try {
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Session Owner', email: `ss-owner-${stamp}@example.test`, password: PASS }) })).json();
    const owner = reg.user;
    ok(!!reg.token && !!owner?.id, 'a throwaway company to test with');

    section('Renewal');
    const fresh = await call(reg.token, 'GET', '/auth/me');
    ok(fresh.status === 200 && !fresh.fresh, 'a new session: no fresh token yet');
    const five = await call(aged(owner, 5), 'GET', '/customers');
    ok(five.status === 200 && !five.fresh, '5 hours in (under half of 12): none either');
    const seven = await call(aged(owner, 7), 'GET', '/customers');
    ok(seven.status === 200 && !!seven.fresh, '7 hours in: the answer carries a fresh token');
    const c = claims(seven.fresh), now = Date.now() / 1000;
    ok(Math.abs(c.iat - now) < 60 && Math.abs(c.exp - (now + 12 * HOUR)) < 60, 'the fresh one is good for another 12 hours from now');
    ok(String(c.sub) === String(owner.id) && String(c.org) === String(owner.org_id ?? owner.id), 'for the same person and company');
    ok((await call(seven.fresh, 'GET', '/auth/me')).status === 200, 'and it works');
    const save = await call(aged(owner, 8), 'POST', '/customers', { name: `Renewal Traders ${stamp}` });
    ok(save.status < 300 && !!save.fresh, `a save gets one too (${save.status})`);

    section('A team member');
    const inv = await call(reg.token, 'POST', '/admin/users', { name: 'Session Sales', email: `ss-sales-${stamp}@example.test`, role: 'Sales' });
    const acc = await call(null, 'POST', '/auth/accept-invite', { token: inv.body?.invite?.token, password: PASS });
    const member = { id: inv.body?.user?.id, org_id: owner.id, email: `ss-sales-${stamp}@example.test`, role: 'Sales', name: 'Session Sales' };
    ok(!!acc.body?.token && !!member.id, 'a Sales person in the same company');
    // Signed as an Administrator: the renewed token says what the database says.
    const m = await call(aged({ ...member, role: 'Administrator' }, 7), 'GET', '/customers');
    const mc = claims(m.fresh);
    ok(m.status === 200 && String(mc.org) === String(owner.id), "their fresh token keeps the company's id");
    ok(mc.role === 'Sales', `and their role as it is now, not as it was signed (${mc.role})`);
    ok((m.body.items || m.body || []).some?.(x => x.name === `Renewal Traders ${stamp}`), "with it they see the company's customers");

    section('Refused, and not renewed');
    const old = await call(aged(owner, 13), 'GET', '/customers');
    ok(old.status === 401 && !old.fresh, `13 hours with nothing used: refused (${old.status}), nothing renewed`);
    const forged = await call(jwt.sign({ sub: owner.id, org: owner.id, iat: Math.floor(Date.now() / 1000) - 7 * HOUR }, 'not-the-secret', { expiresIn: '12h' }), 'GET', '/customers');
    ok(forged.status === 401 && !forged.fresh, 'a token signed with the wrong key: refused, nothing renewed');
    const off = await call(reg.token, 'PATCH', `/admin/users/${member.id}/active`, { isActive: false });
    ok(off.status < 300, `the owner switches the Sales person off (${off.status})`);
    const offTry = await call(aged(member, 7), 'GET', '/customers');
    ok(offTry.status === 401 && !offTry.fresh && /switched off/i.test(offTry.body.error || ''), `their session: refused with "${offTry.body.error}", nothing renewed`);
    const before = aged(owner, 7);
    const cp = await call(reg.token, 'POST', '/auth/change-password', { currentPassword: PASS, newPassword: `${PASS}-2` });
    ok(cp.status === 200, 'the owner changes their password');
    const stale = await call(before, 'GET', '/customers');
    ok(stale.status === 401 && !stale.fresh && /password was changed/i.test(stale.body.error || ''), `a session from before it: refused with "${stale.body.error}", nothing renewed`);

    section('Browser');
    const cors = await call(aged(owner, 7, { iatMs: Date.now() }), 'GET', '/auth/me', null, { Origin: 'http://localhost:5176' });
    ok(/x-session-token/i.test(cors.headers.get('access-control-expose-headers') || ''), 'the app on another address may read the header');
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
