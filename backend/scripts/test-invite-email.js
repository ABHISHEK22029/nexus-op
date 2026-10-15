#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Adding a team member emails them their invitation.

   1. Add a person without a password: they are emailed — from Maks Ops,
      naming who added them, the company and their role — with a link that
      is the one the owner sees. The team list shows them as invited.
   2. Resend invite: a new link, emailed; the old one stops working.
   3. The emailed link lets them choose a password and sign in; they are
      then listed as joined, and cannot be re-invited (reset instead).
   4. Another company cannot re-invite them; a Viewer cannot either; and
      someone given a password directly is sent no invitation.

   The backend must run with MAIL_TRANSPORT=file MAIL_OUTBOX_DIR=<dir>, and
   MAIL_OUTBOX_DIR set to the same <dir> here. Throwaway accounts, deleted
   again. Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { purge } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
const OUTBOX = process.env.MAIL_OUTBOX_DIR;
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
if (!OUTBOX) { console.error('set MAIL_OUTBOX_DIR (and run the backend with MAIL_TRANSPORT=file and the same dir)'); process.exit(1); }
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${who.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag, name) => {
  const r = await call(null, 'POST', '/auth/register', { name, email: `invm-${tag}-${stamp}@example.test`, password: PASS });
  return { token: r.body.token, id: r.body.user?.id, email: `invm-${tag}-${stamp}@example.test` };
};
const mailsTo = (to) => fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX)
  .filter((f) => f.includes(to.replace(/[^a-z0-9@._-]/gi, '_'))).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))) : [];
const tokenIn = (mail) => (mail.text.match(/accept-invite\?token=([A-Za-z0-9_%-]+)/) || [])[1];

(async () => {
  const ids = [];
  try {
    const A = await register('owner', 'Priya Owner'); ids.push(A.id);
    const B = await register('other', 'Other Owner'); ids.push(B.id);
    await call(A, 'PUT', '/company-profile', { name: `Godavari Steel ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const ready = (await call(null, 'GET', '/auth/reset-available')).body;
    ok(ready.email === true, 'the server can send email (file transport for this test)');

    console.log('\n  ── 1. adding a person emails them');
    const newEmail = `invm-new-${stamp}@example.test`;
    const add = await call(A, 'POST', '/admin/users', { name: 'Ravi Kumar', email: newEmail, role: 'Sales' });
    const invited = add.body.user?.id; ids.push(invited);
    ok(add.status === 201 && add.body.invite?.emailed === true && add.body.invite?.path, `the invitation is made and emailed (${add.status}, emailed ${add.body.invite?.emailed})`);
    const m1 = mailsTo(newEmail).filter((m) => m.tag === 'invite');
    const t1 = m1[0] && tokenIn(m1[0]);
    ok(m1.length === 1 && t1 && add.body.invite.path.includes(decodeURIComponent(t1)), 'one email, carrying the same link the owner sees');
    ok(m1[0] && /Godavari Steel/.test(m1[0].subject) && /Priya Owner has added you to Godavari Steel/.test(m1[0].text) && /as Sales/.test(m1[0].text),
      `it says who, where and as what: “${m1[0]?.subject}” — “${(m1[0]?.text || '').split('\n')[2]}”`);
    ok(m1[0] && /Set your password/.test(m1[0].html) && /expires on/.test(m1[0].text) && /https?:\/\/[^\s]+\/accept-invite\?token=/.test(m1[0].text),
      'with a "Set your password" button, the full link, and when it expires');
    const list1 = (await call(A, 'GET', '/users?limit=50')).body.items || [];
    ok(list1.find((u) => u.id === invited)?.pending === true, 'the team list shows them as invited, not joined');

    console.log('\n  ── 2. resend');
    const re = await call(A, 'POST', `/admin/users/${invited}/invite`);
    const m2 = mailsTo(newEmail).filter((m) => m.tag === 'invite');
    const t2 = m2[1] && tokenIn(m2[1]);
    ok(re.status === 200 && re.body.invite?.emailed === true && m2.length === 2 && t2 && t2 !== t1, `a second email, with a new link (${re.status})`);
    const oldLink = await call(null, 'GET', `/auth/invite/${decodeURIComponent(t1)}`);
    const newLink = await call(null, 'GET', `/auth/invite/${decodeURIComponent(t2)}`);
    ok(oldLink.status === 404 && newLink.status === 200, `the old link no longer works (${oldLink.status}); the new one does (${newLink.status})`);

    console.log('\n  ── 3. joining from the email');
    const accept = await call(null, 'POST', '/auth/accept-invite', { token: decodeURIComponent(t2), password: 'RaviChose#2026' });
    const login = await call(null, 'POST', '/auth/login', { email: newEmail, password: 'RaviChose#2026' });
    ok(accept.status === 200 && login.status === 200 && login.body.user?.org_id === A.id, `they choose a password and sign in, into the company (${accept.status}, ${login.status})`);
    const list2 = (await call(A, 'GET', '/users?limit=50')).body.items || [];
    ok(list2.find((u) => u.id === invited)?.pending === false, 'and are listed as joined');
    const again = await call(A, 'POST', `/admin/users/${invited}/invite`);
    ok(again.status === 409 && /already joined/.test(again.body.error || ''), `someone who has joined is not re-invited: “${again.body.error}”`);

    console.log('\n  ── 4. who may resend');
    const pending2 = await call(A, 'POST', '/admin/users', { name: 'Meena', email: `invm-meena-${stamp}@example.test`, role: 'Viewer' });
    ids.push(pending2.body.user?.id);
    const fromB = await call(B, 'POST', `/admin/users/${pending2.body.user?.id}/invite`);
    ok(fromB.status === 404, `another company cannot (${fromB.status})`);
    const viewerEmail = `invm-viewer-${stamp}@example.test`;
    const v = await call(A, 'POST', '/admin/users', { name: 'Viewer', email: viewerEmail, password: PASS, role: 'Viewer' });
    ids.push(v.body.user?.id);
    const V = { token: (await call(null, 'POST', '/auth/login', { email: viewerEmail, password: PASS })).body.token };
    const fromViewer = await call(V, 'POST', `/admin/users/${pending2.body.user?.id}/invite`);
    ok(fromViewer.status === 403, `a Viewer cannot (${fromViewer.status})`);
    const created = mailsTo(viewerEmail).filter((m) => m.tag === 'invite');
    ok(created.length === 0 && v.body.invite === undefined, 'someone given a password directly gets no invitation email');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await purge(ids.filter(Boolean)).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
