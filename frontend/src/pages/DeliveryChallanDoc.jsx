import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

export default function DeliveryChallanDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dc, setDc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { fetch(`${API}/delivery-challans/${id}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setDc).catch(() => setErr(true)); }, [id]);

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Challan not found. <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!dc) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = dc.company || {}; const cust = dc.customer || {};
  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const metaBox = { border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Challans</button>
        <button onClick={() => window.print()} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '2px solid var(--brand-amber)', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{co.name || 'Your Company'}</div>
            {co.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {co.gstin}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-amber)' }}>DELIVERY CHALLAN</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>{dc.challan_number}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Date: {fmt(dc.challan_date)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Deliver To</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cust.name || '—'}</div>
            {cust.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {cust.gstin}</div>}
            {cust.billing_address && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cust.billing_address}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
            <div style={metaBox}><div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Dispatch through</div><div style={{ fontWeight: 600 }}>{dc.dispatch_through || '—'}</div></div>
            <div style={metaBox}><div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Vehicle No.</div><div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{dc.vehicle_no || '—'}</div></div>
            <div style={metaBox}><div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>LR / Docket</div><div style={{ fontWeight: 600 }}>{dc.lr_no || '—'}</div></div>
            <div style={metaBox}><div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Place of supply</div><div style={{ fontWeight: 600 }}>{dc.place_of_supply || '—'}</div></div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Value</th>
            </tr></thead>
            <tbody>
              {(dc.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{it.description}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.quantity} {it.uom}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{rupee(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 340 }}>Goods described above dispatched. Not a tax invoice — for transport/delivery purposes. The tax invoice is raised separately.</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total value of goods</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{rupee(dc.total_value)}</div>
          </div>
        </div>
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <div>Receiver's signature</div><div>For {co.name || 'Your Company'}</div>
        </div>
      </div>
    </div>
  );
}
