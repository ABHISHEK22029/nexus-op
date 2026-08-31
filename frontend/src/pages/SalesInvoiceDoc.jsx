import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Plus, IndianRupee, AlertTriangle } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function SalesInvoiceDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState(null);
  const [pay, setPay] = useState({ amount: '', mode: 'Bank', reference: '', paidDate: '' });
  const ref = useRef(null);

  const load = () => fetch(`${API}/sales-invoices/${id}`).then(r => r.ok ? r.json() : null).then(setInv);
  useEffect(() => { load(); }, [id]);

  const setStatus = async (status) => { await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); load(); };
  const pdf = () => html2pdf().set({ margin: 0, filename: `${inv.invoice_number}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4' } }).from(ref.current).save();

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
  const due = Math.max(0, (inv.net_amount || 0) - (inv.amount_paid || 0));
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

  /* Rule 46 requires these. A missing field can invalidate the buyer's Input
     Tax Credit claim, which means the invoice comes back unpaid. Warn here,
     on screen, rather than letting the customer's accounts team find it. */
  const gaps = [
    !co.gstin && 'Your GSTIN (set it in Company Profile)',
    !inv.place_of_supply && 'Place of supply',
    !billTo.address && "Customer's billing address",
    !hasBank && 'Your bank details (Company Profile) — the customer cannot pay without them',
  ].filter(Boolean);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => navigate('/sales-invoices')} className="inv-act-btn"><ArrowLeft size={15} /> All Invoices</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={inv.status} onChange={e => setStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
            {['Draft', 'Sent', 'Partially Paid', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={pdf} className="inv-act-btn"><Download size={15} /> PDF</button>
          <button onClick={() => window.print()} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
      </div>

      {/* Payment status banner */}
      <div className="print:hidden" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Total</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>₹{rup(inv.net_amount)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Received</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>₹{rup(inv.amount_paid)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Balance Due</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: due > 0 ? '#ef4444' : '#10b981', fontFamily: 'var(--font-mono)' }}>₹{rup(due)}</div>
        </div>
      </div>

      {/* Record payment */}
      {due > 0 && (
        <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginRight: 6 }}><IndianRupee size={16} style={{ color: 'var(--brand-amber)' }} /> Record payment</div>
          <input style={{ ...input, width: 110 }} type="number" placeholder="Amount" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
          <select style={input} value={pay.mode} onChange={e => setPay({ ...pay, mode: e.target.value })}>{['Bank', 'Cash', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}</select>
          <input style={{ ...input, width: 130 }} placeholder="Reference" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
          <input style={input} type="date" value={pay.paidDate} onChange={e => setPay({ ...pay, paidDate: e.target.value })} />
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

      {/* Document */}
      <div ref={ref} className="invoice-mock">
        <div className="inv-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {co.logo_url && <img src={co.logo_url} alt="" style={{ height: 44, width: 'auto', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />}
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
            <div className="inv-meta-row">Invoice #: <strong>{inv.invoice_number}</strong></div>
            <div className="inv-meta-row">Date: <strong>{date}</strong></div>
            {dueDate && <div className="inv-meta-row">Due: <strong style={{ color: overdue ? '#dc2626' : undefined }}>{dueDate}{overdue ? ' (overdue)' : ''}</strong></div>}
            <div className="inv-meta-row">Status: <strong>{inv.status}</strong></div>
          </div>
        </div>

        {/* Bill To / Ship To — separate parties. Under GST the tax split follows
            the place of supply (where goods go), not the billing address. */}
        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Bill To</div>
            <div className="inv-party-name">{billTo.name || '—'}</div>
            <div className="inv-party-detail">
              {billTo.address || <em style={{ color: '#dc2626' }}>Address missing</em>}{billTo.address && <br />}
              {billTo.state && <>{billTo.state}<br /></>}
              GSTIN: <strong>{billTo.gstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Ship To {!differentShipTo && <span style={{ fontWeight: 400, textTransform: 'none' }}>(same as billing)</span>}</div>
            <div className="inv-party-name">{shipTo.name || '—'}</div>
            <div className="inv-party-detail">
              {shipTo.address || '—'}{shipTo.address && <br />}
              {shipTo.state && <>{shipTo.state}<br /></>}
              {shipTo.gstin && <>GSTIN: <strong>{shipTo.gstin}</strong></>}
            </div>
          </div>
        </div>

        {/* Rule 46 fields that must appear on the face of the invoice */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '8px 2px 12px', fontSize: '0.78rem', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
          <span>Place of Supply: <strong>{inv.place_of_supply || <em style={{ color: '#dc2626' }}>not set</em>}</strong>{inv.place_of_supply_code ? ` (${inv.place_of_supply_code})` : ''}</span>
          <span>Reverse Charge: <strong>{inv.reverse_charge ? 'Yes' : 'No'}</strong></span>
          {inv.eway_bill_no && <span>E-Way Bill: <strong>{inv.eway_bill_no}</strong></span>}
          {inv.customer_order_id && <span>Order Ref: <strong>#{inv.customer_order_id}</strong></span>}
        </div>

        <div className="inv-items-table">
          <table>
            <thead><tr><th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN</th><th>UOM</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.description}</td>
                  <td>{it.hsn || '-'}</td><td>{it.uom}</td><td>{it.quantity}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{rup(it.rate)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-totals-section">
          <div className="inv-notes">{inv.notes && <><strong>Notes</strong>{inv.notes}</>}</div>
          <table className="inv-totals-table">
            <tbody>
              <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(inv.sub_total)}</td></tr>
              {inv.discount ? <tr><td className="tl">DISCOUNT</td><td className="tv">-{rup(inv.discount)}</td></tr> : null}
              {inv.interstate
                ? <tr><td className="tl">IGST @ {inv.gst_rate}%</td><td className="tv">{rup(inv.igst)}</td></tr>
                : <><tr><td className="tl">CGST</td><td className="tv">{rup(inv.cgst)}</td></tr><tr><td className="tl">SGST</td><td className="tv">{rup(inv.sgst)}</td></tr></>}
              {inv.round_off ? <tr><td className="tl">ROUND OFF</td><td className="tv">{rup(inv.round_off)}</td></tr> : null}
              <tr className="tf"><td className="tl" style={{ color: '#000' }}>INVOICE TOTAL</td><td className="tv" style={{ color: '#000' }}>{rup(inv.net_amount)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="inv-amount-words">Amount in Words: {inv.amount_in_words || '—'}</div>

        {/* Bank details — without these the customer literally cannot pay. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginTop: 14 }}>
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
            {(inv.terms || co.invoice_terms) && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Terms &amp; Conditions</div>
                <div style={{ fontSize: '0.72rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{inv.terms || co.invoice_terms}</div>
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
  );
}
