/* ══════════════════════════════════════════════════════════
   Emailing an invoice — drafted here, sent from your own mailbox.

   The alternative was sending it from the server, and it is worse for a
   business. Mail from an application's infrastructure needs SPF and DKIM
   set up before it stops landing in spam, arrives from an address the
   customer does not recognise, and replies go somewhere nobody reads. Mail
   from your own Gmail arrives from you, threads with the rest of the
   conversation, and lands in your Sent folder where you can prove you sent
   it.

   The catch, stated plainly rather than hidden: neither a mailto: link nor
   Gmail's compose URL can attach a file — no web page may put a file into
   another site's compose window. So the PDF is downloaded first and the
   person attaches it. Two clicks, and no infrastructure to maintain.

   Because of that, the payment details go in the BODY as well as in the
   attachment. If the attachment is forgotten, the customer still knows what
   is owed, by when, and where to send it.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from 'react';
import { X, Mail, Paperclip, ExternalLink } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const rup = n => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const onDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

/** The message a supplier would actually write, filled in from the invoice. */
function draftBody(inv) {
  const co = inv.company || {};
  const cust = inv.customer || {};
  const due = Math.max(0, Number(inv.net_amount || 0) - Number(inv.amount_paid || 0));

  const lines = [
    `Dear ${cust.contact_name || cust.name || 'Sir/Madam'},`,
    '',
    `Please find attached our invoice ${inv.invoice_number}${inv.invoice_date ? ` dated ${onDate(inv.invoice_date)}` : ''}.`,
    '',
    `Invoice number : ${inv.invoice_number}`,
    `Amount         : ${rup(inv.net_amount)}`,
  ];
  if (Number(inv.amount_paid) > 0) {
    lines.push(`Already paid   : ${rup(inv.amount_paid)}`);
    lines.push(`Balance due    : ${rup(due)}`);
  }
  if (inv.due_date) lines.push(`Payable by     : ${onDate(inv.due_date)}`);

  /* Bank details in the body, not only on the attachment. An invoice a
     customer cannot pay from is an invoice that gets chased. */
  if (co.bank_name || co.bank_account_no || co.upi_id) {
    lines.push('', 'Payment details');
    if (co.bank_name) lines.push(`  Bank    : ${co.bank_name}`);
    if (co.bank_account_no) lines.push(`  Account : ${co.bank_account_no}`);
    if (co.bank_ifsc) lines.push(`  IFSC    : ${co.bank_ifsc}`);
    if (co.upi_id) lines.push(`  UPI     : ${co.upi_id}`);
  }

  lines.push('', 'Please let us know if anything needs correcting.', '',
    'Thank you,', co.name || '');
  return lines.filter(l => l !== undefined).join('\n');
}

export default function EmailInvoiceModal({ inv, onClose, onDownloadPdf }) {
  const toast = useToast();
  const co = inv.company || {};
  const [to, setTo] = useState(inv.customer?.email || '');
  const [subject, setSubject] = useState(
    `Invoice ${inv.invoice_number}${co.name ? ` from ${co.name}` : ''}`);
  const [body, setBody] = useState(() => draftBody(inv));
  const [downloaded, setDownloaded] = useState(false);

  const noBank = !(co.bank_name || co.bank_account_no || co.upi_id);

  const gmailUrl = useMemo(() => {
    const p = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
    return `https://mail.google.com/mail/?${p.toString()}`;
  }, [to, subject, body]);

  const mailtoUrl = useMemo(
    () => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    [to, subject, body]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const open = async (url) => {
    if (!valid) return toast.error('Enter the address to send it to');
    /* The PDF first, so it is already in Downloads when the compose window
       opens and the attach dialog has something to point at. */
    try { await onDownloadPdf?.(); setDownloaded(true); } catch { /* not fatal */ }
    window.open(url, '_blank', 'noopener');
  };

  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none',
  };

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.3))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <Mail size={17} style={{ color: 'var(--brand-amber)' }} /> Email this invoice
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Drafted here, sent from your own mailbox — so it arrives from you and replies come back to you.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 13 }}>
            <label style={label}>To</label>
            <input value={to} onChange={e => setTo(e.target.value)}
              placeholder="buyer@company.com" style={input} />
            {!inv.customer?.email && (
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>
                No email on file for {inv.customer?.name || 'this customer'} — add one and it will fill itself in next time.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 13 }}>
            <label style={label}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={input} />
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={label}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={13}
              style={{ ...input, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', lineHeight: 1.5, resize: 'vertical' }} />
          </div>

          {noBank && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10,
              padding: '9px 11px', borderRadius: 8,
              background: 'rgba(245,158,11,0.12)', color: '#b45309', fontSize: '0.78rem',
            }}>
              <Paperclip size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                No bank details on your company profile, so the message cannot say where to send
                the money. Add them in Settings → Company profile.
              </span>
            </div>
          )}

          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10,
            padding: '9px 11px', borderRadius: 8,
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.78rem',
          }}>
            <Paperclip size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {downloaded
                ? <><strong>{inv.invoice_number}.pdf is in your Downloads</strong> — attach it in the compose window.</>
                : <>The PDF downloads when you continue. Attach it in the compose window: no website can put a file into another site's compose box for you.</>}
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          padding: '13px 18px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap',
        }}>
          <button onClick={() => open(mailtoUrl)} className="btn-secondary btn-sm"
            title="Opens whatever mail app this computer uses">
            Use my mail app
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={() => open(gmailUrl)} className="btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} /> Download PDF &amp; open Gmail
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
