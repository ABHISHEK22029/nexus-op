/* ══════════════════════════════════════════════════════════
   Which order are we invoicing?

   The invoice builder has existed all along at
   /customer-orders/:coId/invoice, reachable only from an order. So a person
   who opened Invoices — the obvious place to go when you want to raise one —
   found a list, four status filters and no way forward.

   The same shape as the challan screen, which already offers "prefill from
   a customer order". This is that, as a step in front of the builder.

   Orders that have already been invoiced are shown rather than hidden, and
   marked. A part-invoiced order is a normal thing to invoice again, and an
   order missing from a list with no explanation reads as a bug.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useState, useMemo } from 'react';
import { X, Search, FileText, ArrowRight } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function PickOrderModal({ onClose, onPick }) {
  const [orders, setOrders] = useState(null);
  const [invoiced, setInvoiced] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    const t = getToken();
    const h = t ? { Authorization: `Bearer ${t}` } : {};
    const get = (u) => fetch(`${API}${u}`, { headers: h })
      .then(r => (r.ok ? r.json() : []))
      .then(d => (Array.isArray(d) ? d : d.items || []))
      .catch(() => []);
    Promise.all([get('/customer-orders?limit=200'), get('/sales-invoices?limit=200')])
      .then(([o, inv]) => {
        setOrders(o);
        setInvoiced(new Set(inv.map(i => i.customer_order_id).filter(Boolean)));
      });
  }, []);

  const shown = useMemo(() => {
    if (!orders) return [];
    const s = search.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter(o =>
      String(o.order_number || '').toLowerCase().includes(s) ||
      String(o.customer_name || '').toLowerCase().includes(s));
  }, [orders, search]);

  const row = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '11px 12px', borderRadius: 9, cursor: 'pointer',
    background: 'none', border: '1px solid transparent', textAlign: 'left',
  };

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '84vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.3))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <FileText size={17} style={{ color: 'var(--brand-amber)' }} /> Raise an invoice
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Choose the customer order it is for. The lines and amounts come across with it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '12px 18px 0' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search order number or customer…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '10px 12px 16px', overflowY: 'auto', flex: 1 }}>
          {orders === null ? (
            <p style={{ padding: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading orders…</p>
          ) : shown.length === 0 ? (
            <p style={{ padding: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {orders.length === 0
                ? 'No customer orders yet. An invoice is raised against one.'
                : `Nothing matches “${search}”.`}
            </p>
          ) : shown.map(o => (
            <button
              key={o.id} type="button" style={row}
              onClick={() => onPick(o.id)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ minWidth: 92, fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                {o.order_number || `#${o.id}`}
              </span>
              <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {o.customer_name || '—'}
                <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {o.status}
                  {invoiced.has(o.id) && ' · already invoiced'}
                </span>
              </span>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {rup(o.net_amount ?? o.total)}
              </span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
