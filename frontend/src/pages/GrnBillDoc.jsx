import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import Attachments from '../components/Attachments';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function GrnBillDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const ref = useRef(null);

  useEffect(() => { fetch(`${API}/grn-bills/${id}`).then(r => r.ok ? r.json() : null).then(setBill); }, [id]);

  const setStatus = async (status) => {
    await fetch(`${API}/grn-bills/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setBill(b => ({ ...b, status }));
  };
  const pdf = () => html2pdf().set({ margin: 0, filename: `${bill.bill_number}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4' } }).from(ref.current).save();

  if (!bill) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading bill…</div>;
  const co = bill.company || {};
  const date = bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => navigate('/grn')} className="inv-act-btn"><ArrowLeft size={15} /> Back to GRN</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={bill.status} onChange={e => setStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
            {['Draft', 'Approved', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={pdf} className="inv-act-btn"><Download size={15} /> PDF</button>
          <button onClick={() => window.print()} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
      </div>

      {/* Attachments — challan / vendor bill (hidden on print) */}
      <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Attachments entityType="grn_bill" entityId={id} label="Challan & Documents" compact />
      </div>

      {/* B&W document */}
      <div ref={ref} className="invoice-mock">
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{co.name || 'Kirashi Business Synergies'}</div>
            <div className="inv-company-detail">
              {co.address || '202, Plot No 130, Kavuri Hills, Jubilee Hills, Hyderabad 500033'}<br />
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
            <div className="inv-party-detail">GRN #{bill.grn_id} · PO #{bill.po_id}</div>
          </div>
        </div>

        <div className="inv-items-table">
          <table>
            <thead><tr>
              <th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN</th><th>UOM</th><th>QTY</th><th>RATE</th><th>AMOUNT</th>
            </tr></thead>
            <tbody>
              {bill.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.description}</td>
                  <td>{it.hsn || '-'}</td>
                  <td>{it.uom}</td>
                  <td>{it.quantity}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{rup(it.rate)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-totals-section">
          <div className="inv-notes">{bill.notes && <><strong>Notes</strong>{bill.notes}</>}</div>
          <table className="inv-totals-table">
            <tbody>
              <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(bill.sub_total)}</td></tr>
              {bill.freight ? <tr><td className="tl">FREIGHT</td><td className="tv">{rup(bill.freight)}</td></tr> : null}
              {bill.other_charges ? <tr><td className="tl">OTHER CHARGES</td><td className="tv">{rup(bill.other_charges)}</td></tr> : null}
              {bill.discount ? <tr><td className="tl">DISCOUNT</td><td className="tv">-{rup(bill.discount)}</td></tr> : null}
              {bill.interstate
                ? <tr><td className="tl">IGST @ {bill.gst_rate}%</td><td className="tv">{rup(bill.igst)}</td></tr>
                : <>
                    <tr><td className="tl">CGST</td><td className="tv">{rup(bill.cgst)}</td></tr>
                    <tr><td className="tl">SGST</td><td className="tv">{rup(bill.sgst)}</td></tr>
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
            <div className="inv-sig-company mt-2">{co.name || 'Kirashi Business Synergies'}</div>
          </div>
        </div>
        <div className="inv-footer">
          <div className="inv-footer-left">Generated by Nexus-OP Platform</div>
          <div className="inv-footer-right">{bill.bill_number} &nbsp;|&nbsp; {date}</div>
        </div>
      </div>
    </div>
  );
}
