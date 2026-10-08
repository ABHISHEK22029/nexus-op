#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   "Forgot password?" — the code by email, the reset, and what it ends.

   1. Asking for a code: the same answer for an address with or without an
      account; the code reaches only the registered address; only a hash of
      it is stored; it expires in 15 minutes.
   2. Using it: a wrong code counts down five tries and then cancels; an
      expired, used or replaced code is refused; a weak password, or the
      current one, is refused without spending the code; "123 456" and
      "  A@B.C " are read as meant.
   3. What a reset does: the old password stops working, the new one works,
      every session from before ends, a notice email goes out, and the
      activity log has it.
   4. Abuse: three codes per address per 15 minutes; a network limit; a
      switched-off account gets nothing, and its sessions end at once; an
      owner's reset of a team member also ends that person's sessions.
   5. The mail side, in this process: not set up → said so (503); the
      provider refusing → said so (502) and the code withdrawn; what is
      sent to the provider; the test outbox refused in production.

   Needs a local backend started with
     SCHEDULER=off MAIL_TRANSPORT=file MAIL_OUTBOX_DIR=<dir> RESET_IP_LIMIT=1000
   and MAIL_OUTBOX_DIR set to the same <dir> here. Throwaway accounts,
   deleted again. Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { purge } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const OUTBOX = process.env.MAIL_OUTBOX_DIR;
if (!OUTBOX) { console.error('set MAIL_OUTBOX_DIR to the backend\'s outbox directory'); process.exit(1); }

const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const q1 = async (sql, params) => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};
const post = async (url, body, token) => {
  const r = await fetch(`${API}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const get = async (url, token) => {
  const r = await fetch(`${API}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = (email, password) => post('/auth/login', { email, password });
const mails = (to) => (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : [])
  .map((f) => ({ f, ...JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8')) }))
  .filter((m) => m.to.toLowerCase() === to.toLowerCase())
  .sort((a, b) => a.f.localeCompare(b.f));
const lastCode = (to) => {
  const m = mails(to).filter((x) => x.tag === 'password_reset').pop();
  return m ? (m.text.match(/code is: (\d{3}) (\d{3})/) || []).slice(1).join('') : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ids = [];
  try {
    const regA = await post('/auth/register', { name: 'Reset Owner', email: `pwr-a-${stamp}@example.test`, password: PASS });
    if (!regA.body.token) throw new Error(`could not register: ${JSON.stringify(regA.body)}`);
    ids.push(regA.body.user.id);
    const A = { email: `pwr-a-${stamp}@example.test`, token: regA.body.token };
    const memberEmail = `pwr-m-${stamp}@example.test`;
    const made = await post('/admin/users', { name: 'Team Member', email: memberEmail, password: PASS, role: 'Sales' }, A.token);
    const memberId = made.body.id ?? made.body.user?.id ?? (await login(memberEmail, PASS)).body.user?.id;
    if (!memberId) throw new Error(`could not add a team member: ${made.status} ${JSON.stringify(made.body).slice(0, 120)}`);
    ids.push(memberId);
    const rateEmail = `pwr-r-${stamp}@example.test`;
    const regR = await post('/auth/register', { name: 'Rate', email: rateEmail, password: PASS });
    ids.push(regR.body.user?.id);

    /* ── 1 ── */
    console.log('\n  ── 1. asking for a code');
    ok((await get('/auth/reset-available')).body.email === true, 'the server says it can send the email');
    const badEmail = await post('/auth/forgot-password', { email: 'not-an-email' });
    ok(badEmail.status === 400, `a malformed address is refused (${badEmail.status})`);
    const nobody = await post('/auth/forgot-password', { email: `nobody-${stamp}@example.test` });
    const someone = await post('/auth/forgot-password', { email: A.email });
    ok(nobody.status === 200 && someone.status === 200 && nobody.body.message === someone.body.message,
      'an address with no account gets exactly the same answer — the form cannot tell who has an account');
    ok(mails(`nobody-${stamp}@example.test`).length === 0, 'and nothing is sent to an address with no account');
    const m1 = mails(A.email).pop();
    const code1 = lastCode(A.email);
    ok(m1 && /^\d{6}$/.test(code1 || ''), `a 6-digit code reaches the registered address (${code1 ? `${code1.slice(0, 2)}••••` : 'none'})`);
    ok(m1 && !m1.subject.includes(code1) && /reset-password\?email=/.test(m1.text) && /15 minutes/.test(m1.text) && /ignore this email/.test(m1.text),
      'the email: the code in the body only (not the subject, which shows on lock screens), how long it lasts, the link, and what to do if it was not you');
    const [row] = await q1(`SELECT code_hash, EXTRACT(EPOCH FROM (expires_at - created_at))::int AS secs FROM password_reset_codes
                            WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [regA.body.user.id]);
    ok(row && row.code_hash !== code1 && row.code_hash.length === 64 && !row.code_hash.includes(code1), 'only a hash of the code is stored');
    ok(row && Math.abs(row.secs - 900) <= 2, `it expires in 15 minutes (${row?.secs}s)`);

    /* ── 2 ── */
    console.log('\n  ── 2. using the code');
    const newPass = `Fresh${stamp}9`;
    const weak = await post('/auth/reset-password', { email: A.email, code: code1, password: 'short1' });
    const noDigit = await post('/auth/reset-password', { email: A.email, code: code1, password: 'onlyletters' });
    const isEmail = await post('/auth/reset-password', { email: A.email, code: code1, password: A.email });
    ok(weak.status === 400 && noDigit.status === 400 && isEmail.status === 400 && [weak, noDigit, isEmail].every((r) => r.body.field === 'password'),
      `weak passwords are refused, naming the field: “${weak.body.error}” / “${noDigit.body.error}” / “${isEmail.body.error}”`);
    const same = await post('/auth/reset-password', { email: A.email, code: code1, password: PASS });
    ok(same.status === 400 && /current password/.test(same.body.error || ''), `the current password is refused: “${same.body.error}”`);
    const wrong = code1 === '000000' ? '111111' : '000000';
    const w1 = await post('/auth/reset-password', { email: A.email, code: wrong, password: newPass });
    ok(w1.status === 400 && w1.body.triesLeft === 4 && /4 tries left/.test(w1.body.error), `a wrong code counts down: “${w1.body.error}”`);
    const [{ attempts }] = await q1('SELECT attempts FROM password_reset_codes WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [regA.body.user.id]);
    ok(attempts === 1, `the weak-password and current-password refusals did not spend a try (attempts ${attempts})`);

    /* A new code retires the old one. */
    await post('/auth/forgot-password', { email: A.email });
    const code2 = lastCode(A.email);
    const oldCode = await post('/auth/reset-password', { email: A.email, code: code1, password: newPass });
    ok(code2 && code2 !== code1 && oldCode.status === 400, 'asking again sends a new code, and the previous one stops working');

    const before = await login(A.email, PASS);
    const spaced = `${code2.slice(0, 3)} ${code2.slice(3)}`;
    const done = await post('/auth/reset-password', { email: `  ${A.email.toUpperCase()} `, code: spaced, password: newPass });
    ok(done.status === 200 && done.body.email === A.email, `the code as written in the email (“123 456”), with the address in capitals and spaces, resets it (${done.status} ${done.body.error || ''})`);

    /* ── 3 ── */
    console.log('\n  ── 3. what a reset does');
    const oldLogin = await login(A.email, PASS);
    const newLogin = await login(A.email, newPass);
    ok(oldLogin.status === 401 && newLogin.status === 200, `the old password stops working (${oldLogin.status}); the new one works (${newLogin.status})`);
    const stale = await get('/auth/me', before.body.token);
    const fresh = await get('/auth/me', newLogin.body.token);
    ok(stale.status === 401 && /password was changed/i.test(stale.body.error || '') && fresh.status === 200,
      `a session from before the reset is ended: “${stale.body.error}”; a new one works`);
    const reuse = await post('/auth/reset-password', { email: A.email, code: code2, password: `Other${stamp}7` });
    ok(reuse.status === 400, 'the code cannot be used twice');
    const notice = mails(A.email).filter((m) => m.tag === 'password_changed');
    ok(notice.length === 1 && /was changed/.test(notice[0].text) && /signed out/.test(notice[0].text) && /If this was not you/.test(notice[0].text),
      'a “your password was changed” email goes to the address, saying what to do if it was not them');
    const [act] = await q1(`SELECT description FROM activities WHERE owner_id = $1 AND type = 'PASSWORD_RESET' ORDER BY id DESC LIMIT 1`, [regA.body.user.id]);
    ok(act && act.description.includes(A.email), 'and the activity log records it');
    A.token = newLogin.body.token;

    /* The per-address limit (3 in 15 minutes) is tested on its own below;
       here earlier codes are aged so it does not get in the way. */
    const age = () => q1(`UPDATE password_reset_codes SET created_at = created_at - INTERVAL '1 hour' WHERE user_id = $1`, [regA.body.user.id]);
    await age();

    /* five wrong tries cancel the code */
    await post('/auth/forgot-password', { email: A.email });
    const code3 = lastCode(A.email);
    const bad3 = code3 === '000000' ? '111111' : '000000';
    let lastWrong;
    for (let i = 0; i < 5; i++) lastWrong = await post('/auth/reset-password', { email: A.email, code: bad3, password: `Other${stamp}7` });
    const afterFive = await post('/auth/reset-password', { email: A.email, code: code3, password: `Other${stamp}7` });
    ok(/cancelled/.test(lastWrong.body.error || '') && afterFive.status === 400, `the fifth wrong code cancels it — even the right code is then refused: “${lastWrong.body.error}”`);

    /* an expired code */
    await age();
    await post('/auth/forgot-password', { email: A.email });
    const code4 = lastCode(A.email);
    ok(code4 && code4 !== code3, 'a fresh code was sent for the expiry check');
    await q1(`UPDATE password_reset_codes SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1 AND used_at IS NULL`, [regA.body.user.id]);
    const expired = await post('/auth/reset-password', { email: A.email, code: code4, password: `Other${stamp}7` });
    ok(expired.status === 400 && /expired/.test(expired.body.error || ''), `an expired code is refused: “${expired.body.error}”`);

    /* ── 4 ── */
    console.log('\n  ── 4. abuse, switched-off accounts, the owner\'s reset');
    for (let i = 0; i < 4; i++) await post('/auth/forgot-password', { email: rateEmail });
    ok(mails(rateEmail).length === 3, `three codes per address per 15 minutes; the fourth request sends nothing, with the same answer (${mails(rateEmail).length} sent)`);
    const ctl = require('../controllers/PasswordResetController');
    const ip = `test-${stamp}`;
    let blocked = 0;
    for (let i = 0; i < 21; i++) if (ctl._tooMany(ip)) blocked++;
    ok(blocked === 1, `a network gets 20 requests an hour, then 429 (${blocked} blocked of 21)`);

    const memberLogin = await login(memberEmail, PASS);
    const offPatch = await fetch(`${API}/admin/users/${memberId}/active`, { method: 'PATCH', headers: { Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) });
    const offBody = await offPatch.text();
    const offSession = await get('/auth/me', memberLogin.body.token);
    ok(offSession.status === 401 && /switched off/.test(offSession.body.error || ''), `switching a person off ends their session at once: “${offSession.body.error}” (switch-off ${offPatch.status} ${offPatch.status === 200 ? "" : offBody.slice(0, 160)})`);
    const offAsk = await post('/auth/forgot-password', { email: memberEmail });
    ok(offAsk.status === 200 && mails(memberEmail).length === 0, 'a switched-off account gets the same answer, and no code');
    await fetch(`${API}/admin/users/${memberId}/active`, { method: 'PATCH', headers: { Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) });
    const memberLogin2 = await login(memberEmail, PASS);
    /* no pause needed: tokens carry their issue time to the millisecond */
    const ownerReset = await post(`/admin/users/${memberId}/reset-password`, { password: `Owner${stamp}5` }, A.token);
    const afterOwner = await get('/auth/me', memberLogin2.body.token);
    ok(ownerReset.status === 200 && afterOwner.status === 401, `the owner setting a new password for a team member also ends that person's sessions (${afterOwner.status})`);

    /* ── 5 ── */
    console.log('\n  ── 5. the mail side');
    const mailer = require('../shared/mailer');
    const keep = { ...process.env };
    const fakeRes = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
    try {
      delete process.env.MAIL_TRANSPORT; delete process.env.RESEND_API_KEY; delete process.env.MAIL_OUTBOX_DIR;
      const r = fakeRes();
      await ctl.forgot({ body: { email: memberEmail }, ip: 'x' }, r);
      ok(r.code === 503 && r.body.notConfigured && /not set up/.test(r.body.error), `with no email service the request says so (503): “${r.body.error.slice(0, 60)}…”`);

      process.env.MAIL_TRANSPORT = 'file'; process.env.MAIL_OUTBOX_DIR = OUTBOX; process.env.RENDER = 'true';
      ok(!mailer.mailReady(), 'the test outbox is refused in production — it would send nothing');
      delete process.env.RENDER;

      process.env.MAIL_TRANSPORT = 'resend'; process.env.RESEND_API_KEY = 're_test_key'; process.env.MAIL_FROM = 'Maks Ops <no-reply@maksops.co.in>';
      const realFetch = global.fetch;
      let seen = null;
      global.fetch = async (url, opts) => { seen = { url, opts }; return { ok: false, status: 500, text: async () => 'provider down', json: async () => ({}) }; };
      const r2 = fakeRes();
      await ctl.forgot({ body: { email: memberEmail }, ip: 'y' }, r2);
      global.fetch = realFetch;
      const sent = seen ? JSON.parse(seen.opts.body) : {};
      ok(seen && seen.url === 'https://api.resend.com/emails' && seen.opts.headers.Authorization === 'Bearer re_test_key'
        && sent.from === process.env.MAIL_FROM && sent.to[0] === memberEmail && /reset code/.test(sent.subject) && /\d{3} \d{3}/.test(sent.text) && sent.html,
      'what goes to the email service: its API, the key, the from address, the person, a subject without the code, text and HTML');
      const [live] = await q1('SELECT COUNT(*)::int n FROM password_reset_codes WHERE user_id = $1 AND used_at IS NULL', [memberId]);
      ok(r2.code === 502 && /could not be sent/.test(r2.body.error) && live.n === 0, `when the service refuses, it says so (502) and withdraws the code (${live.n} live)`);
    } finally {
      for (const k of ['MAIL_TRANSPORT', 'RESEND_API_KEY', 'MAIL_FROM', 'MAIL_OUTBOX_DIR', 'RENDER']) {
        if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k];
      }
    }
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    /* Every pwr- account, this run's and any an earlier run left behind. */
    const left = await q1(`SELECT id FROM users WHERE email LIKE 'pwr-%@example.test'`).catch(() => []);
    const removed = await purge([...new Set([...ids, ...left.map((r) => r.id)].filter(Boolean))]).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    for (const f of fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : []) if (f.includes(stamp)) fs.unlinkSync(path.join(OUTBOX, f));
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
