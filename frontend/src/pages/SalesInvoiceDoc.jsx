import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Plus, IndianRupee } from 'lucide-react';
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

      {/* Document */}
      <div ref={ref} className="invoice-mock">
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{co.name || 'Kirashi Business Synergies'}</div>
            <div className="inv-company-detail">
              {co.address || '202, Plot No 130, Kavuri Hills, Jubilee Hills, Hyderabad 500033'}<br />
              {co.gstin && <>GSTIN: <strong>{co.gstin}</strong><br /></>}{co.phone && <>Ph: {co.phone}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Tax Invoice</div>
            <div className="inv-meta-row">Invoice #: <strong>{inv.invoice_number}</strong></div>
            <div className="inv-meta-row">Date: <strong>{date}</strong></div>
            <div className="inv-meta-row">Status: <strong>{inv.status}</strong></div>
          </div>
        </div>

        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Bill To (Customer)</div>
            <div className="inv-party-name">{inv.customer?.name || '—'}</div>
            <div className="inv-party-detail">
              {inv.customer?.billing_address || ''}{inv.customer?.billing_address ? <br /> : null}
              GST: <strong>{inv.customer?.gstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Reference</div>
            <div className="inv-party-detail">{inv.customer_order_id ? `Customer Order #${inv.customer_order_id}` : '—'}</div>
          </div>
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

        <div className="inv-sig">
          <div><div className="inv-sig-line"></div><div className="inv-sig-label">Authorized Signatory</div><div className="inv-sig-company mt-2">{co.name || 'Kirashi Business Synergies'}</div></div>
        </div>
        <div className="inv-footer">
          <div className="inv-footer-left">Generated by Maks Ops Platform</div>
          <div className="inv-footer-right">{inv.invoice_number} &nbsp;|&nbsp; {date}</div>
        </div>
      </div>
    </div>
  );
}
