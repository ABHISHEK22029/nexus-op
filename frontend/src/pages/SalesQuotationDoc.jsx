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
import { DOCUMENT_LAYOUTS, visibleTotals, labelOf, colWidth, deliveryPromise } from '../lib/documentLayout';
import { docFileName, downloadDocumentPdf, printAs } from '../lib/documentPdf';
import { amountInWords } from '../lib/amountInWords';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ArrowRightLeft, Clock , Mail, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePermissions } from '../context/PermissionContext';
import UnitSelect from '../components/UnitSelect';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import { docTotals, GST_RATES } from '../lib/docTotals';
import { lineProblems, adjustmentProblems } from '../lib/lineChecks';
import { stateCode } from '../lib/gstStates';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import {
  CompanyHeader, Party, BankBox, TermsBox, SignatureBlock, DocFooter,
  NotATaxInvoice, ComplianceWarning, complianceGaps, rup, fmtDate, ItemText, StatusPill,
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

/* Editing on the page (components/DocEdit). A draft: all of it. Sent or
   accepted: only how long it holds, and its notes and terms — the server's
   QUOTE_SENT_FIELDS. Converted: nothing; an order stands on these figures. */
const SENT_KEYS = ['valid_until', 'notes', 'terms'];
const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));
const blankLine = () => ({ description: '', hsn: '', uom: 'nos', quantity: '', rate: '', skuId: null });

function quoteValues(q) {
  return {
    quote_number: str(q.quote_number), quote_date: str(q.quote_date).slice(0, 10), valid_until: str(q.valid_until).slice(0, 10),
    customer_id: q.customer_id ?? null,
    notes: str(q.notes), terms: str(q.terms || q.company?.invoice_terms),
    gst_rate: numStr(q.gst_rate ?? 18),
    discount: Number(q.discount) ? numStr(q.discount) : '', round_off: Number(q.round_off) ? numStr(q.round_off) : '',
    delivery_days: q.delivery_days == null ? '' : String(q.delivery_days), delivery_note: str(q.delivery_note),
    payment_terms_days: q.payment_terms_days == null ? '' : String(q.payment_terms_days),
    /* skuId keeps a line tied to the product it was quoted from. */
    items: (q.items || []).map(it => ({ description: str(it.description), hsn: str(it.hsn), uom: str(it.uom || 'nos'), quantity: numStr(it.quantity), rate: numStr(it.rate), skuId: it.sku_id ?? null })),
  };
}
function outValue(k, v) {
  if (['discount', 'round_off', 'gst_rate'].includes(k)) return Number(v) || 0;
  if (['delivery_days', 'payment_terms_days'].includes(k)) return String(v ?? '').trim() === '' ? null : Number(v);
  if (k === 'customer_id') return v ? Number(v) : null;
  const t = String(v ?? '').trim();
  return t === '' ? null : t;
}

export default function SalesQuotationDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [q, setQ] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [err, setErr] = useState(false);
  const [making, setMaking] = useState(false);
  const { can } = usePermissions();
  const ed = useDocEdit();
  const [customers, setCustomers] = useState(null);

  const load = () => fetch(`${API}/sales-quotations/${id}`)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(setQ).catch(() => setErr(true));
  useEffect(() => { load(); }, [id]);

  const canWrite = can('sales-quotations', 'write');
  /* Open the sheet for editing, at the piece that was clicked. */
  const begin = (field) => {
    if (!q || q.status === 'Converted' || q.converted_order_id || !canWrite) return;
    if (q.status === 'Draft' && customers == null) {
      fetch(`${API}/customers`).then(r => (r.ok ? r.json() : [])).then(d => {
        const list = Array.isArray(d) ? d : (d.items || d.rows || []);
        setCustomers([...list].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      }).catch(() => setCustomers([]));
    }
    ed.start(quoteValues(q), field);
  };

  const isDraft = q?.status === 'Draft';
  const isConverted = q?.status === 'Converted' || !!q?.converted_order_id;

  const convert = async () => {
    if (!(await confirm({ title: `Turn ${q.quote_number} into an order?`, message: 'An order is made with its lines, prices and delivery. The quotation is marked Converted and can no longer be edited.', confirmLabel: 'Make the order' }))) return;
    try {
      const res = await fetch(`${API}/sales-quotations/${id}/convert`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Won! Created order ${d.orderNumber}`);
      navigate(`/customer-orders?open=${d.orderId}`);
    } catch (e) { toast.error(e.message); }
  };

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Quotation not found. <button onClick={() => navigate('/sales-quotations')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!q) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = q.company || {};

  /* ── Editing on the page ─────────────────────────────────────────── */
  const d = ed.editing ? ed.draft : null;
  const editAll = !!d && isDraft;
  const editable = (k) => !!d && (isDraft || SENT_KEYS.includes(k));
  const spotOn = (k) => !ed.editing && canWrite && !isConverted && (isDraft || SENT_KEYS.includes(k));
  /* A draft moved to another customer shows that customer straight away. */
  const picked = editAll && customers ? customers.find(c => String(c.id) === String(d.customer_id)) : null;
  const cust = picked || q.customer || {};
  /* IGST or CGST+SGST: the server works it out from the customer; a draft
     moved to a customer in another state shows the change at once. */
  const supplierCode = co.stateCode || stateCode(co.gstin);
  const custCode = picked ? (stateCode(picked.shipping_state) || stateCode(picked.state) || stateCode(picked.gstin)) : null;
  const liveInter = picked && supplierCode && custCode ? supplierCode !== custCode : !!q.interstate;
  const lt = editAll ? docTotals(d.items, { discount: d.discount, gstRate: d.gst_rate, interstate: liveInter, roundOff: d.round_off }) : null;
  const lp = editAll ? lineProblems(d.items) : null;
  const adj = editAll ? adjustmentProblems({ discount: d.discount, mode: 'amt', roundOff: d.round_off, sub: lt.subTotal }) : [];
  const zeroQty = editAll ? new Set(d.items.map((it, i) => (lp.kept.includes(it) && !(Number(it.quantity) > 0) ? i : -1)).filter(i => i >= 0)) : new Set();
  const gstBad = editAll && (d.gst_rate === '' || !(Number(d.gst_rate) >= 0 && Number(d.gst_rate) <= 100));
  const dayBad = (v) => String(v ?? '').trim() !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 3650);
  const validBad = !!d && !!d.valid_until && d.valid_until < (editAll ? d.quote_date : str(q.quote_date).slice(0, 10));
  const problems = !d ? [] : [
    editAll && !d.quote_number.trim() && 'The quotation number cannot be blank.',
    editAll && !d.quote_date && 'The quotation date cannot be blank.',
    validBad && 'The validity date is before the quotation date.',
    ...(lp ? lp.list : []),
    editAll && lp.kept.length === 0 && 'Add at least one line item.',
    editAll && zeroQty.size > 0 && `Every line needs a quantity above zero (line ${[...zeroQty].map(i => i + 1).join(', ')}).`,
    editAll && lp.kept.some(it => Number(it.rate) < 0) && 'A rate cannot be negative.',
    ...adj,
    gstBad && 'Set a GST rate between 0 and 100.',
    editAll && dayBad(d.delivery_days) && 'Delivery days must be a whole number of days.',
    editAll && dayBad(d.payment_terms_days) && 'Payment terms must be a whole number of days.',
  ].filter(Boolean);
  const shout = (bad) => ed.tried && !!bad;

  const save = async () => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const body = {};
    for (const k of ed.changed(isDraft ? undefined : SENT_KEYS)) if (k !== 'items') body[k] = outValue(k, d[k]);
    if (isDraft && ed.changed(['items']).length) {
      body.items = lp.kept.map(it => ({
        description: it.description.trim(), hsn: String(it.hsn || '').trim() || null, uom: it.uom || 'nos',
        quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0, skuId: it.skuId ?? null,
      }));
    }
    if (!Object.keys(body).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    ed.setSaving(true);
    try {
      const res = await fetch(`${API}/sales-quotations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { ed.setError(r.error || 'Could not save the quotation'); ed.setSaving(false); return; }
      /* The page shows what the server stored — and so do the print and the PDF. */
      await load();
      ed.stop();
      toast.success(`${r.quote_number || q.quote_number} saved — the print and PDF show the change`);
      if (Array.isArray(r.belowMoq) && r.belowMoq.length) toast.warning(`Below the minimum order on ${r.belowMoq.length} line${r.belowMoq.length > 1 ? 's' : ''}.`);
    } catch (e) { ed.setError(`Could not save: ${e.message}`); ed.setSaving(false); }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };
  const scope = isDraft
    ? 'A draft: change anything on it — the number, dates, customer, lines and their specifications, discount, GST, delivery, payment and terms. Totals update as you type.'
    : 'Sent to the customer: how long it holds, the notes and the terms can still change. To change prices or lines, set it back to Draft or raise a revised quotation.';

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

  const fileName = docFileName('Quotation', q.quote_number, cust.name);
  const terms = q.terms || co.invoice_terms;
  /* From the total, not the text stored when the quotation was saved —
     those made before the 8 Oct fix say "Rupees undefined Hundred…". */
  const words = amountInWords(lt ? lt.net : q.net_amount);
  const delivery = deliveryPromise(q);
  const money = (v) => '₹' + rup(v);
  const cellText = (c, it, i) => {
    const raw = c.key === 'index' ? i + 1 : it[c.key];
    return c.key === 'index' ? String(raw)
      : c.numeric
        ? (raw == null ? '—' : (c.decimals ? trimNum(raw) : money(raw)))
        : (raw || '—');
  };
  const totals = visibleTotals(LAYOUT, q).map(r => ({
    key: r.key, label: labelOf(r, q), strong: !!r.strong,
    value: (r.sign ? r.sign + ' ' : '') + money(q[r.key]),
  }));
  /* The notice points at the validity date only when there is one. */
  const holdText = q.valid_until
    ? 'Prices hold until the validity date shown above and are subject to material rates at the time of order confirmation.'
    : 'Prices are subject to material rates at the time of order confirmation.';
  /* It used to say "No GST is payable" directly under a GST total, which
     reads as a contradiction: the GST shown is what the tax invoice will
     charge; it is only this document that carries no input tax credit. */
  const noticeText = `The GST shown is charged on the tax invoice; no input tax credit can be claimed on this document. ${holdText}`;
  const notice = ['This is a quotation, not a tax invoice.', noticeText];
  /* Payment terms were stored on the quotation and never printed. */
  const payTerms = Number(q.payment_terms_days) > 0 ? `${Number(q.payment_terms_days)} days from invoice` : null;

  /* What the PDF says — the same values as the sheet below. */
  const pdfModel = () => ({
    fileName, title: 'QUOTATION', number: q.quote_number, company: co,
    /* No status: "Draft" or "Sent" is the seller's bookkeeping, not something to print on the customer's copy. */
    meta: [['No.', q.quote_number], ['Date', fmtDate(q.quote_date)], q.valid_until && ['Valid until', fmtDate(q.valid_until)]],
    parties: [
      { title: 'Quotation For', name: cust.name, lines: [cust.billing_address, cust.state], gstin: cust.gstin || '' },
      (cust.shipping_address || cust.shipping_state)
        && { title: 'Delivery At', name: cust.name, lines: [cust.shipping_address || cust.billing_address, cust.shipping_state || cust.state] },
    ],
    columns: LAYOUT.columns.map(c => ({ key: c.key, label: c.label, align: c.align, strong: c.strong, muted: ['hsn', 'uom'].includes(c.key) })),
    rows: (q.items || []).map((it, i) => LAYOUT.columns.map(c => cellText(c, it, i))),
    totals, words: `In words: ${words}`,
    lines: [delivery && ['Delivery', delivery], payTerms && ['Payment', payTerms], q.notes && ['Notes', q.notes]],
    bank: (co.bank_name && co.bank_account_no && co.bank_ifsc) ? {
      title: 'Bank Details (on acceptance)',
      rows: [co.bank_account_name && ['Account Name', co.bank_account_name], ['Bank', co.bank_name], ['Account No.', co.bank_account_no],
        ['IFSC', co.bank_ifsc], co.bank_branch && ['Branch', co.bank_branch], co.upi_id && ['UPI', co.upi_id]].filter(Boolean),
    } : null,
    terms: terms ? { text: terms } : null, termsFirst: true,
    notice,
    footerLeft: co.invoice_footer_note || 'This is a computer-generated document.',
    footerRight: q.quote_number,
  });
  /* "A proper PDF download" (the owner's words): a real A4 file, saved in
     one click — lib/documentPdf.js says why it is laid out there. */
  const pdf = async () => {
    setMaking(true);
    try { await downloadDocumentPdf(pdfModel()); }
    catch (e) { toast.error(`Could not make the PDF: ${e?.message || e}`); throw e; }
    finally { setMaking(false); }
  };

  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const totRow = (l, v, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: bold ? '1rem' : '0.85rem', fontWeight: bold ? 800 : 500, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      <span>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 16 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/sales-quotations')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Quotations</button>
          {/* Where it has got to is the seller's business: here, not on the sheet. */}
          <StatusPill status={q.status} />
        </div>
        {!ed.editing && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Edit, here on the quotation itself. */}
          {!isConverted && canWrite && (
            <button onClick={() => begin()} data-doc-edit className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={isDraft ? 'Change anything on this draft, right here on the quotation' : 'Change how long it holds, the notes or the terms'}>
              <Pencil size={15} /> Edit quotation
            </button>
          )}
          {/* A quotation that cannot be sent is a quotation nobody reads. */}
          <button onClick={() => setEmailing(true)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={15} /> Email</button>
          <button onClick={() => pdf().catch(() => {})} disabled={making} className="btn-secondary" title={`Saves ${fileName}.pdf`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={15} /> {making ? 'Making PDF…' : 'Download PDF'}</button>
          <button onClick={() => printAs(fileName)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
          {q.status !== 'Converted'
            ? <button onClick={convert} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowRightLeft size={15} /> Convert to Order</button>
            : <button onClick={() => navigate(q.converted_order_id ? `/customer-orders?open=${q.converted_order_id}` : '/customer-orders')} className="btn-secondary">View order →</button>}
        </div>
        )}
      </div>

      {ed.editing && (
        <EditBar ed={ed} what={q.quote_number} scope={scope} problems={problems} onSave={save} onCancel={cancelEdit} />
      )}

      <div className="no-print"><ComplianceWarning gaps={gaps} /></div>

      {expired && (
        <div className="no-print" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', color: '#b45309', fontWeight: 600 }}>
          <Clock size={16} /> This quotation expired on {fmtDate(q.valid_until)}. Re-quote before converting — material rates will have moved.
        </div>
      )}

      {/* On a phone the sheet scrolls sideways in its own box (print.css). */}
      <div className="doc-scroll">
      <div className="doc-sheet" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title="QUOTATION"
          /* Editable in place. Which of these accept a change depends on
             where the quotation has got to — the server decides, and these
             flags only mirror it so a locked field looks locked rather than
             failing after you type. */
          meta={[
            ['No.', editable('quote_number')
              ? <Field key="n" name="quote_number" label="Quotation number" value={d.quote_number} onChange={v => ed.set('quote_number', v)} invalid={shout(!d.quote_number.trim())} maxLength={40} style={{ width: 150, fontWeight: 700 }} />
              : <Spot key="n" field="quote_number" on={spotOn('quote_number')}>{q.quote_number}</Spot>],
            ['Date', editable('quote_date')
              ? <Field key="d" type="date" name="quote_date" label="Quotation date" value={d.quote_date} onChange={v => ed.set('quote_date', v)} invalid={shout(!d.quote_date)} style={{ fontWeight: 700 }} />
              : <Spot key="d" field="quote_date" on={spotOn('quote_date')}>{fmtDate(q.quote_date)}</Spot>],
            ['Valid until', editable('valid_until')
              ? <Field key="v" type="date" name="valid_until" label="Valid until" value={d.valid_until} onChange={v => ed.set('valid_until', v)} invalid={shout(validBad)} style={{ fontWeight: 700 }} />
              : <Spot key="v" field="valid_until" on={spotOn('valid_until')}>{q.valid_until ? fmtDate(q.valid_until) : <span className="print:hidden" style={{ fontWeight: 400, color: 'var(--text-muted)' }}>not set</span>}</Spot>,
              undefined, { screenOnly: !q.valid_until && !d }],
          ]}
        />

        {editAll && customers && customers.length > 0 && (
          <div className="de-inline de-screen" style={{ margin: '14px 0 -4px', fontSize: '0.8rem' }}>
            Customer:
            <Field as="select" name="customer_id" label="Customer" value={d.customer_id ?? ''} onChange={v => ed.set('customer_id', v ? Number(v) : null)} style={{ width: 'auto', minWidth: 260, fontWeight: 700 }}>
              {!customers.some(c => String(c.id) === String(d.customer_id)) && <option value={d.customer_id ?? ''}>{q.customer?.name || 'This customer'}</option>}
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Field>
            <span className="de-hint">its addresses come from the customer's record</span>
          </div>
        )}
        {/* One closed box, two columns — as on the PDF. */}
        <div className="doc-parties" style={{ marginTop: 16, gridTemplateColumns: (cust.shipping_address || cust.shipping_state) ? '1fr 1fr' : '1fr' }}>
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
          <div className="print:hidden" style={{ fontSize: '0.78rem', color: '#b45309', marginBottom: 10, fontWeight: 600 }}>
            Valid for {daysLeft} more day{daysLeft === 1 ? '' : 's'}.
          </div>
        )}

        <div>
          <table className="doc-items" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            {/* Columns come from the layout definition, not from markup here,
                so matching a different template is a change to one file
                rather than to seven document pages. Amount columns take the
                width of their figures and the description takes the rest: a
                fixed 13% for the rate squeezed a ₹14,25,41,68,500.00 line's
                description into a column one word wide. */}
            <thead><tr>
              {LAYOUT.columns.map(c => (
                <th key={c.key} width={c.numeric || c.key === 'description' ? undefined : colWidth(c, LAYOUT.columns)}
                  style={{ ...th, textAlign: c.align || 'left', whiteSpace: c.numeric ? 'nowrap' : undefined }}>{c.label}</th>
              ))}
            </tr></thead>
            {editAll ? (
              <tbody>
                {d.items.map((it, i) => (
                  <tr key={i} className={shout(lp.rows.has(i) || zeroQty.has(i)) ? 'de-row-bad' : undefined}>
                    <td style={{ ...td, verticalAlign: 'top' }}>{i + 1}</td>
                    <td style={{ ...td, verticalAlign: 'top' }}>
                      <Field as="textarea" name={`line-${i}-description`} label={`Line ${i + 1} description`} minRows={Math.min(8, Math.max(1, it.description.split('\n').length))}
                        placeholder="Item — specifications on the lines below" value={it.description} onChange={v => ed.setItem(i, { description: v })} invalid={shout(lp.rows.has(i))} />
                    </td>
                    <td style={{ ...td, verticalAlign: 'top' }}><Field name={`line-${i}-hsn`} label={`Line ${i + 1} HSN`} inputMode="numeric" maxLength={8} value={it.hsn} onChange={v => ed.setItem(i, { hsn: v.replace(/[^\d]/g, '') })} style={{ width: 72 }} /></td>
                    <td style={{ ...td, verticalAlign: 'top' }}><UnitSelect className="de-in" value={it.uom} onChange={v => ed.setItem(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} style={{ width: 78 }} /></td>
                    <td style={{ ...td, verticalAlign: 'top', textAlign: 'right' }}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-quantity`} label={`Line ${i + 1} quantity`} align="right" value={it.quantity} onChange={v => ed.setItem(i, { quantity: v })} invalid={shout(zeroQty.has(i))} style={{ width: 70 }} /></td>
                    <td style={{ ...td, verticalAlign: 'top', textAlign: 'right' }}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-rate`} label={`Line ${i + 1} rate`} align="right" value={it.rate} onChange={v => ed.setItem(i, { rate: v })} style={{ width: 92 }} /></td>
                    <td style={{ ...td, verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {money(lt.amounts[i])}
                      <button type="button" className="de-remove" onClick={() => ed.removeItem(i)} aria-label={`Remove line ${i + 1}`} title="Remove this line"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
            <tbody>
              {(q.items || []).map((it, i) => (
                <tr key={it.id} {...(spotOn('items') ? { 'data-de-field': `line-${i}-description`, className: 'de-spot', title: 'Click to edit' } : {})}>
                  {LAYOUT.columns.map(c => {
                    const text = cellText(c, it, i);
                    return (
                      <td key={c.key} className={c.key === 'description' ? 'doc-wrap' : undefined} style={{
                        ...td,
                        verticalAlign: 'top',
                        textAlign: c.align || 'left',
                        fontWeight: c.strong ? 700 : 400,
                        fontVariantNumeric: c.numeric ? 'tabular-nums' : undefined,
                        whiteSpace: c.numeric ? 'nowrap' : undefined,
                        /* `undefined` here wiped td's own size and colour, so
                           every cell but HSN came out at the page's 16px. */
                        color: ['hsn', 'uom'].includes(c.key) ? 'var(--text-secondary)' : td.color,
                      }}>{c.key === 'description' ? <ItemText text={it.description} /> : text}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            )}
          </table>
          {editAll && <button type="button" className="de-add-line" onClick={() => ed.addItem(blankLine())} data-de-add-line><Plus size={14} /> Add line</button>}
        </div>

        {/* Totals to footer: one block, never split across sheets and never
            starting one alone (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          {/* At least 300px, and wider when the amounts are: a total in the
              hundreds of crores no longer wraps onto a second line. */}
          {editAll ? (
            <div style={{ minWidth: 320 }} data-de-totals>
              {totRow('Sub-total', money(lt.subTotal))}
              {totRow('Discount', <Field type="number" min="0" step="any" inputMode="decimal" name="discount" label="Discount" placeholder="0.00" align="right" value={d.discount} onChange={v => ed.set('discount', v)} invalid={shout(adj.discount)} style={{ width: 110 }} />)}
              <div className="de-screen">{totRow('GST rate %', <><Field type="number" min="0" max="100" step="any" inputMode="decimal" name="gst_rate" label="GST rate" list="de-q-gst-rates" align="right" value={d.gst_rate} onChange={v => ed.set('gst_rate', v)} invalid={shout(gstBad)} style={{ width: 70 }} /><datalist id="de-q-gst-rates">{GST_RATES.map(r => <option key={r} value={r} />)}</datalist></>)}</div>
              {liveInter
                ? totRow(`IGST (${Number(d.gst_rate) || 0}%)`, money(lt.igst))
                : <>{totRow(`CGST (${(Number(d.gst_rate) || 0) / 2}%)`, money(lt.cgst))}{totRow(`SGST (${(Number(d.gst_rate) || 0) / 2}%)`, money(lt.sgst))}</>}
              {totRow('Round-off', <Field type="number" min="-1" max="1" step="0.01" inputMode="decimal" name="round_off" label="Round off" placeholder="0.00" align="right" value={d.round_off} onChange={v => ed.set('round_off', v)} invalid={shout(adj.roundOff)} style={{ width: 80 }} />)}
              <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }} data-de-total>{totRow('Total', money(lt.net), true)}</div>
            </div>
          ) : (
          <Spot field="discount" on={spotOn('discount')} block>
          <div style={{ minWidth: 300 }}>
            {/* Which rows appear, and what the tax ones are called, come from
                the layout definition — including the CGST+SGST vs IGST split,
                which follows the place of supply the server worked out rather
                than a label fixed in the markup. */}
            {totals.filter(r => !r.strong).map(r => (
              <React.Fragment key={r.key}>
                {totRow(r.label, r.value)}
              </React.Fragment>
            ))}
            <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }}>
              {totals.filter(r => r.strong).map(r => (
                <React.Fragment key={r.key}>
                  {totRow(r.label, r.value, true)}
                </React.Fragment>
              ))}
            </div>
          </div>
          </Spot>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <b>In words:</b> {words}
        </div>

        {/* The promised delivery, set on the quotation. Nothing at all when
            no promise was made. */}
        {editAll ? (
          <div className="de-stack" style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <span className="de-inline"><b>Delivery:</b> within
              <Field type="number" min="0" step="1" inputMode="numeric" name="delivery_days" label="Delivery days" value={d.delivery_days} onChange={v => ed.set('delivery_days', v)} invalid={shout(dayBad(d.delivery_days))} align="right" style={{ width: 64 }} />
              days of order.
              <Field name="delivery_note" label="Delivery note" placeholder="e.g. Incoterms: FOR site" value={d.delivery_note} onChange={v => ed.set('delivery_note', v)} style={{ width: 300 }} />
            </span>
            <span className="de-inline"><b>Payment:</b>
              <Field type="number" min="0" step="1" inputMode="numeric" name="payment_terms_days" label="Payment terms days" value={d.payment_terms_days} onChange={v => ed.set('payment_terms_days', v)} invalid={shout(dayBad(d.payment_terms_days))} align="right" style={{ width: 64 }} />
              days from invoice
            </span>
          </div>
        ) : (
          <Spot field="delivery_days" on={spotOn('delivery_days')} block>
            {delivery && (
              <div className="doc-wrap" style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <b>Delivery:</b> {delivery}
              </div>
            )}
            {payTerms && (
              <div className="doc-wrap" style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <b>Payment:</b> {payTerms}
              </div>
            )}
          </Spot>
        )}
        {/* Notes were stored on the quotation and never printed. */}
        {editable('notes') ? (
          <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <b>Notes:</b>
            <Field as="textarea" name="notes" label="Notes" minRows={2} placeholder="Printed under the totals" value={d.notes} onChange={v => ed.set('notes', v)} />
          </div>
        ) : q.notes ? (
          <Spot field="notes" on={spotOn('notes')} block>
            <div className="doc-wrap" data-quote-notes style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
              <b>Notes:</b> {q.notes}
            </div>
          </Spot>
        ) : spotOn('notes') && (
          <Spot field="notes" on block><span className="print:hidden" style={{ display: 'inline-block', marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>+ Add notes</span></Spot>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 18 }}>
          {editable('terms') ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Terms &amp; Conditions</div>
              <Field as="textarea" name="terms" label="Terms" minRows={3} value={d.terms} onChange={v => ed.set('terms', v)} style={{ fontSize: '0.72rem' }}
                placeholder={co.invoice_terms ? 'Left empty, your standard terms from Company Profile print' : '1. Payment terms…\n2. Delivery…'} />
            </div>
          ) : terms ? (
            <Spot field="terms" on={spotOn('terms')} block><TermsBox terms={terms} /></Spot>
          ) : spotOn('terms') ? (
            <Spot field="terms" on block><span className="print:hidden" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>+ Add terms &amp; conditions</span></Spot>
          ) : <div />}
          {/* On the quotation so the customer can set us up as a payee before
              the first invoice ever arrives. */}
          <BankBox company={co} title="Bank Details (on acceptance)" />
        </div>

        <NotATaxInvoice>
          <strong>This is a quotation, not a tax invoice.</strong> {noticeText}
        </NotATaxInvoice>

        <SignatureBlock company={co} />
        <DocFooter company={co} right={q.quote_number} />
        </div>
      </div>
      </div>
      {/* Files that belong with this document — the customer's enquiry or drawing, a signed acceptance. Never printed. */}
      <div className="print:hidden no-print" style={{ marginTop: 16 }}>
        <Attachments entityType="sales_quotation" entityId={id} label="Documents" compact />
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
          onDownloadPdf={pdf}
          fileName={`${fileName}.pdf`}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}
