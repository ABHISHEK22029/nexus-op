/* ══════════════════════════════════════════════════════════
   inviteEmail — the email a new team member gets.

   Until email could be sent, adding somebody gave the owner a link to pass
   on by WhatsApp or their own mail. Now the person gets it straight from
   Maks Ops: who added them, to which company, as what, and a button to set
   their own password. The owner still sees the link, in case the email is
   slow or lands in spam.

   Sent only when the server can send mail (mailer.mailReady); a failure to
   send never undoes the invitation — the caller reports it and the link
   still works.
   ══════════════════════════════════════════════════════════ */
const { sendMail, mailReady, appUrl, escapeHtml } = require('./mailer');

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function inviteMessage({ name, inviterName, companyName, roleLabel, link, expiresAt }) {
  const who = inviterName ? `${inviterName} has` : "You've been";
  const where = companyName ? `${companyName} on Maks Ops` : 'a Maks Ops workspace';
  const as = roleLabel ? ` as ${roleLabel}` : '';
  const until = fmtDate(expiresAt);
  const text = [
    name ? `Hello ${name},` : 'Hello,',
    '',
    `${who} added you to ${where}${as}.`,
    '',
    'Choose your password and sign in here:',
    link,
    '',
    `The link works once and expires on ${until}. If you weren't expecting this, you can ignore it.`,
    '',
    '— Maks Ops',
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#12203A;max-width:520px">
  <p>${name ? `Hello ${escapeHtml(name)},` : 'Hello,'}</p>
  <p>${escapeHtml(who)} added you to <b>${escapeHtml(where)}</b>${escapeHtml(as)}.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#f97316;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700">Set your password</a></p>
  <p style="color:#6b7280;font-size:13px">The link works once and expires on ${escapeHtml(until)}. If the button does not work, copy this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="color:#6b7280;font-size:13px">If you weren't expecting this, you can ignore it.<br>— Maks Ops</p>
</div>`;
  return { subject: `${companyName ? `${companyName} added you` : "You've been added"} to Maks Ops`, text, html };
}

/**
 * Email an invitation if the server can send mail.
 * @returns {Promise<{ emailed: boolean, error?: string }>}
 */
async function sendInvite({ to, name, inviterName, companyName, roleLabel, token, expiresAt }) {
  if (!mailReady()) return { emailed: false, error: 'Email is not set up on this server' };
  const link = `${appUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({ to, ...inviteMessage({ name, inviterName, companyName, roleLabel, link, expiresAt }), tag: 'invite' });
    return { emailed: true };
  } catch (e) {
    console.error('invite email:', e.message);
    return { emailed: false, error: 'The email could not be sent — send them the link yourself' };
  }
}

module.exports = { sendInvite, inviteMessage };
