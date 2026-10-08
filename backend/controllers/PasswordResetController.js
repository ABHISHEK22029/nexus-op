/* ══════════════════════════════════════════════════════════
   PasswordResetController — "Forgot password?"

   1. POST /auth/forgot-password { email }
      A six-digit code goes to the registered address. The answer is the
      same whether or not the address has an account, so the form cannot be
      used to find out who is a customer. A new code retires the previous
      one. Limited per address (3 codes per 15 minutes, 10 a day) and per
      network (20 requests an hour).

   2. POST /auth/reset-password { email, code, password }
      The code works for 15 minutes, once, with 5 wrong guesses. On success
      the password changes, every session started before it ends (see
      middleware/auth), a "your password was changed" email goes out, and
      the change is in the activity log.

   GET /auth/reset-available says whether this server can send the email,
   so the screen can offer the other way back in instead of a form that
   sends nothing.

   Only an HMAC of each code is stored — keyed with the server's secret and
   the user's id — so a copy of the table holds no usable code.
   ══════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { JWT_SECRET, forgetAccount } = require('../middleware/auth');
const { sendMail, mailReady, appUrl, escapeHtml } = require('../shared/mailer');

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const PER_15_MIN = 3;
const PER_DAY = 10;
const IP_PER_HOUR = Number(process.env.RESET_IP_LIMIT) || 20;   // raised only by a local test server

const SENT = 'If an account exists for that email, we have sent it a 6-digit code. It works for 15 minutes.';
const BAD_CODE = 'That code is not valid, or it has expired. Ask for a new code and use the latest one.';

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const hashCode = (userId, code) => crypto.createHmac('sha256', JWT_SECRET).update(`${userId}:${code}`).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ist = (d = new Date()) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* Per-network limit, in memory: enough to stop one machine from spraying
   the form. Per-address limits live in the table, so they hold across
   restarts. */
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k);
  return recent.length > IP_PER_HOUR;
}

/* What a password must be. The same floor as accepting an invite (8), and
   no more than bcrypt reads (72 bytes) — past that it silently ignores the
   rest, so a long passphrase would be weaker than it looks. */
function passwordProblem(pw, email) {
  const s = String(pw || '');
  if (s.length < 8) return 'Use at least 8 characters.';
  if (Buffer.byteLength(s, 'utf8') > 72) return 'Use at most 72 characters.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Use at least one letter and one number.';
  if (s.trim().toLowerCase() === email) return 'Your password cannot be your email address.';
  return null;
}

const codeEmail = (name, code, email) => {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const link = `${appUrl()}/reset-password?email=${encodeURIComponent(email)}`;
  const text = [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    `Your Maks Ops password reset code is: ${spaced}`,
    '',
    `It works for ${CODE_MINUTES} minutes, once. Enter it here: ${link}`,
    '',
    'If you did not ask to reset your password, ignore this email: your password stays as it is, and nobody can change it without this code.',
    '',
    '— Maks Ops',
  ].join('\n');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
  <p>Hello${name ? ` ${escapeHtml(name)}` : ''},</p>
  <p>Your Maks Ops password reset code is:</p>
  <p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:12px 0;font-family:Consolas,monospace">${spaced}</p>
  <p>It works for ${CODE_MINUTES} minutes, once.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Enter the code</a></p>
  <p style="color:#6b7280;font-size:13px">If you did not ask to reset your password, ignore this email: your password stays as it is, and nobody can change it without this code.</p>
  <p style="color:#6b7280;font-size:13px">— Maks Ops</p>
</div>`;
  return { subject: 'Your Maks Ops password reset code', text, html };
};

const changedEmail = (name, when) => {
  const text = [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    `The password for your Maks Ops account was changed on ${when} (IST), using a code sent to this address. Every device that was signed in has been signed out.`,
    '',
    `If this was not you, reset your password again now at ${appUrl()}/forgot-password and tell your company's owner.`,
    '',
    '— Maks Ops',
  ].join('\n');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
  <p>Hello${name ? ` ${escapeHtml(name)}` : ''},</p>
  <p>The password for your Maks Ops account was changed on <b>${escapeHtml(when)}</b> (IST), using a code sent to this address. Every device that was signed in has been signed out.</p>
  <p>If this was not you, <a href="${escapeHtml(appUrl())}/forgot-password">reset your password again now</a> and tell your company's owner.</p>
  <p style="color:#6b7280;font-size:13px">— Maks Ops</p>
</div>`;
  return { subject: 'Your Maks Ops password was changed', text, html };
};

// GET /auth/reset-available
exports.available = (req, res) => res.json({ email: mailReady() });

// POST /auth/forgot-password { email }
exports.forgot = async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter the email address you sign in with.' });
  if (!mailReady()) {
    return res.status(503).json({
      error: 'Password reset by email is not set up yet. Ask your company\'s owner to reset it from Team, or contact Maks Ops support.',
      notConfigured: true,
    });
  }
  if (tooMany(req.ip || 'unknown')) return res.status(429).json({ error: 'Too many requests from this network. Try again in an hour.' });

  try {
    const user = (await db.query(
      'SELECT id, name, email, is_active, password_hash FROM users WHERE LOWER(email) = $1 LIMIT 1', [email])).rows[0];
    /* No account, a switched-off one, or an invite never accepted: the same
       answer, and nothing sent. */
    if (!user || !user.is_active || !user.password_hash) return res.json({ ok: true, message: SENT });

    const { rows: [rate] } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes')::int AS recent,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int      AS today
         FROM password_reset_codes WHERE user_id = $1`, [user.id]);
    if (rate.recent >= PER_15_MIN || rate.today >= PER_DAY) return res.json({ ok: true, message: SENT });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const client = await db.getClient();
    let codeId;
    try {
      await client.query('BEGIN');
      /* One live code at a time: asking again retires the previous one. */
      await client.query('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      codeId = (await client.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, requested_ip)
         VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4) RETURNING id`,
        [user.id, hashCode(user.id, code), String(CODE_MINUTES), req.ip || null])).rows[0].id;
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }

    try {
      await sendMail({ to: user.email, ...codeEmail(user.name, code, user.email), tag: 'password_reset' });
    } catch (e) {
      /* Not delivered: retire the code and say so, rather than leave the
         person waiting for an email that is not coming. */
      await db.query('UPDATE password_reset_codes SET used_at = NOW() WHERE id = $1', [codeId]).catch(() => {});
      console.error('[password reset] email failed:', e.message);
      return res.status(502).json({ error: 'The email could not be sent just now. Try again in a few minutes.' });
    }
    return res.json({ ok: true, message: SENT });
  } catch (e) {
    console.error('[password reset] request failed:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};

// POST /auth/reset-password { email, code, password }
exports.reset = async (req, res) => {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const password = String(req.body?.password || '');
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter the email address you sign in with.', field: 'email' });
  if (code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit code from the email.', field: 'code' });
  const weak = passwordProblem(password, email);
  if (weak) return res.status(400).json({ error: weak, field: 'password' });
  if (tooMany(req.ip || 'unknown')) return res.status(429).json({ error: 'Too many requests from this network. Try again in an hour.' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const user = (await client.query(
      'SELECT id, name, email, is_active, password_hash, org_id FROM users WHERE LOWER(email) = $1 LIMIT 1 FOR UPDATE', [email])).rows[0];
    /* The newest live code, locked so two submissions cannot both use it. */
    const row = user && user.is_active ? (await client.query(
      `SELECT * FROM password_reset_codes
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [user.id])).rows[0] : null;
    if (!row) { await client.query('ROLLBACK'); return res.status(400).json({ error: BAD_CODE, field: 'code' }); }

    if (!sameHash(row.code_hash, hashCode(user.id, code))) {
      const tries = row.attempts + 1;
      await client.query(
        `UPDATE password_reset_codes SET attempts = $2::int, used_at = CASE WHEN $2::int >= $3::int THEN NOW() ELSE used_at END WHERE id = $1`,
        [row.id, tries, MAX_ATTEMPTS]);
      await client.query('COMMIT');
      const left = MAX_ATTEMPTS - tries;
      return res.status(400).json({
        error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not right, and it has now been cancelled. Ask for a new code.',
        field: 'code', triesLeft: Math.max(left, 0),
      });
    }
    if (user.password_hash && await bcrypt.compare(password, user.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That is your current password. Choose a new one.', field: 'password' });
    }

    const hash = await bcrypt.hash(password, 10);
    /* Stamped with THIS server's clock, the one that signs tokens: the
       database's clock runs ahead of it by a fraction of a second, which was
       enough to refuse a sign-in made straight after the reset. */
    await client.query('UPDATE users SET password_hash = $1, password_changed_at = $3 WHERE id = $2', [hash, user.id, new Date()]);
    await client.query('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await client.query(
      `INSERT INTO activities ("projectId", type, description, timestamp, owner_id) VALUES (NULL, 'PASSWORD_RESET', $1, NOW(), $2)`,
      [`${user.email} reset their password with an emailed code`, user.org_id ?? user.id]);
    await client.query('COMMIT');
    forgetAccount(user.id);

    /* The notice is a courtesy: its failure must not undo the reset. */
    sendMail({ to: user.email, ...changedEmail(user.name, ist()), tag: 'password_changed' })
      .catch((e) => console.error('[password reset] notice failed:', e.message));
    return res.json({ ok: true, message: 'Your password has been changed. Sign in with the new one.', email: user.email });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[password reset] reset failed:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  } finally { client.release(); }
};

exports.passwordProblem = passwordProblem;
exports._tooMany = tooMany;   // for the test of the limiter itself
