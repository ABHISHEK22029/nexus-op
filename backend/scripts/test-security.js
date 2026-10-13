#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The holes the 12 Oct audit found in accounts and files, as checks.

   1. Nobody inside a company can reach the platform Administrator role —
      not by giving it to an employee, not through the legacy PATCH /users,
      not by naming a company role "Admin".
   2. The founder can't be demoted or switched off by another Owner.
   3. A demotion takes effect on the person's next request, not when their
      session runs out.
   4. The role audit log and roles health show a company only itself.
   5. Sign-in is rate-limited (the server must run with RATE_LIMITS=on).
   6. An uploaded file is what its bytes say: HTML or SVG is refused,
      whatever it is called; files are served with nosniff and a sandbox,
      and only PDFs and pictures open inline.
   7. A signed-in person can change their password, knowing the current
      one; their other sessions end.
   8. Sign-up needs 8 characters; the financial year follows India's date.

   Run against a local backend started with SCHEDULER=off RATE_LIMITS=on.
   Throwaway accounts, deleted again. Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purge } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const q1 = async (sql, params) => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${who.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
};
const login = (email, password = PASS) => call(null, 'POST', '/auth/login', { email, password });
const upload = async (who, { name, content, entityType, entityId }) => {
  const fd = new FormData();
  fd.append('file', new Blob([content]), name);
  fd.append('entityType', entityType); fd.append('entityId', String(entityId));
  const r = await fetch(`${API}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  const ids = [];
  let orgA = null, orgB = null;
  try {
    const regA = await call(null, 'POST', '/auth/register', { name: 'Sec Owner', email: `sec-a-${stamp}@example.test`, password: PASS });
    if (!regA.body.token) throw new Error(`could not register: ${JSON.stringify(regA.body)}`);
    const A = { token: regA.body.token, id: regA.body.user.id, email: `sec-a-${stamp}@example.test` };
    orgA = A.id; ids.push(A.id);
    await call(A, 'PUT', '/company-profile', { name: 'Security Works', gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const mk = async (tag, role) => {
      const email = `sec-${tag}-${stamp}@example.test`;
      const r = await call(A, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
      const l = await login(email);
      const id = r.body.id ?? r.body.user?.id ?? l.body.user?.id;
      ids.push(id);
      return { token: l.body.token, id, email };
    };
    const S = await mk('sales', 'Sales');
    const O = await mk('owner2', 'Owner');

    /* ── 1 ── */
    console.log('\n  ── 1. the platform Administrator role is out of reach');
    const give = await call(A, 'PATCH', `/admin/users/${S.id}/role`, { role: 'Administrator' });
    ok(give.status === 403, `an Owner cannot make an employee Administrator (${give.status} ${give.body.error || ''})`);
    const legacy = await call(A, 'PATCH', `/users/${A.id}`, { role: 'Admin' });
    ok(legacy.status === 400, `the legacy route no longer changes a role (${legacy.status})`);
    const [stillOwner] = await q1('SELECT role FROM users WHERE id = $1', [A.id]);
    ok(stillOwner.role !== 'Admin' && stillOwner.role !== 'Administrator', `the founder's role is unchanged (${stillOwner.role})`);
    for (const name of ['Admin', 'admin', 'ADMINISTRATOR', 'Owner', 'Manager']) {
      const r = await call(A, 'POST', '/admin/roles', { role: name, label: name });
      ok(r.status === 409 || r.status === 400, `a company role can't be named "${name}" (${r.status})`);
    }
    const custom = await call(A, 'POST', '/admin/roles', { role: `Storekeeper${stamp.slice(-4)}`, label: 'Store keeper' });
    ok(custom.status === 201 || custom.status === 200, `an ordinary company role can still be made (${custom.status})`);
    const regB = await call(null, 'POST', '/auth/register', { name: 'Sec Other', email: `sec-b-${stamp}@example.test`, password: PASS });
    const B = { token: regB.body.token, id: regB.body.user?.id };
    ids.push(B.id); orgB = B.id;
    const theirs = `Packer${stamp.slice(-4)}`;
    await call(B, 'POST', '/admin/roles', { role: theirs, label: 'Packer' });
    const useTheirs = await call(A, 'PATCH', `/admin/users/${S.id}/role`, { role: theirs });
    const hireTheirs = await call(A, 'POST', '/admin/users', { name: 'Borrowed role', email: `sec-borrow-${stamp}@example.test`, password: PASS, role: theirs });
    ok(useTheirs.status >= 400 && hireTheirs.status >= 400, `another company's role can't be given or hired into (${useTheirs.status}, ${hireTheirs.status})`);
    const meAdmin = await call(S, 'GET', '/auth/me');
    ok(meAdmin.status === 200 && !/Administrator|Admin/.test(meAdmin.body.role || meAdmin.body.user?.role || ''), 'the employee is not an administrator');

    /* ── 2 ── */
    console.log('\n  ── 2. the founder is the founder\'s');
    const demote = await call(O, 'PATCH', `/admin/users/${A.id}/role`, { role: 'Viewer' });
    const off = await call(O, 'PATCH', `/admin/users/${A.id}/active`, { isActive: false });
    const off2 = await call(O, 'PATCH', `/users/${A.id}`, { is_active: false });
    const [founder] = await q1('SELECT role, is_active FROM users WHERE id = $1', [A.id]);
    ok([demote, off, off2].every((r) => r.status === 403 || r.status === 404) && founder.is_active === true,
      `another Owner can neither demote nor switch off the founder (${[demote, off, off2].map((r) => r.status).join(', ')})`);

    /* ── 3 ── */
    console.log('\n  ── 3. a demotion applies at once');
    const before = await call(S, 'POST', '/customers', { name: `Sec customer ${stamp}`, state: 'Telangana' });
    const toViewer = await call(A, 'PATCH', `/admin/users/${S.id}/role`, { role: 'Viewer' });
    const after = await call(S, 'POST', '/customers', { name: `Sec customer 2 ${stamp}`, state: 'Telangana' });
    ok(before.status < 300 && toViewer.status === 200 && after.status === 403,
      `Sales could add a customer (${before.status}); made Viewer, the same session cannot (${after.status})`);

    /* ── 4 ── */
    console.log('\n  ── 4. logs and health show only this company');
    const audit = await call(A, 'GET', '/admin/roles/audit');
    const emails = new Set([A.email, S.email, O.email]);
    const foreign = (audit.body.entries || []).filter((e) => !emails.has(e.actor_email));
    ok(audit.status === 200 && foreign.length === 0, `the role audit log holds only this company's changes (${(audit.body.entries || []).length} entries, ${foreign.length} from elsewhere)`);
    const health = await call(A, 'GET', '/admin/roles/health');
    ok(health.status === 200 && health.body.activeAdministrators === undefined, 'roles health no longer reports the platform\'s administrators to a company');

    /* ── 5 ── */
    console.log('\n  ── 5. sign-in is rate-limited');
    let last;
    for (let i = 0; i < 11; i++) last = await login(`nobody-${stamp}@example.test`, 'wrong-password-1');
    ok(last.status === 429 && /Too many/.test(last.body.error || ''), `the 11th wrong sign-in for one email is refused (${last.status})`);

    /* ── 6 ── */
    console.log('\n  ── 6. files are what their bytes say');
    const hh = await fetch(`${API}/health`);
    const hb = await hh.json();
    ok(hh.headers.get('x-content-type-options') === 'nosniff' && hh.headers.get('x-frame-options') === 'DENY' && !hh.headers.get('x-powered-by')
      && ['configured', 'development'].includes(hb.sessions),
    `every answer carries nosniff and no-framing, says nothing about Express, and /health says how sessions are signed (${hb.sessions})`);
    const cust = (await call(A, 'POST', '/customers', { name: `Sec buyer ${stamp}`, state: 'Telangana' })).body;
    const html = '<html><body><script>alert(localStorage.nexus_token)</script></body></html>';
    const h1 = await upload(A, { name: 'invoice.html', content: html, entityType: 'customer', entityId: cust.id });
    const h2 = await upload(A, { name: 'invoice.pdf', content: html, entityType: 'customer', entityId: cust.id });
    const h3 = await upload(A, { name: 'logo.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', entityType: 'customer', entityId: cust.id });
    const h4 = await upload(A, { name: 'notes.txt', content: '<script>alert(1)</script>', entityType: 'customer', entityId: cust.id });
    ok([h1, h2, h3, h4].every((r) => r.status === 400), `HTML, HTML named .pdf, SVG and script-in-.txt are refused (${[h1, h2, h3, h4].map((r) => r.status).join(', ')})`);
    const pdf = await upload(A, { name: 'po.pdf', content: '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', entityType: 'customer', entityId: cust.id });
    const csv = await upload(A, { name: 'rates.csv', content: 'item,rate\nbracket,2320\n', entityType: 'customer', entityId: cust.id });
    ok(pdf.status === 200 && csv.status === 200, `a PDF and a CSV are accepted (${pdf.status}, ${csv.status})`);
    const dl = async (id) => fetch(`${API}/attachments/${id}/download`, { headers: { Authorization: `Bearer ${A.token}` } });
    const dp = await dl(pdf.body.id);
    const dc = await dl(csv.body.id);
    ok(dp.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(dp.headers.get('content-security-policy') || '')
      && dp.headers.get('content-type') === 'application/pdf' && /^inline/.test(dp.headers.get('content-disposition') || ''),
    'a PDF is served as a PDF, inline, with nosniff and a sandbox');
    ok(/^attachment/.test(dc.headers.get('content-disposition') || '') && dc.headers.get('content-type') === 'text/csv', 'a CSV is downloaded, not opened');

    /* ── 7 ── */
    console.log('\n  ── 7. changing your own password');
    const wrong = await call(O, 'POST', '/auth/change-password', { currentPassword: 'not-it-at-all', newPassword: 'brandnewpass99' });
    const tooShort = await call(O, 'POST', '/auth/change-password', { currentPassword: PASS, newPassword: 'short1' });
    ok(wrong.status === 400 && tooShort.status === 400, `a wrong current password, or a new one under 8, is refused (${wrong.status}, ${tooShort.status})`);
    const changed = await call(O, 'POST', '/auth/change-password', { currentPassword: PASS, newPassword: 'brandnewpass99' });
    const oldSession = await call(O, 'GET', '/auth/me');
    const newSession = await call({ token: changed.body.token }, 'GET', '/auth/me');
    const relog = await login(O.email, 'brandnewpass99');
    ok(changed.status === 200 && oldSession.status === 401 && newSession.status === 200 && relog.status === 200,
      `changed: the old session is signed out (${oldSession.status}), the returned one works (${newSession.status}), and the new password signs in (${relog.status})`);
    const noSession = await call(null, 'POST', '/auth/change-password', { currentPassword: PASS, newPassword: 'brandnewpass99' });
    ok(noSession.status === 401, `it needs a session (${noSession.status})`);

    /* ── 8 ── */
    console.log('\n  ── 8. sign-up passwords and the financial year');
    const short = await call(null, 'POST', '/auth/register', { name: 'Short', email: `sec-short-${stamp}@example.test`, password: 'abc1234' });
    ok(short.status === 400 && /8/.test(short.body.error || ''), `a 7-character password is refused at sign-up (${short.status})`);
    if (short.body.user?.id) ids.push(short.body.user.id);
    const { financialYear } = require('../shared/docNumber');
    ok(financialYear(new Date('2027-03-31T18:29:00Z')) === 'FY2026-27' && financialYear(new Date('2027-03-31T18:31:00Z')) === 'FY2027-28',
      'the financial year turns at midnight India time, not UTC');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    /* company roles are keyed by org_id, which the purge does not sweep */
    const orgs = [orgA, orgB].filter(Boolean);
    await q1('DELETE FROM role_permissions WHERE org_id = ANY($1)', [orgs]).catch(() => {});
    await q1('DELETE FROM role_definitions WHERE org_id = ANY($1)', [orgs]).catch(() => {});
    await q1(`DELETE FROM role_change_log WHERE actor_email LIKE 'sec-%@example.test'`).catch(() => {});
    const left = await q1(`SELECT id FROM users WHERE email LIKE 'sec-%@example.test'`).catch(() => []);
    const removed = await purge([...new Set([...ids, ...left.map((r) => r.id)].filter(Boolean))]).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
