#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The owner adds an email; that person sets their own password.

   Before this, adding somebody meant the owner inventing a temporary
   password and telling them what it was. That password is known to two
   people from the moment it exists and in practice never changes.

   Checks the whole path, and the things that must NOT be possible:

     · the invited account cannot be signed into before it is accepted
     · the link works once, and the second use fails
     · an expired link fails
     · accepting cannot change the role or the organisation — those were
       decided by whoever sent the invite
     · the accepted employee lands in the RIGHT organisation and sees the
       company's data
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body };
};
const rows = (b) => (Array.isArray(b) ? b : (b.items || []));

(async () => {
  const made = [];
  console.log('');

  /* ── a founder with a company ──────────────────────────── */
  const founderEmail = `founder-${stamp}@example.test`;
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Founder', email: founderEmail, password: 'testpassword123' }),
  });
  if (!reg.ok) { console.error('could not register:', reg.body); process.exit(1); }
  made.push(reg.body.user.id);
  const owner = reg.body.token;
  await call('/company-profile', {
    method: 'PUT',
    body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  }, owner);
  await call('/customers', { method: 'POST', body: JSON.stringify({ name: `Client ${stamp}` }) }, owner);

  /* ── invite: an email and a role, no password ──────────── */
  const inviteeEmail = `staff-${stamp}@example.test`;
  const inv = await call('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Ramesh', email: inviteeEmail, role: 'Sales' }),
  }, owner);
  ok(inv.ok, `an employee can be invited with no password (${inv.status})` +
    (inv.ok ? '' : ` — ${inv.body.error || ''}`));
  if (inv.body?.user?.id) made.push(inv.body.user.id);

  const token = inv.body?.invite?.token;
  ok(!!token, 'a one-time link comes back for the owner to send');
  ok(inv.body?.invite?.path?.startsWith('/accept-invite?token='),
    `and it is a path the app can open → ${inv.body?.invite?.path?.slice(0, 34)}…`);

  /* The token must never be recoverable from the database. */
  const { rows: [stored] } = await db.query(
    'SELECT invite_token_hash, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [inviteeEmail]);
  ok(stored?.invite_token_hash && stored.invite_token_hash !== token,
    'only a hash of the token is stored, never the token');
  ok(stored?.password_hash === null, 'and the account has no password yet');

  /* ── it cannot be signed into yet ──────────────────────── */
  const early = await call('/auth/login', {
    method: 'POST', body: JSON.stringify({ email: inviteeEmail, password: 'anything123' }),
  });
  ok(!early.ok, `a pending invite cannot be signed into (${early.status})`);

  /* ── the invite page can show who and where ────────────── */
  const info = await call(`/auth/invite/${token}`);
  ok(info.ok, `the link resolves without a login (${info.status})`);
  ok(info.body?.email === inviteeEmail, `it names the invitee → ${info.body?.email}`);
  ok(info.body?.organisation === `Kirashi ${stamp}`,
    `and the organisation they are joining → ${info.body?.organisation}`);

  /* ── accepting cannot choose a role or an organisation ──── */
  const sneaky = await call('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password: 'mynewpassword1', role: 'Administrator', org_id: 1 }),
  });
  ok(sneaky.ok, `the invite is accepted (${sneaky.status})`);
  const { rows: [after] } = await db.query(
    'SELECT role, org_id, password_hash, invite_token_hash FROM users WHERE LOWER(email) = LOWER($1)',
    [inviteeEmail]);
  ok(after?.role === 'Sales',
    `the role stays as the owner set it, whatever the request asked for → ${after?.role}`);
  ok(Number(after?.org_id) === Number(reg.body.user.id),
    `and the organisation is the one that invited them → ${after?.org_id}`);
  ok(!!after?.password_hash, 'the password they chose is now set');
  ok(after?.invite_token_hash === null, 'and the link is spent');

  /* ── the link works once ───────────────────────────────── */
  const reuse = await call('/auth/accept-invite', {
    method: 'POST', body: JSON.stringify({ token, password: 'anotherpassword1' }),
  });
  ok(!reuse.ok, `the same link cannot be used twice (${reuse.status})`);

  /* ── and now they are in, seeing the company ───────────── */
  const login = await call('/auth/login', {
    method: 'POST', body: JSON.stringify({ email: inviteeEmail, password: 'mynewpassword1' }),
  });
  ok(login.ok, 'the employee signs in with the password they chose');
  const seen = rows((await call('/customers?limit=50', {}, login.body?.token)).body);
  ok(seen.some(c => c.name === `Client ${stamp}`),
    `and sees the company's customers (${seen.length} visible)`);

  /* ── an expired invite ─────────────────────────────────── */
  const exp = await call('/admin/users', {
    method: 'POST', body: JSON.stringify({ name: 'Stale', email: `stale-${stamp}@example.test`, role: 'Viewer' }),
  }, owner);
  if (exp.body?.user?.id) made.push(exp.body.user.id);
  await db.query(
    `UPDATE users SET invite_expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [exp.body.user.id]);
  const stale = await call('/auth/accept-invite', {
    method: 'POST', body: JSON.stringify({ token: exp.body.invite.token, password: 'whatever12345' }),
  });
  ok(!stale.ok, `an expired invite is refused (${stale.status})`);

  /* ── clean up ──────────────────────────────────────────── */
  await db.query('DELETE FROM customers WHERE owner_id = $1', [reg.body.user.id]).catch(() => {});
  await db.query('DELETE FROM company_profile WHERE owner_id = $1', [reg.body.user.id]).catch(() => {});
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test accounts removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
