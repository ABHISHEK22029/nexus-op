/* ══════════════════════════════════════════════════════════
   Sales Invoices — searchable, filterable, paginated.

   Note the totals come from `q.summary`, not from summing the rows on
   screen. The previous version summed `rows`, which was correct only while
   every row was on screen; the moment pagination arrived, "Total Billed"
   would have quietly meant "total billed on page 1" — a number that looks
   authoritative, changes when you click Next, and is wrong in the direction
   that flatters.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ReceiptIndianRupee, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

import { getToken } from '../lib/apiAuth';
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const statusColor = (s) => s === 'Paid' ? '#10b981' : s === 'Partially Paid' ? 'var(--brand-amber)' : s === 'Sent' ? '#3b82f6' : 'var(--text-muted)';

export default function SalesInvoices() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const q = useListQuery('sales-invoices', { pageSize: 25 });

  const del = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this invoice?')) return;
    const token = getToken();
    const res = await fetch(`${API}/sales-invoices/${id}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not delete');
    }
    toast.success('Deleted');
    q.reload();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const s = q.summary || {};
  const canDelete = can('sales-invoices', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <ReceiptIndianRupee size={24} style={{ color: 'var(--brand-amber)' }} /> Sales Invoices
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Tax invoices to your customers — raise one from a customer order, then record payments.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Invoices (filtered)' : 'Invoices'} value={s.count ?? q.total} />
        <Kpi card={card} label="Total Billed" value={rup(s.billed)} />
        <Kpi card={card} label="Received" value={rup(s.received)} tone="#10b981" />
        <Kpi card={card} label="Outstanding" value={rup(s.outstanding)} tone={Number(s.outstanding) > 0 ? '#ef4444' : '#10b981'} />
      </div>

      <ListToolbar
        q={q}
        placeholder="Search invoice no., customer, place of supply…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: [
            { value: 'Draft', label: 'Draft' },
            { value: 'Sent', label: 'Sent' },
            { value: 'Partially Paid', label: 'Part paid' },
            { value: 'Paid', label: 'Paid' },
          ],
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={ReceiptIndianRupee} noun="invoices"
            hint="Open a Customer Order → “Create Invoice”." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['Invoice', 'Customer', 'Total', 'Received', 'Balance', 'Status', ''].map(h =>
                  <th key={h} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {q.rows.map(r => {
                  const due = Math.max(0, (r.net_amount || 0) - (r.amount_paid || 0));
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                        onClick={() => navigate(`/sales-invoices/${r.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.invoice_number}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.customer_name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{rup(r.net_amount)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{rup(r.amount_paid)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: due > 0 ? '#ef4444' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{rup(due)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'var(--bg-elevated)', color: statusColor(r.status) }}>{r.status}</span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {/* Hidden when the API would refuse it anyway. */}
                        {canDelete && (
                          <button onClick={e => del(e, r.id)} title="Delete"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
}

const Kpi = ({ card, label, value, tone }) => (
  <div style={{ ...card, padding: 18 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);
