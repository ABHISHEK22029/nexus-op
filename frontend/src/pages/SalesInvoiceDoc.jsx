import React, { useState, useEffect, useRef } from 'react';
import CompanyLogo from '../components/CompanyLogo';
import InlineEdit from '../components/InlineEdit';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Plus, IndianRupee, AlertTriangle, Mail, Pencil } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import { amountInWords } from '../lib/amountInWords';
import { docFileName, downloadDocumentPdf, printAs } from '../lib/documentPdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* An amount on the document: right-aligned, on one line, figures of equal
   width — ₹14,25,41,68,500.00 wrapped onto two lines reads as two numbers. */
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

export default function SalesInvoiceDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState(null);
  const [pay, setPay] = useState({ amount: '', mode: 'Bank', reference: '', paidDate: '' });
  const ref = useRef(null);
  const [emailing, setEmailing] = useState(false);
  const [making, setMaking] = useState(false);

  const load = () => fetch(`${API}/sales-invoices/${id}`).then(r => r.ok ? r.json() : null).then(setInv);
  useEffect(() => { load(); }, [id]);

  const setStatus = async (status) => { await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); load(); };

  /* Save one field from the document itself. The server decides what is
     still editable once an invoice is issued, and its answer replaces the
     local row — a changed discount moves every total below it. */
  const patch = async (field, value) => {
    try {
      const res = await fetch(`${API}/sales-invoices/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value === '' ? null : value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || 'Could not save'); return { ok: false, error: d.error }; }
      setInv(prev => ({ ...prev, ...d }));
      toast.success('Saved');
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  };

  const isDraft = inv?.status === 'Draft';
  /* An issued invoice with nothing received against it can still be taken
     back to draft and corrected — the status menu always allowed it, but
     nothing said so, and the padlock on the number read as "this cannot be
     done at all". Once money has come in, the correction is a credit or
     debit note, and the button says that instead. */
  const canReopen = inv && !isDraft && !(Number(inv.amount_paid) > 0);
  const reopen = async () => {
    if (!window.confirm(`Reopen ${inv.invoice_number} as a draft?\n\nIf it has already gone to the customer, send them the corrected copy once you have changed it.`)) return;
    const r = await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Draft' }) });
    if (!r.ok) { toast.error('Could not reopen it'); return; }
    navigate(`/sales-invoices/${id}/edit`);
  };

  const recordPayment = async () => {
    if (!pay.amount || +pay.amount <= 0) { toast.error('Enter a payment amount'); return; }
    const res = await fetch(`${API}/sales-invoices/${id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay) });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Failed'); return; }
    toast.success(`Payment recorded — ${d.status}`);
    setPay({ amount: '', mode: 'Bank', reference: '', paidDate: '' });
    load();
  };

  if (!inv) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading invoice…</div>;
  const co = inv.company || {};
  const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  /* To the paisa: the difference of two amounts in floating point can
     come out as …543.9999999 and print a paisa short. */
  const paid = Number(inv.amount_paid) || 0;
  const due = Math.max(0, Math.round(((Number(inv.net_amount) || 0) - paid) * 100) / 100);
  const input = { padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const dueDate = fmt(inv.due_date);
  const overdue = inv.due_date && due > 0 && new Date(inv.due_date) < new Date();

  /* Snapshots taken when the invoice was issued; fall back to the live
     customer record for invoices created before we captured them. */
  const billTo = {
    name: inv.bill_to_name || inv.customer?.name,
    address: inv.bill_to_address || inv.customer?.billing_address,
    gstin: inv.bill_to_gstin || inv.customer?.gstin,
    state: inv.bill_to_state || inv.customer?.state,
  };
  const shipTo = {
    name: inv.ship_to_name || billTo.name,
    address: inv.ship_to_address || inv.customer?.shipping_address || billTo.address,
    gstin: inv.ship_to_gstin || billTo.gstin,
    state: inv.ship_to_state || inv.customer?.shipping_state || billTo.state,
  };
  const differentShipTo = (shipTo.address || '') !== (billTo.address || '');
  const hasBank = co.bank_name && co.bank_account_no && co.bank_ifsc;
  const fileName = docFileName('Tax Invoice', inv.invoice_number, billTo.name);
  const terms = inv.terms || co.invoice_terms;
  /* Spelled from the total on the page, not the text stored when the
     invoice was raised: invoices raised before the 8 Oct fix still carry
     "Rupees undefined Hundred…" in that column. */
  const words = amountInWords(inv.net_amount);

  /* The totals block, once, for the page and the PDF. Amount received and
     balance due appear once money has come in; an unpaid invoice reads
     exactly as before. */
  const half = Number(inv.gst_rate) / 2;
  const totalRows = [
    { label: 'SUB-TOTAL', value: rup(inv.sub_total) },
    Number(inv.discount) ? { label: 'DISCOUNT', value: `-${rup(inv.discount)}` } : null,
    /* Rule 46(i): the RATE of tax is a particular of the invoice, not just
       the amount. */
    ...(inv.interstate
      ? [{ label: `IGST @ ${inv.gst_rate}%`, value: rup(inv.igst) }]
      : [{ label: `CGST @ ${half}%`, value: rup(inv.cgst) }, { label: `SGST @ ${half}%`, value: rup(inv.sgst) }]),
    Number(inv.round_off) ? { label: 'ROUND OFF', value: rup(inv.round_off) } : null,
    { label: 'INVOICE TOTAL', value: rup(inv.net_amount), strong: true },
    ...(paid > 0 ? [
      { label: 'AMOUNT RECEIVED', value: `-${rup(paid)}` },
      { label: 'BALANCE DUE', value: rup(due), strong: true },
    ] : []),
  ].filter(Boolean);
  const bankRows = hasBank ? [
    co.bank_account_name && ['Account Name', co.bank_account_name],
    ['Bank', co.bank_name], ['Account No.', co.bank_account_no], ['IFSC', co.bank_ifsc],
    co.bank_branch && ['Branch', co.bank_branch], co.upi_id && ['UPI', co.upi_id],
  ].filter(Boolean) : [];

  /* Rule 46 requires these. A missing field can invalidate the buyer's Input
     Tax Credit claim, which means the invoice comes back unpaid. Warn here,
     on screen, rather than letting the customer's accounts team find it. */
  const gaps = [
    !co.gstin && 'Your GSTIN (set it in Company Profile)',
    !inv.place_of_supply && 'Place of supply',
    !billTo.address && "Customer's billing address",
    !hasBank && 'Your bank details (Company Profile) — the customer cannot pay without them',
  ].filter(Boolean);

  /* What the PDF says — the same values as the page above it. */
  const pdfModel = () => ({
    fileName, title: 'TAX INVOICE', number: inv.invoice_number, framed: true, company: co,
    meta: [['Invoice #', inv.invoice_number], ['Date', date], dueDate && ['Due', dueDate], ['Status', inv.status]],
    parties: [
      { title: 'Bill To', name: billTo.name, lines: [billTo.address, billTo.state], gstin: billTo.gstin || '' },
      { title: 'Ship To', note: differentShipTo ? '' : '(same as billing)', name: shipTo.name, lines: [shipTo.address, shipTo.state], gstin: shipTo.gstin || undefined },
    ],
    facts: [
      ['Place of Supply', `${inv.place_of_supply || '—'}${inv.place_of_supply_code ? ` (${inv.place_of_supply_code})` : ''}`],
      ['Reverse Charge', inv.reverse_charge ? 'Yes' : 'No'],
      inv.eway_bill_no && ['E-Way Bill', inv.eway_bill_no],
      inv.customer_order_id && ['Order Ref', inv.order?.order_number || `#${inv.customer_order_id}`],
      inv.order?.customer_po_ref && ['Your PO', inv.order.customer_po_ref],
    ],
    columns: [
      { key: 'index', label: '#' }, { key: 'description', label: 'Description' }, { key: 'hsn', label: 'HSN' },
      { key: 'uom', label: 'UOM', align: 'center' }, { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'rate', label: 'Rate', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right', strong: true },
    ],
    boldDescription: true,
    rows: inv.items.map((it, i) => [String(i + 1), it.description, it.hsn || '-', it.uom || '', String(it.quantity ?? ''), rup(it.rate), rup(it.amount)]),
    notes: inv.notes, totals: totalRows, words: `Amount in Words: ${words}`,
    bank: bankRows.length ? { title: 'Bank Details for Payment', rows: bankRows } : null,
    terms: terms ? { text: terms } : null, irn: inv.irn,
    footerLeft: co.invoice_footer_note || 'This is a computer-generated invoice.',
    footerRight: `${inv.invoice_number}  |  ${date}`,
  });
  /* A real file, saved in one click — lib/documentPdf.js says why it is
     laid out there rather than printed. */
  const pdf = async () => {
    setMaking(true);
    try { await downloadDocumentPdf(pdfModel()); }
    catch (e) { toast.error(`Could not make the PDF: ${e?.message || e}`); throw e; }
    finally { setMaking(false); }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => navigate('/sales-invoices')} className="inv-act-btn"><ArrowLeft size={15} /> All Invoices</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
          {isDraft && (
            <button onClick={() => navigate(`/sales-invoices/${id}/edit`)} className="inv-act-btn primary"><Pencil size={15} /> Edit invoice</button>
          )}
          {canReopen && (
            <button onClick={reopen} className="inv-act-btn" title="Take it back to draft to change the number, date, lines or anything else">
              <Pencil size={15} /> Reopen as draft
            </button>
          )}
          <select value={inv.status} onChange={e => setStatus(e.target.value)} aria-label="Invoice status" style={{ width: 'auto', flex: 'none', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
            {['Draft', 'Sent', 'Partially Paid', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => pdf().catch(() => {})} disabled={making} className="inv-act-btn" title={`Saves ${fileName}.pdf`}><Download size={15} /> {making ? 'Making PDF…' : 'Download PDF'}</button>
          {/* Sending it was the missing step: an invoice could be produced
              and printed, and there was no way to get it to the customer
              without leaving the product. */}
          <button onClick={() => setEmailing(true)} className="inv-act-btn"><Mail size={15} /> Email</button>
          <button onClick={() => printAs(fileName)} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
      </div>

      {/* Payment status banner */}
      <div className="print:hidden" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Total</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>₹{rup(inv.net_amount)}</div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Received</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>₹{rup(paid)}</div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Balance Due</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: due > 0 ? '#ef4444' : '#10b981', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>₹{rup(due)}</div>
        </div>
      </div>

      {/* Record payment */}
      {due > 0 && (
        <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginRight: 6 }}><IndianRupee size={16} style={{ color: 'var(--brand-amber)' }} /> Record payment</div>
          {/* Explicit widths: the global form styles make a bare select or
              date input fill the row, which stacked this line into four. */}
          <input style={{ ...input, width: 120, flex: 'none' }} type="number" placeholder="Amount" aria-label="Payment amount" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
          <select style={{ ...input, width: 110, flex: 'none' }} aria-label="Payment mode" value={pay.mode} onChange={e => setPay({ ...pay, mode: e.target.value })}>{['Bank', 'Cash', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}</select>
          <input style={{ ...input, width: 160, flex: 'none' }} placeholder="Reference / UTR" aria-label="Payment reference" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
          <input style={{ ...input, width: 150, flex: 'none' }} type="date" aria-label="Payment date" value={pay.paidDate} onChange={e => setPay({ ...pay, paidDate: e.target.value })} />
          <button onClick={recordPayment} className="btn-primary btn-sm"><Plus size={14} /> Add</button>
        </div>
      )}

      {/* Compliance warning — screen only, never printed */}
      {gaps.length > 0 && (
        <div className="print:hidden" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
            <AlertTriangle size={16} /> {gaps.length} field{gaps.length > 1 ? 's' : ''} missing — this invoice may be rejected
          </div>
          <ul style={{ margin: '6px 0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {gaps.map(g => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}

      {/* Document. On a phone it scrolls sideways in its own box (print.css). */}
      <div className="doc-scroll">
      <div ref={ref} className="invoice-mock">
        <div className="inv-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CompanyLogo fallbackUrl={co.logo_url || null} height={44} />
            <div>
              <div className="inv-company-name">{co.name || '—'}</div>
              <div className="inv-company-detail">
                {co.address}{co.address && <br />}
                {co.gstin && <>GSTIN: <strong>{co.gstin}</strong>{co.pan ? ' · ' : <br />}</>}
                {co.pan && <>PAN: <strong>{co.pan}</strong><br /></>}
                {co.udyam_msme_no && <>Udyam/MSME: <strong>{co.udyam_msme_no}</strong><br /></>}
                {co.phone && <>Ph: {co.phone}</>}{co.email && <> · {co.email}</>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Tax Invoice</div>
            {/* Editable while the invoice is a Draft. Once issued the number
                and date are particulars of a tax document under Rule 46 —
                the padlock says so rather than letting someone type into a
                field the server will refuse. */}
            <div className="inv-meta-row">Invoice #: <InlineEdit
              value={inv.invoice_number} field="invoice_number" canEdit={isDraft} onSave={patch}
              title={canReopen ? 'Issued — use “Reopen as draft” above to change the number'
                : 'Money has been received against this invoice — correct it with a credit or debit note'} /></div>
            <div className="inv-meta-row">Date: <InlineEdit
              value={inv.invoice_date?.slice(0, 10)} field="invoice_date" type="date"
              canEdit={isDraft} onSave={patch} format={fmt}
              title={canReopen ? 'Issued — use “Reopen as draft” above to change the date' : 'An invoice with payments against it keeps its date'} /></div>
            {/* The due date can move after issue — payment terms get agreed
                late — so it stays editable whatever the status. */}
            <div className="inv-meta-row">Due: <span style={{ color: overdue ? '#dc2626' : undefined }}><InlineEdit
              value={inv.due_date?.slice(0, 10)} field="due_date" type="date" canEdit onSave={patch}
              format={(d) => (d ? `${fmt(d)}${overdue ? ' (overdue)' : ''}` : null)} placeholder="not set" /></span></div>
            <div className="inv-meta-row">Status: <strong>{inv.status}</strong></div>
          </div>
        </div>

        {/* Bill To / Ship To — separate parties. Under GST the tax split follows
            the place of supply (where goods go), not the billing address. */}
        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Bill To</div>
            <div className="inv-party-name">{billTo.name || '—'}</div>
            <div className="inv-party-detail doc-wrap">
              {billTo.address || <em style={{ color: '#dc2626' }}>Address missing</em>}{billTo.address && <br />}
              {billTo.state && <>{billTo.state}<br /></>}
              GSTIN: <strong>{billTo.gstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Ship To {!differentShipTo && <span style={{ fontWeight: 400, textTransform: 'none' }}>(same as billing)</span>}</div>
            <div className="inv-party-name">{shipTo.name || '—'}</div>
            <div className="inv-party-detail doc-wrap">
              {shipTo.address || '—'}{shipTo.address && <br />}
              {shipTo.state && <>{shipTo.state}<br /></>}
              {shipTo.gstin && <>GSTIN: <strong>{shipTo.gstin}</strong></>}
            </div>
          </div>
        </div>

        {/* Rule 46 fields that must appear on the face of the invoice */}
        <div className="inv-facts" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '8px 22px', fontSize: '0.78rem', borderBottom: '1px solid #e5e7eb' }}>
          <span>Place of Supply: <strong>{inv.place_of_supply || <em style={{ color: '#dc2626' }}>not set</em>}</strong>{inv.place_of_supply_code ? ` (${inv.place_of_supply_code})` : ''}</span>
          <span>Reverse Charge: <strong>{inv.reverse_charge ? 'Yes' : 'No'}</strong></span>
          <span className={inv.eway_bill_no ? undefined : 'print:hidden'}>E-Way Bill: <InlineEdit
            value={inv.eway_bill_no} field="eway_bill_no" canEdit onSave={patch} placeholder="add" /></span>
          {inv.customer_order_id && <span>Order Ref: <strong>{inv.order?.order_number || `#${inv.customer_order_id}`}</strong></span>}
          {inv.order?.customer_po_ref && <span>Your PO: <strong>{inv.order.customer_po_ref}</strong></span>}
        </div>

        <div className="inv-items-table">
          <table className="doc-items">
            <thead><tr><th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN</th><th>UOM</th><th style={num}>QTY</th><th style={num}>RATE</th><th style={num}>AMOUNT</th></tr></thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td className="doc-wrap" style={{ fontWeight: 600 }}>{it.description}</td>
                  <td>{it.hsn || '-'}</td><td>{it.uom}</td><td style={num}>{it.quantity}</td>
                  <td style={{ ...num, fontFamily: 'var(--font-mono)' }}>{rup(it.rate)}</td>
                  <td style={{ ...num, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals to footer: one block, never split across sheets and never
            starting one alone (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div className="inv-totals-section">
          <div className="inv-notes doc-wrap">{inv.notes && <><strong>Notes</strong>{inv.notes}</>}</div>
          <table className="inv-totals-table">
            <tbody>
              {totalRows.map(r => (
                <tr key={r.label} className={r.strong ? 'tf' : undefined}>
                  <td className="tl" style={r.strong ? { color: '#000' } : undefined}>{r.label}</td>
                  <td className="tv" style={r.strong ? { color: '#000' } : undefined}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-amount-words">Amount in Words: {words}</div>

        {/* Bank details — without these the customer literally cannot pay.
            minmax(0, …): a long word in the terms widened its column until
            the bank box was squeezed to a sliver. */}
        <div className="inv-bank-terms" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, margin: '14px 22px 0' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>Bank Details for Payment</div>
            {hasBank ? (
              <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {co.bank_account_name && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Account Name</td><td><strong>{co.bank_account_name}</strong></td></tr>}
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Bank</td><td><strong>{co.bank_name}</strong></td></tr>
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Account No.</td><td><strong>{co.bank_account_no}</strong></td></tr>
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>IFSC</td><td><strong>{co.bank_ifsc}</strong></td></tr>
                  {co.bank_branch && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Branch</td><td>{co.bank_branch}</td></tr>}
                  {co.upi_id && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>UPI</td><td>{co.upi_id}</td></tr>}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>Not configured — add them in Company Profile.</div>
            )}
          </div>

          <div>
            {/* Reserved for the e-invoice QR. The IRN and signed QR come back
                from the government IRP; we never mint them ourselves. */}
            {inv.irn && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280' }}>IRN</div>
                <div style={{ fontSize: '0.62rem', wordBreak: 'break-all' }}>{inv.irn}</div>
              </div>
            )}
            {terms && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Terms &amp; Conditions</div>
                <div className="doc-wrap" style={{ fontSize: '0.72rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{terms}</div>
              </div>
            )}
          </div>
        </div>

        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized Signatory</div>
            <div className="inv-sig-company mt-2">For {co.name || '—'}</div>
          </div>
        </div>
        <div className="inv-footer">
          <div className="inv-footer-left">
            {co.invoice_footer_note || 'This is a computer-generated invoice.'}
          </div>
          <div className="inv-footer-right">{inv.invoice_number} &nbsp;|&nbsp; {date}</div>
        </div>
        </div>
      </div>
      </div>

      {/* Anything that belongs with this invoice — the customer's PO, a
          signed copy, proof of delivery. Never printed. */}
      <div className="print:hidden" style={{ marginTop: 16 }}>
        <Attachments entityType="sales_invoice" entityId={id} label="Documents for this invoice" compact />
      </div>

      {emailing && (
        <EmailDocumentModal
          kind="invoice"
          number={inv.invoice_number}
          to={inv.customer?.email}
          partyName={inv.customer?.contact_name || inv.customer?.name}
          company={co}
          amount={inv.net_amount}
          extra={[
            ['Already paid', paid > 0 ? `₹${rup(paid)}` : null],
            ['Balance due', paid > 0 ? `₹${rup(due)}` : null],
            ['Payable by', inv.due_date],
          ]}
          onClose={() => setEmailing(false)}
          /* The same PDF the toolbar produces, so what is attached is
             exactly what was on screen. */
          onDownloadPdf={pdf}
          fileName={`${fileName}.pdf`}
        />
      )}
    </div>
  );
}
