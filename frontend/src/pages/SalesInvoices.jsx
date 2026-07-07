import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReceiptIndianRupee, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const statusColor = (s) => s === 'Paid' ? '#10b981' : s === 'Partially Paid' ? 'var(--brand-amber)' : s === 'Sent' ? '#3b82f6' : 'var(--text-muted)';

export default function SalesInvoices() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);

  const load = async () => {
    try { const r = await fetch(`${API}/sales-invoices`); setRows(r.ok ? await r.json() : []); } catch { setRows([]); }
  };
  useEffect(() => { load(); }, []);

  const del = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this invoice?')) return;
    await fetch(`${API}/sales-invoices/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const totalDue = rows.reduce((s, r) => s + Math.max(0, (r.net_amount || 0) - (r.amount_paid || 0)), 0);
  const totalBilled = rows.reduce((s, r) => s + (r.net_amount || 0), 0);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <ReceiptIndianRupee size={24} style={{ color: 'var(--brand-amber)' }} /> Sales Invoices
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Tax invoices to your customers — raise one from a customer order, then record payments.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ ...card, padding: 18 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Invoices</div><div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{rows.length}</div></div>
        <div style={{ ...card, padding: 18 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Billed</div><div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{rup(totalBilled)}</div></div>
        <div style={{ ...card, padding: 18 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontSize: '1.8rem', fontWeight: 800, color: totalDue > 0 ? '#ef4444' : '#10b981', marginTop: 4 }}>{rup(totalDue)}</div></div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            <ReceiptIndianRupee size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No sales invoices yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Open a Customer Order → “Create Invoice”.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
              {['Invoice', 'Customer', 'Total', 'Received', 'Balance', 'Status', ''].map(h => <th key={h} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const due = Math.max(0, (r.net_amount || 0) - (r.amount_paid || 0));
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => navigate(`/sales-invoices/${r.id}`)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.invoice_number}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.customer_name || '—'}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{rup(r.net_amount)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#10b981' }}>{rup(r.amount_paid)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: due > 0 ? '#ef4444' : 'var(--text-muted)' }}>{rup(due)}</td>
                    <td style={{ padding: '12px 14px' }}><span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'var(--bg-elevated)', color: statusColor(r.status) }}>{r.status}</span></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}><button onClick={e => del(e, r.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
