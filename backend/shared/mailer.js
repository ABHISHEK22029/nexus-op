/* ══════════════════════════════════════════════════════════
   mailer — the one way Maks Ops sends an email.

   Until now the product sent none: "Email" on a document opens the
   person's own mail app with a draft. A password reset cannot work that
   way — the person asking cannot sign in — so the server has to send it.

   Transports, chosen by MAIL_TRANSPORT (default: resend when its key is set):
     resend  Resend's HTTPS API. No SMTP library to keep patched.
             Needs RESEND_API_KEY and MAIL_FROM, e.g.
             "Maks Ops <no-reply@maksops.co.in>" on a domain verified in
             Resend (its SPF and DKIM records added to the domain's DNS).
     file    Writes each message as JSON into MAIL_OUTBOX_DIR — for a local
             test run, which reads the code out of it. Refused in production,
             where it would quietly send nothing.
     none    Nothing is configured: mailReady() is false, and callers say
             so instead of pretending a message went.
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const transport = () => (process.env.MAIL_TRANSPORT || (process.env.RESEND_API_KEY ? 'resend' : 'none')).toLowerCase();
const isProduction = () => process.env.NODE_ENV === 'production' || !!process.env.RENDER;

/** Can this server actually deliver an email right now? */
function mailReady() {
  const t = transport();
  if (t === 'resend') return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
  if (t === 'file') return !!process.env.MAIL_OUTBOX_DIR && !isProduction();
  return false;
}

/**
 * Send one email. Throws when it could not be handed over, so a caller can
 * tell the person rather than claim it was sent.
 * @param {{ to: string, subject: string, text: string, html?: string, tag?: string }} m
 */
async function sendMail({ to, subject, text, html, tag }) {
  const t = transport();
  if (!mailReady()) throw new Error('Email is not set up on this server');

  if (t === 'file') {
    const dir = process.env.MAIL_OUTBOX_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${String(to).replace(/[^a-z0-9@._-]/gi, '_')}.json`);
    fs.writeFileSync(file, JSON.stringify({ to, from: process.env.MAIL_FROM || 'Maks Ops <test@example.test>', subject, text, html, tag }, null, 2));
    return { id: path.basename(file) };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject, text, html,
      ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      ...(tag ? { tags: [{ name: 'type', value: tag }] } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    /* The provider's message, without the key or the recipient, for the log. */
    const body = await res.text().catch(() => '');
    throw new Error(`email not accepted by the provider (${res.status}): ${body.slice(0, 200)}`);
  }
  const d = await res.json().catch(() => ({}));
  return { id: d.id || null };
}

/* The address people open links on: APP_URL, else the live site. Never the
   request's own Host header, which a caller can forge to point a reset
   email at their own server. */
const appUrl = () => (process.env.APP_URL || 'https://www.maksops.co.in').replace(/\/+$/, '');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { sendMail, mailReady, appUrl, escapeHtml };
