import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ArrowRightLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

export default function SalesQuotationDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(false);

  const load = () => fetch(`${API}/sales-quotations/${id}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setQ).catch(() => setErr(true));
  useEffect(() => { load(); }, [id]);

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
  const taxable = (q.sub_total || 0) - (q.discount || 0);
  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const totRow = (l, v, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: bold ? '1rem' : '0.85rem', fontWeight: bold ? 800 : 500, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      <span>{l}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/sales-quotations')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Quotations</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.print()} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
          {q.status !== 'Converted'
            ? <button onClick={convert} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowRightLeft size={15} /> Convert to Order</button>
            : <button onClick={() => navigate('/customer-orders')} className="btn-secondary">View order →</button>}
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '2px solid var(--brand-amber)', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{co.name || 'Your Company'}</div>
            {co.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {co.gstin}</div>}
            {co.address && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 320 }}>{co.address}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-amber)', letterSpacing: '.02em' }}>QUOTATION</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>{q.quote_number}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Date: {fmt(q.quote_date)}</div>
            {q.valid_until && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Valid until: {fmt(q.valid_until)}</div>}
          </div>
        </div>

        {/* customer */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Quotation For</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cust.name || '—'}</div>
          {cust.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {cust.gstin}</div>}
          {cust.billing_address && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cust.billing_address}</div>}
        </div>

        {/* items */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Rate</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {(q.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{it.description}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.quantity} {it.uom}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{rupee(it.rate)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{rupee(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 300 }}>
            {totRow('Sub-total', rupee(q.sub_total))}
            {q.discount > 0 && totRow('Discount', '− ' + rupee(q.discount))}
            {q.interstate
              ? totRow(`IGST (${q.gst_rate}%)`, rupee(q.igst))
              : (<>{totRow(`CGST (${q.gst_rate / 2}%)`, rupee(q.cgst))}{totRow(`SGST (${q.gst_rate / 2}%)`, rupee(q.sgst))}</>)}
            {q.round_off ? totRow('Round-off', rupee(q.round_off)) : null}
            <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }}>{totRow('Total', rupee(q.net_amount), true)}</div>
          </div>
        </div>

        {q.amount_in_words && <div style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}><b>In words:</b> {q.amount_in_words}</div>}
        {q.terms && <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)' }}><b style={{ color: 'var(--text-secondary)' }}>Terms:</b> {q.terms}</div>}
        <div style={{ marginTop: 20, fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>This is a quotation, not a tax invoice. Prices valid until the date shown.</div>
      </div>
    </div>
  );
}
