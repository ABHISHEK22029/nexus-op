/* ══════════════════════════════════════════════════════════
   Sales Quotation — the first document a prospect ever sees.

   It was printing the company name and GSTIN and nothing else: no address,
   no phone, no bank details, no validity emphasis. A quotation is a sales
   document — it has to look like someone competent produced it, and it has
   to answer "how do I pay you" the moment the customer says yes.

   It also must not read as a tax invoice. No input tax credit arises from a
   quotation, so that is stated rather than implied.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import InlineEdit from '../components/InlineEdit';
import { DOCUMENT_LAYOUTS, visibleTotals, labelOf, colWidth } from '../lib/documentLayout';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ArrowRightLeft, Clock , Mail} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import EmailDocumentModal from '../components/EmailDocumentModal';
import {
  CompanyHeader, Party, BankBox, TermsBox, SignatureBlock, DocFooter,
  NotATaxInvoice, ComplianceWarning, complianceGaps, rup, fmtDate,
} from '../components/DocumentKit';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* One definition drives the item columns and the totals rows. */
const LAYOUT = DOCUMENT_LAYOUTS.quotation;
/* Quantities read better without trailing zeros: 24 rather than 24.000.
   Number() already drops them; this only guards a value arriving as a
   string. The dot must be escaped — an unescaped `.` matches any character,
   so /.0+$/ turns a quantity of 1000 into an empty cell. */
const trimNum = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : String(n ?? '');
};

export default function SalesQuotationDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch(`${API}/sales-quotations/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setQ).catch(() => setErr(true));
  }, [id]);

  /* Save one field from the document itself. Returns {ok} / {ok:false,error}
     so InlineEdit can put the old value back and say why rather than leaving
     the screen showing a change the server refused. */
  const patch = async (field, value) => {
    try {
      const res = await fetch(`${API}/sales-quotations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value === '' ? null : value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || 'Could not save'); return { ok: false, error: d.error }; }
      /* Take the server's row, not the local edit: a change to one field can
         move others (a new discount moves every total). */
      setQ(prev => ({ ...prev, ...d }));
      toast.success('Saved');
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  };

  const isDraft = q?.status === 'Draft';
  const isConverted = q?.status === 'Converted' || !!q?.converted_order_id;

  const convert = async () => {
    if (!window.confirm(`Convert ${q.quote_number} into a customer order?`)) return;
    try {
      const res = await fetch(`${API}/sales-quotations/${id}/convert`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Won! Created order ${d.orderNumber}`);
      navigate('/customer-orders');
    } catch (e) { toast.error(e.message); }
  };

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Quotation not found. <button onClick={() => navigate('/sales-quotations')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!q) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = q.company || {};
  const cust = q.customer || {};

  /* Validity is the whole point of a quotation — steel prices move weekly.
     An expired quote being presented as live is how a job gets taken at a
     rate that no longer covers the material. */
  const expired = q.valid_until && new Date(q.valid_until) < new Date();
  const daysLeft = q.valid_until
    ? Math.ceil((new Date(q.valid_until) - new Date()) / 86400000) : null;

  const gaps = complianceGaps({
    company: co,
    party: { address: cust.billing_address, label: 'Customer' },
    needsPlaceOfSupply: false,   // a quotation is not a supply yet
  });

  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const totRow = (l, v, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: bold ? '1rem' : '0.85rem', fontWeight: bold ? 800 : 500, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      <span>{l}</span><span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/sales-quotations')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Quotations</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* A quotation that cannot be sent is a quotation nobody reads. */}
          <button onClick={() => setEmailing(true)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={15} /> Email</button>
          <button onClick={() => window.print()} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
          {q.status !== 'Converted'
            ? <button onClick={convert} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowRightLeft size={15} /> Convert to Order</button>
            : <button onClick={() => navigate('/customer-orders')} className="btn-secondary">View order →</button>}
        </div>
      </div>

      <div className="no-print"><ComplianceWarning gaps={gaps} /></div>

      {expired && (
        <div className="no-print" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', color: '#b45309', fontWeight: 600 }}>
          <Clock size={16} /> This quotation expired on {fmtDate(q.valid_until)}. Re-quote before converting — material rates will have moved.
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title="QUOTATION"
          /* Editable in place. Which of these accept a change depends on
             where the quotation has got to — the server decides, and these
             flags only mirror it so a locked field looks locked rather than
             failing after you type. */
          meta={[
            ['No.', <InlineEdit key="n" value={q.quote_number} field="quote_number"
              canEdit={isDraft} onSave={patch}
              title="The number is fixed once the quotation has been sent" />],
            ['Date', <InlineEdit key="d" value={q.quote_date?.slice(0, 10)} field="quote_date" type="date"
              canEdit={isDraft} onSave={patch} format={fmtDate}
              title="The date is fixed once the quotation has been sent" />],
            ['Valid until', <InlineEdit key="v" value={q.valid_until?.slice(0, 10)} field="valid_until" type="date"
              canEdit={!isConverted} onSave={patch} format={fmtDate} placeholder="not set" />],
            q.status && ['Status', q.status],
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Party
            title="Quotation For"
            name={cust.name}
            address={cust.billing_address}
            state={cust.state}
            gstin={cust.gstin}
            required
          />
          {(cust.shipping_address || cust.shipping_state) && (
            <Party
              title="Delivery At"
              name={cust.name}
              address={cust.shipping_address || cust.billing_address}
              state={cust.shipping_state || cust.state}
            />
          )}
        </div>

        {!expired && daysLeft != null && daysLeft <= 7 && (
          <div style={{ fontSize: '0.78rem', color: '#b45309', marginBottom: 10, fontWeight: 600 }}>
            Valid for {daysLeft} more day{daysLeft === 1 ? '' : 's'}.
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            {/* Columns come from the layout definition, not from markup here,
                so matching a different template is a change to one file
                rather than to seven document pages. */}
            <thead><tr>
              {LAYOUT.columns.map(c => (
                <th key={c.key} width={colWidth(c, LAYOUT.columns)}
                  style={{ ...th, textAlign: c.align || 'left' }}>{c.label}</th>
              ))}
            </tr></thead>
            <tbody>
              {(q.items || []).map((it, i) => (
                <tr key={it.id}>
                  {LAYOUT.columns.map(c => {
                    const raw = c.key === 'index' ? i + 1 : it[c.key];
                    const text = c.key === 'index' ? raw
                      : c.numeric
                        ? (raw == null ? '—' : (c.decimals ? trimNum(raw) : '₹' + rup(raw)))
                        : (raw || '—');
                    return (
                      <td key={c.key} style={{
                        ...td,
                        textAlign: c.align || 'left',
                        fontWeight: c.strong ? 700 : (c.key === 'description' ? 600 : 400),
                        fontFamily: c.numeric || c.key === 'hsn' ? 'var(--font-mono)' : undefined,
                        fontVariantNumeric: c.numeric ? 'tabular-nums' : undefined,
                        color: ['hsn', 'uom'].includes(c.key) ? 'var(--text-muted)' : undefined,
                        fontSize: c.key === 'hsn' ? '0.78rem' : undefined,
                      }}>{text}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 300 }}>
            {/* Which rows appear, and what the tax ones are called, come from
                the layout definition — including the CGST+SGST vs IGST split,
                which follows the place of supply the server worked out rather
                than a label fixed in the markup. */}
            {visibleTotals(LAYOUT, q).filter(r => !r.strong).map(r => (
              <React.Fragment key={r.key}>
                {totRow(labelOf(r, q), (r.sign ? r.sign + ' ' : '') + '₹' + rup(q[r.key]))}
              </React.Fragment>
            ))}
            <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }}>
              {visibleTotals(LAYOUT, q).filter(r => r.strong).map(r => (
                <React.Fragment key={r.key}>
                  {totRow(labelOf(r, q), '₹' + rup(q[r.key]), true)}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {q.amount_in_words && (
          <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <b>In words:</b> {q.amount_in_words}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 18 }}>
          <TermsBox terms={q.terms || co.invoice_terms} />
          {/* On the quotation so the customer can set us up as a payee before
              the first invoice ever arrives. */}
          <BankBox company={co} title="Bank Details (on acceptance)" />
        </div>

        <NotATaxInvoice>
          <strong>This is a quotation, not a tax invoice.</strong> No GST is payable and no input tax
          credit arises on this document. Prices hold until the validity date shown above and are
          subject to material rates at the time of order confirmation.
        </NotATaxInvoice>

        <SignatureBlock company={co} />
        <DocFooter company={co} right={q.quote_number} />
      </div>
      {emailing && (
        <EmailDocumentModal
          kind="quotation"
          number={q.quote_number}
          to={cust.email}
          partyName={cust.contact_name || cust.name}
          company={co}
          amount={q.net_amount}
          extra={[['Valid until', q.valid_until]]}
          closing="Let us know if you'd like us to proceed, or if anything needs adjusting."
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}
