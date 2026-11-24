import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Undo2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import Attachments from '../components/Attachments';
import { docFileName, printAs } from '../lib/documentPdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function GrnBillDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { prompt } = useConfirm();
  const [bill, setBill] = useState(null);
  /* A wrong id or a refused one showed "Loading bill…" for good. */
  const [missing, setMissing] = useState('');
  const ref = useRef(null);

  const load = () => fetch(`${API}/grn-bills/${id}`).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMissing(r.status === 403 ? 'Your role can\'t open vendor bills.' : (d.error === 'Not found' || !d.error ? 'This bill was not found. It may have been deleted.' : d.error)); return; }
    setMissing(''); setBill(d);
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  /* Draft or Approved by hand; Paid follows the payments. The answer is
     read: the page used to show the new status whatever the server said. */
  const setStatus = async (status, undoing = false) => {
    const before = bill?.status;
    const r = await fetch(`${API}/grn-bills/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || d.detail || 'Could not change the status'); return; }
    setBill(b => ({ ...b, status }));
    const no = bill?.bill_number || 'The bill';
    if (undoing) toast.success(`${no} is back to ${status}`);
    else if (before && before !== status && before !== 'Paid') toast.undo(`${no} marked ${status}`, () => setStatus(before, true));
  };
  /* A payment made in error, taken back with a reason on the record. */
  const reversePayment = async (p) => {
    const reason = await prompt({ title: `Reverse the payment of ₹${rup(p.amount)}?`, message: 'The bill goes back to owing it, and the reason goes on its record.', label: 'Why is it being reversed?', placeholder: 'e.g. paid against the wrong bill', required: true, requiredMessage: 'Say why the payment is being reversed.', confirmLabel: 'Reverse payment' });
    if (reason == null) return;
    if (!reason.trim()) { toast.error('Say why the payment is being reversed'); return; }
    const r = await fetch(`${API}/grn-bills/${id}/payments/${p.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'Could not reverse the payment'); return; }
    toast.success(`Payment reversed — bill ${d.paymentStatus}`);
    load();
  };
  /* Browser print-to-PDF rather than html2canvas: the output stays real
     text, the print stylesheet controls page breaks, and the item table
     repeats its header. The filename comes from document.title. */
  const pdf = () => printAs(docFileName('Purchase Bill', bill.bill_number, bill.vendor?.name));

  if (missing) return (
    <div style={{ padding: 40, color: 'var(--text-muted)' }}>
      <p>{missing}</p>
      <button onClick={() => navigate('/payables')} className="inv-act-btn"><ArrowLeft size={15} /> Payables</button>
    </div>
  );
  if (!bill) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading bill…</div>;
  const co = bill.company || {};
  const date = bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => navigate('/payables')} className="inv-act-btn"><ArrowLeft size={15} /> Payables</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {bill.payment_status && <span data-bill-payment-status style={{ fontSize: '0.8rem', fontWeight: 700, color: bill.payment_status === 'Paid' ? 'var(--accent-emerald, #10b981)' : 'var(--text-secondary)' }}>{bill.payment_status}</span>}
          {can('grn-bills', 'write') ? (
            <select value={bill.status === 'Paid' ? 'Approved' : bill.status} onChange={e => setStatus(e.target.value)} aria-label="Bill status" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
              {['Draft', 'Approved'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{bill.status}</span>}
          <button onClick={pdf} className="inv-act-btn"><Download size={15} /> PDF</button>
          <button onClick={pdf} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
      </div>

      {(bill.payments || []).length > 0 && (
        <div className="print:hidden" data-bill-payments style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 6 }}>Payments made</div>
          {bill.payments.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>₹{rup(p.amount)}</span>
              <span style={{ color: 'var(--text-muted)', flex: '1 1 160px' }}>
                {String(p.paid_date || p.created_at || '').slice(0, 10)} · {p.mode || 'Bank'}{p.reference ? ` · ${p.reference}` : ''}
              </span>
              {can('grn-bills', 'delete') && (
                <button onClick={() => reversePayment(p)} className="inv-act-btn" style={{ fontSize: '0.76rem', padding: '4px 10px' }}><Undo2 size={13} /> Reverse</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attachments — challan / vendor bill (hidden on print) */}
      <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Attachments entityType="grn_bill" entityId={id} label="Challan & Documents" compact />
      </div>

      {/* B&W document */}
      <div className="doc-scroll">
      <div ref={ref} className="invoice-mock">
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{co.name || co.tradeName || "Your organisation"}</div>
            <div className="inv-company-detail">
              {co.address ? <>{co.address}<br /></> : <span className="print:hidden" style={{ color: '#dc2626', fontStyle: 'italic' }}>Add your address in Company profile<br /></span>}
              {co.gstin && <>GSTIN: <strong>{co.gstin}</strong><br /></>}
              {co.phone && <>Ph: {co.phone}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Purchase Bill</div>
            <div className="inv-meta-row">Bill #: <strong>{bill.bill_number}</strong></div>
            <div className="inv-meta-row">Date: <strong>{date}</strong></div>
            {bill.vendor_bill_ref && <div className="inv-meta-row">Vendor Ref: <strong>{bill.vendor_bill_ref}</strong></div>}
            <div className="inv-meta-row">Status: <strong>{bill.status}</strong></div>
          </div>
        </div>

        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Vendor</div>
            <div className="inv-party-name">{bill.vendor?.name || '—'}</div>
            <div className="inv-party-detail">GST: <strong>{bill.vendor?.gstin || 'Unregistered'}</strong></div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Against</div>
            <div className="inv-party-detail" data-bill-links>
              {bill.grn_number || (bill.grn_id ? `GRN-${String(bill.grn_id).padStart(5, '0')}` : '—')} · PO {bill.po_id
                ? <Link to={`/po/${bill.po_id}`} style={{ color: 'inherit', fontWeight: 700 }}>{bill.po_number || `#${bill.po_id}`}</Link>
                : '—'}
            </div>
          </div>
        </div>

        <div className="inv-items-table">
          <table className="doc-items">
            <thead><tr>
              <th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN</th><th>UOM</th><th style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>QTY</th><th style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>RATE</th><th style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>AMOUNT</th>
            </tr></thead>
            <tbody>
              {bill.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td className="doc-wrap" style={{ fontWeight: 600 }}>{it.description}</td>
                  <td>{it.hsn || '-'}</td>
                  <td>{it.uom}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{it.quantity}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{rup(it.rate)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div className="inv-totals-section">
          <div className="inv-notes doc-wrap">{bill.notes && <><strong>Notes</strong>{bill.notes}</>}</div>
          <table className="inv-totals-table">
            <tbody>
              <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(bill.sub_total)}</td></tr>
              {bill.freight ? <tr><td className="tl">FREIGHT</td><td className="tv">{rup(bill.freight)}</td></tr> : null}
              {bill.other_charges ? <tr><td className="tl">OTHER CHARGES</td><td className="tv">{rup(bill.other_charges)}</td></tr> : null}
              {bill.discount ? <tr><td className="tl">DISCOUNT</td><td className="tv">-{rup(bill.discount)}</td></tr> : null}
              {bill.interstate
                ? <tr><td className="tl">IGST @ {bill.gst_rate}%</td><td className="tv">{rup(bill.igst)}</td></tr>
                : <>
                    <tr><td className="tl">CGST @ {Number(bill.gst_rate) / 2}%</td><td className="tv">{rup(bill.cgst)}</td></tr>
                    <tr><td className="tl">SGST @ {Number(bill.gst_rate) / 2}%</td><td className="tv">{rup(bill.sgst)}</td></tr>
                  </>}
              {bill.round_off ? <tr><td className="tl">ROUND OFF</td><td className="tv">{rup(bill.round_off)}</td></tr> : null}
              <tr className="tf"><td className="tl" style={{ color: '#000' }}>NET PAYABLE</td><td className="tv" style={{ color: '#000' }}>{rup(bill.net_amount)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="inv-amount-words">Amount in Words: {bill.amount_in_words || '—'}</div>

        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized Signatory</div>
            <div className="inv-sig-company mt-2">{co.name || co.tradeName || "Your organisation"}</div>
          </div>
        </div>
        <div className="inv-footer">
          <div className="inv-footer-left">Generated by Maks Ops Platform</div>
          <div className="inv-footer-right">{bill.bill_number} &nbsp;|&nbsp; {date}</div>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}
