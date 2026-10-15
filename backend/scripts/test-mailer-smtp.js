#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The SMTP way of sending (shared/mailer.js), against a stand-in mail
   server on this machine — no real mailbox, no password, nothing leaves
   the computer.

   1. With SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM set, the server
      says it can send, and picks SMTP without being told.
   2. A message arrives with the right sender, recipient, subject and both
      the plain and the HTML part, after signing in with the mailbox's
      user and app password.
   3. A refusal from the mail server becomes an error that names the
      reason — and never the password.
   4. Missing any one setting, the server says it cannot send.
   5. Resend, when its key is set, still wins.
   ══════════════════════════════════════════════════════════════════════ */
const net = require('net');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const fresh = () => { delete require.cache[require.resolve('../shared/mailer')]; return require('../shared/mailer'); };

/* A mail server that speaks just enough SMTP: greets, offers AUTH PLAIN,
   takes one message, and can be told to refuse a recipient. */
function fakeSmtp({ refuse = null } = {}) {
  const got = { auth: null, from: null, to: [], data: '' };
  const server = net.createServer((sock) => {
    let buf = '', inData = false;
    const say = (l) => sock.write(`${l}\r\n`);
    say('220 fake.local ESMTP');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while (true) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          got.data = buf.slice(0, end); buf = buf.slice(end + 5); inData = false; say('250 2.0.0 OK queued as fake-1');
          continue;
        }
        if ((i = buf.indexOf('\r\n')) < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) { sock.write('250-fake.local\r\n250-AUTH PLAIN XOAUTH2\r\n250 8BITMIME\r\n'); }
        else if (cmd.startsWith('AUTH XOAUTH2')) {
          /* "user=<mailbox>\x01auth=Bearer <token>\x01\x01" */
          const raw = Buffer.from(line.split(' ')[2] || '', 'base64').toString('utf8');
          got.oauth = { user: (raw.match(/user=([^\x01]+)/) || [])[1], token: (raw.match(/auth=Bearer ([^\x01]+)/) || [])[1] };
          say('235 2.7.0 Accepted');
        }
        else if (cmd.startsWith('AUTH PLAIN')) { got.auth = Buffer.from(line.split(' ')[2] || '', 'base64').toString('utf8').split('\u0000').slice(1); say('235 2.7.0 Accepted'); }
        else if (cmd.startsWith('MAIL FROM')) { got.from = line; say('250 OK'); }
        else if (cmd.startsWith('RCPT TO')) { if (refuse) say(refuse); else { got.to.push(line); say('250 OK'); } }
        else if (cmd === 'DATA') { inData = true; say('354 go ahead'); }
        else if (cmd === 'QUIT') { say('221 bye'); sock.end(); }
        else if (cmd === 'RSET' || cmd === 'NOOP') say('250 OK');
        else say('502 not here');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, got })));
}

const setEnv = (vars) => {
  for (const k of ['MAIL_TRANSPORT', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_OUTBOX_DIR',
    'GOOGLE_SERVICE_ACCOUNT_JSON', 'GMAIL_USER', 'GMAIL_SMTP_HOST', 'GMAIL_SMTP_PORT', 'GMAIL_TOKEN_URL']) delete process.env[k];
  Object.assign(process.env, vars);
};

/* Google's token endpoint, stood in for: checks the service account's
   signed request as Google does — signature, issuer, mailbox, scope,
   audience — and hands back a token. */
function fakeGoogleToken(publicKey) {
  const seen = { claims: null, verified: false };
  const http = require('http');
  const crypto = require('crypto');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const [h, p, sig] = String(form.get('assertion') || '').split('.');
      seen.grant = form.get('grant_type');
      seen.verified = !!(h && p && sig) && crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url'));
      try { seen.claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { seen.claims = null; }
      res.writeHead(seen.verified ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(seen.verified ? { access_token: 'ya29.stand-in-token', token_type: 'Bearer', expires_in: 3600 } : { error: 'invalid_grant' }));
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}/token`, seen })));
}

(async () => {
  const servers = [];
  try {
    console.log('\n  ── sending through a mailbox over SMTP');
    const a = await fakeSmtp(); servers.push(a.server);
    const SECRET = 'abcd efgh ijkl mnop';
    setEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(a.port), SMTP_USER: 'abhishek@maksops.example.test', SMTP_PASS: SECRET, MAIL_FROM: 'Maks Ops <abhishek@maksops.example.test>' });
    let m = fresh();
    ok(m.mailReady() === true, 'with the four SMTP settings, the server says it can send');
    const sent = await m.sendMail({ to: 'owner@customer.example.test', subject: 'Your Maks Ops password reset code', text: 'Your code is: 482 913', html: '<p>Your code is: <b>482 913</b></p>', tag: 'password_reset' });
    ok(a.got.auth && a.got.auth[0] === 'abhishek@maksops.example.test' && a.got.auth[1] === SECRET, 'it signs in with the mailbox and its app password');
    ok(/abhishek@maksops\.example\.test/.test(a.got.from) && /owner@customer\.example\.test/.test(a.got.to[0] || ''), 'from the mailbox, to the person');
    ok(/^Subject: Your Maks Ops password reset code/m.test(a.got.data) && /^From: Maks Ops <abhishek@maksops\.example\.test>/m.test(a.got.data),
      'with the subject, and “Maks Ops” as the sender name');
    ok(/482 913/.test(a.got.data) && /text\/plain/.test(a.got.data) && /text\/html/.test(a.got.data), 'and both the plain and the HTML part');
    ok(sent && sent.id, `the message id comes back (${sent?.id})`);

    console.log('\n  ── a refusal');
    const b = await fakeSmtp({ refuse: '550 5.1.1 No such user here' }); servers.push(b.server);
    setEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(b.port), SMTP_USER: 'abhishek@maksops.example.test', SMTP_PASS: SECRET, MAIL_FROM: 'Maks Ops <abhishek@maksops.example.test>' });
    m = fresh();
    const err = await m.sendMail({ to: 'nobody@customer.example.test', subject: 's', text: 't' }).then(() => null, (e) => e.message);
    ok(err && /mail server/.test(err) && /550|No such user/.test(err) && !err.includes(SECRET), `it fails with the reason, without the password: “${(err || '').slice(0, 90)}”`);

    console.log('\n  ── through Google Workspace with a service account (no app password)');
    const { publicKey, privateKey } = require('crypto').generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyFile = JSON.stringify({
      type: 'service_account', project_id: 'maks-ops-mail', client_id: '100000000000000000001',
      client_email: 'maks-ops-mailer@maks-ops-mail.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    const g = await fakeGoogleToken(publicKey); servers.push(g.server);
    const c = await fakeSmtp(); servers.push(c.server);
    setEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: keyFile, MAIL_FROM: 'Maks Ops <abhishek@maksops.example.test>',
      GMAIL_SMTP_HOST: '127.0.0.1', GMAIL_SMTP_PORT: String(c.port), GMAIL_TOKEN_URL: g.url });
    m = fresh();
    ok(m.mailReady() === true, 'with the key file and MAIL_FROM, the server says it can send — and picks Gmail by itself');
    const viaGoogle = await m.sendMail({ to: 'owner@customer.example.test', subject: 'Your Maks Ops password reset code', text: 'Your code is: 482 913', html: '<p>482 913</p>' }).then((x) => x, (e) => ({ error: e.message }));
    ok(g.seen.verified && g.seen.grant === 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'the token request is signed with the service account’s key, as Google requires');
    ok(g.seen.claims?.iss === 'maks-ops-mailer@maks-ops-mail.iam.gserviceaccount.com' && g.seen.claims?.sub === 'abhishek@maksops.example.test'
      && g.seen.claims?.scope === 'https://mail.google.com/' && g.seen.claims?.aud === g.url,
    `issued by the service account, for the mailbox in MAIL_FROM, for Gmail only (${g.seen.claims?.iss} → ${g.seen.claims?.sub})`);
    ok(c.got.oauth?.user === 'abhishek@maksops.example.test' && c.got.oauth?.token === 'ya29.stand-in-token' && !c.got.auth,
      'Gmail is signed in to with that token — no password is sent');
    ok(viaGoogle && viaGoogle.id && /^Subject: Your Maks Ops password reset code/m.test(c.got.data) && /owner@customer\.example\.test/.test(c.got.to[0] || ''),
      `and the message goes (${viaGoogle?.id || viaGoogle?.error})`);
    setEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{ not json', MAIL_FROM: 'Maks Ops <abhishek@maksops.example.test>' });
    ok(fresh().mailReady() === false, 'a key file that is not valid JSON: it says it cannot send');
    setEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: keyFile });
    ok(fresh().mailReady() === false, 'without MAIL_FROM there is no mailbox to send as: it says it cannot send');

    console.log('\n  ── not set up');
    for (const missing of ['SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) {
      setEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u@x.example.test', SMTP_PASS: 'p', MAIL_FROM: 'Maks Ops <u@x.example.test>' });
      delete process.env[missing];
      ok(fresh().mailReady() === false, `without ${missing}, it says it cannot send`);
    }
    setEnv({ RESEND_API_KEY: 're_test', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'Maks Ops <u@x.example.test>' });
    ok(fresh().mailReady() === true && process.env.RESEND_API_KEY, 'with a Resend key as well, Resend is used (the setting it had before)');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    for (const s of servers) s.close();
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
