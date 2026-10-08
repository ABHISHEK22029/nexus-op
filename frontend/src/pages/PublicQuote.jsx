/* ══════════════════════════════════════════════════════════════════════
   A quotation the customer reads, and accepts or declines, online.

   "How do you know acceptance of a quotation?" Until this page, somebody
   phoned and somebody else changed a dropdown. The seller now sends a link
   (Quotations → Share for approval); the customer opens it from WhatsApp or
   email, with no account, reads the quotation, and answers with their name
   and a note. The answer is recorded once and the seller is told.

   Like the public catalogue, it renders outside AppLayout: a stranger has
   no token, so the nav, the permission context and the first-run gate
   would all either crash or send them to a login. Everything comes from
   /public/quotations/:token, which answers with what the customer needs
   to read and nothing internal.

   The look is the app's own — its colour tokens, both themes — kept plain:
   this is a document somebody is deciding on, so the figures and the two
   buttons are what matter. Readable at 360px: the lines become stacked
   rows instead of a table that would scroll sideways.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, FileText, Phone, Mail, Truck, Clock } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const pct = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
/* "8 Oct 2026" — a date column ("2026-10-08") is a calendar day, not a
   moment, so it is not shifted by the reader's time zone. */
const onDate = (v) => {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* Phone width, followed as the window changes — a table of five columns
   does not fit 360px, so narrow screens get the lines as stacked rows. */
function useNarrow(px = 620) {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

export default function PublicQuote() {
  const { token } = useParams();
  const narrow = useNarrow();
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(null);
  const [err, setErr] = useState('');
  const [justAnswered, setJustAnswered] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/public/quotations/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) {
          setState({ status: 'ok', data: d, error: '' });
          document.title = `Quotation ${d.quotation?.number || ''}${d.company?.name ? ` — ${d.company.name}` : ''}`;
        } else {
          setState({ status: 'missing', data: null, error: d.error || '' });
        }
      })
      .catch(() => { if (alive) setState({ status: 'offline', data: null, error: '' }); });
    return () => { alive = false; };
  }, [token]);

  const respond = async (decision) => {
    setErr('');
    if (!name.trim()) {
      setErr('Please type your name first, so they know who answered.');
      nameRef.current?.focus();
      return;
    }
    setSending(decision);
    try {
      const r = await fetch(`${API}/public/quotations/${encodeURIComponent(token)}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, name: name.trim(), note: note.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setState({ status: 'ok', data: d, error: '' });
        setJustAnswered(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setErr(d.error || 'That did not go through. Please try again.');
      }
    } catch {
      setErr('We could not reach the server, so your answer was not sent. Check your connection and try again.');
    }
    setSending(null);
  };

  if (state.status === 'loading') return <Page><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '80px 0' }}>Loading the quotation…</p></Page>;
  if (state.status !== 'ok') {
    return (
      <Page>
        <div style={{ textAlign: 'center', padding: '80px 8px' }}>
          <FileText size={34} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            {state.status === 'offline' ? 'We could not load this quotation' : 'This quotation link does not work'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '44ch', margin: '0 auto', lineHeight: 1.6 }}>
            {state.status === 'offline'
              ? 'Check your connection and open the link again.'
              : (state.error || 'It may have been mistyped, or the quotation may have been withdrawn.') + ' The business that sent it can send it again.'}
          </p>
        </div>
      </Page>
    );
  }

  const { company: co = {}, customer = {}, quotation: q = {}, lines = [], response, canRespond } = state.data;
  const half = (Number(q.gstRate) || 0) / 2;
  const contact = [co.phone && { icon: Phone, text: co.phone, href: `tel:${co.phone}` }, co.email && { icon: Mail, text: co.email, href: `mailto:${co.email}` }].filter(Boolean);
  const pill = response
    ? (response.decision === 'declined' ? ['Declined', 'var(--accent-red)'] : ['Accepted', 'var(--accent-emerald)'])
    : q.status === 'Converted' ? ['Order placed', 'var(--accent-emerald)']
      : q.status === 'Accepted' ? ['Accepted', 'var(--accent-emerald)']
        : q.status === 'Rejected' ? ['Declined', 'var(--accent-red)']
          : q.expired ? ['Expired', 'var(--text-muted)'] : ['Awaiting your answer', 'var(--accent-blue)'];

  return (
    <Page>
      {/* ── who it is from ── */}
      <header style={{ padding: '22px 0 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.015em', lineHeight: 1.25 }}>
          {co.name || 'Quotation'}
        </div>
        {co.tradeName && co.tradeName !== co.name && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>{co.tradeName}</div>
        )}
        {co.address && <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-line', lineHeight: 1.5 }}>{co.address}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {co.gstin && <span>GSTIN <b style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{co.gstin}</b></span>}
          {contact.map(c => (
            <a key={c.text} href={c.href} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, overflowWrap: 'anywhere' }}>
              <c.icon size={13} style={{ color: 'var(--brand-amber)', flex: 'none' }} /> {c.text}
            </a>
          ))}
        </div>
      </header>

      {/* ── what it is ── */}
      <section style={{ padding: '18px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Quotation <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem' }}>{q.number}</span>
          </h1>
          <span data-quote-status style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: pill[1], border: `1px solid ${pill[1]}`, whiteSpace: 'nowrap' }}>
            {pill[0]}
          </span>
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(3, auto)', justifyContent: 'start', gap: '8px 36px', margin: '14px 0 0', fontSize: '0.86rem' }}>
          <Fact label="For">{customer.name || '—'}</Fact>
          <Fact label="Date">{onDate(q.date) || '—'}</Fact>
          <Fact label="Valid until">
            {q.validUntil ? onDate(q.validUntil) : 'No end date'}
            {q.expired && <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}> · expired</span>}
          </Fact>
        </dl>
      </section>

      {/* ── the answer, once there is one ── */}
      <Answer response={response} q={q} co={co} contact={contact} justAnswered={justAnswered} />

      {/* ── the lines ── */}
      <section style={{ marginTop: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
        {narrow ? (
          <div>
            {lines.map((l, i) => (
              <div key={i} data-quote-line style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{l.description}</div>
                {l.hsn && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>HSN {l.hsn}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{qty(l.quantity)} {l.unit} × {money(l.rate)}</span>
                  <b style={{ color: 'var(--text-primary)' }}>{money(l.amount)}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {[['#', 'left'], ['Description', 'left'], ['Qty', 'right'], ['Rate', 'right'], ['Amount', 'right']].map(([h, a]) => (
                  <th key={h} style={{ textAlign: a, padding: '10px 14px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} data-quote-line style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {l.description}
                    {l.hsn && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>HSN {l.hsn}</div>}
                  </td>
                  <td style={num}>{qty(l.quantity)} <span style={{ color: 'var(--text-muted)' }}>{l.unit}</span></td>
                  <td style={num}>{money(l.rate)}</td>
                  <td style={{ ...num, fontWeight: 700, color: 'var(--text-primary)' }}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── totals ── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '12px 14px', display: 'grid', justifyContent: narrow ? 'stretch' : 'end' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 28px', fontSize: '0.86rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
            <span>Sub-total</span><span style={{ textAlign: 'right' }}>{money(q.subTotal)}</span>
            {q.discount > 0 && <><span>Discount</span><span style={{ textAlign: 'right' }}>−{money(q.discount)}</span></>}
            {q.discount > 0 && <><span>Taxable value</span><span style={{ textAlign: 'right' }}>{money(q.taxable)}</span></>}
            {q.interstate
              ? <><span>IGST @ {pct(q.gstRate)}</span><span style={{ textAlign: 'right' }}>{money(q.igst)}</span></>
              : <>
                  <span>CGST @ {pct(half)}</span><span style={{ textAlign: 'right' }}>{money(q.cgst)}</span>
                  <span>SGST @ {pct(half)}</span><span style={{ textAlign: 'right' }}>{money(q.sgst)}</span>
                </>}
            {q.roundOff !== 0 && <><span>Round off</span><span style={{ textAlign: 'right' }}>{q.roundOff > 0 ? '+' : '−'}{money(Math.abs(q.roundOff))}</span></>}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 28, paddingTop: 6, marginTop: 2, borderTop: '1px solid var(--border-subtle)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem' }}>
              <span>Total</span>
              <span data-quote-total>{money(q.total)}</span>
            </div>
          </div>
          {q.amountInWords && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8, textAlign: narrow ? 'left' : 'right', maxWidth: 460, justifySelf: narrow ? 'start' : 'end' }}>
              {q.amountInWords}
            </div>
          )}
        </div>
      </section>

      {/* ── delivery and terms ── */}
      {(q.deliveryDays != null || q.deliveryNote || q.paymentTermsDays) && (
        <section style={{ marginTop: 14, display: 'grid', gap: 8, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          {(q.deliveryDays != null || q.deliveryNote) && (
            <div data-quote-delivery style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Truck size={16} style={{ color: 'var(--brand-amber)', flex: 'none', marginTop: 3 }} />
              <div>
                {q.deliveryDays != null && (
                  <b style={{ color: 'var(--text-primary)' }}>
                    Delivery {q.deliveryDays === 0 ? 'on the day of your order' : `within ${q.deliveryDays} day${q.deliveryDays === 1 ? '' : 's'} of your order`}
                  </b>
                )}
                {q.deliveryNote && <div style={{ overflowWrap: 'anywhere' }}>{q.deliveryNote}</div>}
              </div>
            </div>
          )}
          {q.paymentTermsDays != null && Number(q.paymentTermsDays) > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Clock size={16} style={{ color: 'var(--brand-amber)', flex: 'none', marginTop: 3 }} />
              <span>Payment within {q.paymentTermsDays} days of invoice</span>
            </div>
          )}
        </section>
      )}
      {q.terms && (
        <section style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Terms</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6, overflowWrap: 'anywhere' }}>{q.terms}</div>
        </section>
      )}

      {/* ── the decision ── */}
      {canRespond && (
        <section aria-label="Your answer" style={{ marginTop: 22, padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Accept or decline this quotation</h2>
          <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {co.name || 'The seller'} is told straight away. You can answer once.
          </p>
          <label htmlFor="pq-name" style={lbl}>Your name *</label>
          <input id="pq-name" ref={nameRef} value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name"
            placeholder="So they know who answered" style={field} />
          <label htmlFor="pq-note" style={{ ...lbl, marginTop: 12 }}>Note <span style={{ fontWeight: 400 }}>(optional)</span></label>
          <textarea id="pq-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3}
            placeholder="Your PO number, the delivery address, or what would change your mind"
            style={{ ...field, resize: 'vertical', minHeight: 76, lineHeight: 1.5 }} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>{note.length} / 1000</div>
          {err && <p role="alert" style={{ color: 'var(--accent-red)', fontSize: '0.84rem', margin: '8px 0 0', lineHeight: 1.5 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary btn-sm" onClick={() => respond('accept')} disabled={!!sending}
              style={{ flex: narrow ? '1 1 100%' : '0 0 auto', justifyContent: 'center', opacity: sending ? 0.7 : 1 }}>
              <Check size={16} /> {sending === 'accept' ? 'Accepting…' : 'Accept quotation'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => respond('decline')} disabled={!!sending}
              style={{ flex: narrow ? '1 1 100%' : '0 0 auto', justifyContent: 'center', padding: '8px 18px', opacity: sending ? 0.7 : 1 }}>
              <X size={16} /> {sending === 'decline' ? 'Declining…' : 'Decline'}
            </button>
          </div>
        </section>
      )}

      <footer style={{ marginTop: 28, padding: '16px 0 32px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Questions about this quotation? Contact {co.name || 'the business that sent it'}
        {contact.length ? <> {contact.map((c, i) => <React.Fragment key={c.text}>{i ? ' or ' : ''}<a href={c.href} style={{ color: 'var(--brand-amber)' }}>{c.text}</a></React.Fragment>)}</> : ''}.
      </footer>
    </Page>
  );
}

/* The customer's answer as it stands — just given, or found on a later
   visit — and the other reasons the buttons are not offered. */
function Answer({ response, q, co, contact, justAnswered }) {
  const seller = co.name || 'The seller';
  let tone, title, body;
  if (response) {
    const accepted = response.decision === 'accepted';
    tone = accepted ? 'var(--accent-emerald)' : 'var(--accent-red)';
    title = justAnswered
      ? `Thank you, ${response.name}. You ${response.decision} this quotation.`
      : `${accepted ? 'Accepted' : 'Declined'} by ${response.name} on ${onDate(response.at)}`;
    body = justAnswered
      ? `${seller} has been told${accepted ? ' and will be in touch about your order' : ''}. Recorded on ${onDate(response.at)}.`
      : null;
  } else if (q.status === 'Converted') {
    tone = 'var(--accent-emerald)'; title = 'This quotation has been confirmed as an order.';
  } else if (q.status === 'Accepted' || q.status === 'Rejected') {
    tone = q.status === 'Accepted' ? 'var(--accent-emerald)' : 'var(--accent-red)';
    title = `${seller} has recorded this quotation as ${q.status === 'Accepted' ? 'accepted' : 'declined'}.`;
    body = 'If that is not right, please contact them.';
  } else if (q.expired) {
    tone = 'var(--text-muted)';
    title = `This quotation expired on ${onDate(q.validUntil)}.`;
    body = `It can no longer be accepted online. Please contact ${seller}${contact.length ? ` ${contact.map(c => (c.icon === Phone ? `on ${c.text}` : `at ${c.text}`)).join(' or ')}` : ''} for a fresh quotation.`;
  } else return null;
  return (
    <div role="status" data-quote-answer style={{
      marginTop: 14, padding: '13px 15px', borderRadius: 12, background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${tone}`,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.45 }}>{title}</div>
      {body && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{body}</div>}
      {response?.note && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{response.note}”</div>
      )}
    </div>
  );
}

const Page = ({ children }) => (
  <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>{children}</main>
  </div>
);
const Fact = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <dt style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</dt>
    <dd style={{ margin: '2px 0 0', color: 'var(--text-primary)', fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</dd>
  </div>
);
const num = { padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' };
const lbl = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const field = {
  width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.92rem', outline: 'none', fontFamily: 'inherit',
};
