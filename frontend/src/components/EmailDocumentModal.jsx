/* ══════════════════════════════════════════════════════════
   Emailing any document — drafted here, sent from your own mailbox.

   Started as the invoice-only version. Quotations, delivery challans,
   credit notes and purchase orders all end the same way: somebody produces
   a PDF and then leaves the product to send it. The reasoning is identical,
   so the component is one and the differences are data.

   Why not send from the server: mail from an application's infrastructure
   needs SPF and DKIM before it stops landing in spam, arrives from an
   address the recipient does not recognise, and replies go somewhere nobody
   reads. From your own mailbox it arrives from you, threads with the
   conversation, and lands in your Sent folder where you can prove you sent
   it.

   The catch, stated in the dialog rather than hidden: neither mailto: nor
   Gmail's compose URL can attach a file — no page may put a file into
   another site's compose window. So the PDF downloads first and the person
   attaches it. Because of that, the facts that matter go in the BODY too:
   if the attachment is forgotten, the message still says what it is about.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from 'react';
import { X, Mail, Paperclip, ExternalLink } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const rup = n => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const onDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

/* What each kind of document is called, and how it opens. Kept as data so
   adding one is a line here rather than another component. */
const KINDS = {
  invoice:   { noun: 'invoice',          opening: 'Please find attached our invoice',        pays: true },
  quotation: { noun: 'quotation',        opening: 'Please find attached our quotation',      pays: false },
  challan:   { noun: 'delivery challan', opening: 'Goods have been dispatched under delivery challan', pays: false },
  note:      { noun: 'note',             opening: 'Please find attached our',                pays: false },
  po:        { noun: 'purchase order',   opening: 'Please find attached our purchase order', pays: false },
};

export default function EmailDocumentModal({
  kind = 'invoice',
  number,                 // the document number, e.g. INV-0004
  to: initialTo = '',     // the recipient's email, if we have one
  partyName,              // who it goes to — used in the greeting
  company: companyProp,   // whose document it is
  amount,                 // headline value, optional
  extra: extraProp,       // [[label, value], …] — due date, valid until, vehicle
  closing,                // a last line, if the kind wants one
  onDownloadPdf,
  onClose,
}) {
  const toast = useToast();
  const k = KINDS[kind] || KINDS.invoice;
  /* Same nullability trap as `to`: these arrive as null from a document
     that has no company loaded yet, and a default parameter would not
     catch it. */
  const company = companyProp ?? {};
  const extra = extraProp ?? [];

  const body0 = useMemo(() => {
    const lines = [
      `Dear ${partyName || 'Sir/Madam'},`,
      '',
      `${k.opening} ${number}.`,
      '',
      `${k.noun[0].toUpperCase()}${k.noun.slice(1)} number : ${number}`,
    ];
    if (amount != null) lines.push(`Amount${' '.repeat(Math.max(1, 16 - 'Amount'.length))}: ${rup(amount)}`);
    for (const [label, value] of extra) {
      if (value == null || value === '') continue;
      const v = /date|until|by/i.test(label) ? (onDate(value) || value) : value;
      lines.push(`${label}${' '.repeat(Math.max(1, 16 - label.length))}: ${v}`);
    }

    /* Payment details in the body, not only on the attachment. A document a
       customer cannot pay from is a document that gets chased. */
    if (k.pays && (company.bank_name || company.bank_account_no || company.upi_id)) {
      lines.push('', 'Payment details');
      if (company.bank_name) lines.push(`  Bank    : ${company.bank_name}`);
      if (company.bank_account_no) lines.push(`  Account : ${company.bank_account_no}`);
      if (company.bank_ifsc) lines.push(`  IFSC    : ${company.bank_ifsc}`);
      if (company.upi_id) lines.push(`  UPI     : ${company.upi_id}`);
    }

    lines.push('', closing || 'Please let us know if anything needs correcting.', '',
      'Thank you,', company.name || '');
    return lines.join('\n');
  }, [kind, number, partyName, amount, JSON.stringify(extra), company.name]);

  /* `initialTo = ''` in the signature is not enough: a default parameter
     only applies to undefined, and a customer with no email on file gives
     NULL. That reached `to.trim()` and threw, so the dialog never opened at
     all — the button worked and nothing happened. */
  const [to, setTo] = useState(initialTo ?? '');
  const [subject, setSubject] = useState(
    `${k.noun[0].toUpperCase()}${k.noun.slice(1)} ${number}${company.name ? ` from ${company.name}` : ''}`);
  const [body, setBody] = useState(body0);
  const [downloaded, setDownloaded] = useState(false);

  const noBank = k.pays && !(company.bank_name || company.bank_account_no || company.upi_id);

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
    if (onDownloadPdf) { try { await onDownloadPdf(); setDownloaded(true); } catch { /* not fatal */ } }
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
              <Mail size={17} style={{ color: 'var(--brand-amber)' }} /> Email this {k.noun}
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
              placeholder="their email address" style={input} />
            {!initialTo && (
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>
                No email on file for {partyName || 'them'} — add one and it will fill itself in next time.
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
              {!onDownloadPdf
                ? <>Attach the PDF from this page in the compose window.</>
                : downloaded
                  ? <><strong>{number}.pdf is in your Downloads</strong> — attach it in the compose window.</>
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
              <ExternalLink size={14} /> {onDownloadPdf ? 'Download PDF & open Gmail' : 'Open Gmail'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
