import React, { useState, useEffect } from 'react';
import { BarChart3, Download, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]).filter(k => k !== 'data'); // never dump blobs
  const esc = v => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
}

export default function Reports() {
  const { activeProject } = useProject();
  const toast = useToast();
  const [d, setD] = useState({ sales: [], bills: [], expenses: [], quotations: [], orders: [] });

  const load = async () => {
    const g = (p) => fetch(`${API}${p}`).then(r => r.ok ? r.json() : []).catch(() => []);
    const [sales, bills, expenses, quotations, orders] = await Promise.all([
      g('/sales-invoices'), g('/grn-bills'), g('/expenses'), g('/quotations'), g('/customer-orders'),
    ]);
    setD({ sales, bills, expenses, quotations, orders });
  };
  useEffect(() => { load(); }, []);

  const totalSales = d.sales.reduce((s, r) => s + (r.net_amount || 0), 0);
  const receivable = d.sales.reduce((s, r) => s + Math.max(0, (r.net_amount || 0) - (r.amount_paid || 0)), 0);
  const totalPurch = d.bills.reduce((s, r) => s + (r.net_amount || 0), 0);
  const totalExp = d.expenses.reduce((s, r) => s + (r.amount || 0), 0);
  const opMargin = totalSales - totalPurch - totalExp;

  const download = async (name, fetchPath, transform) => {
    try {
      const rows = await fetch(`${API}${fetchPath}`).then(r => r.ok ? r.json() : []);
      if (!rows.length) { toast.error('Nothing to export yet'); return; }
      const csv = toCSV(transform ? rows.map(transform) : rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Exported ${rows.length} rows`);
    } catch { toast.error('Export failed'); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const Tile = ({ icon: Icon, label, value, color }) => (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{Icon && <Icon size={13} />} {label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );

  const registers = [
    { name: 'sales-invoices', label: 'Sales Invoices', path: '/sales-invoices', count: d.sales.length },
    { name: 'purchase-bills', label: 'Purchase (GRN) Bills', path: '/grn-bills', count: d.bills.length },
    { name: 'expenses', label: 'Expenses', path: '/expenses', count: d.expenses.length },
    { name: 'quotations', label: 'Quotations', path: '/quotations', count: d.quotations.length, transform: q => ({ id: q.id, part: q.part_description, quantity: q.quantity, unit: q.unit, status: q.status, quotes: q.lines?.length }) },
    { name: 'customer-orders', label: 'Customer Orders', path: '/customer-orders', count: d.orders.length },
    { name: 'customers', label: 'Customers', path: '/customers' },
    { name: 'vendors', label: 'Vendors', path: '/vendors' },
    { name: 'raw-materials', label: 'Raw Materials', path: '/raw-materials' },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <BarChart3 size={24} style={{ color: 'var(--brand-amber)' }} /> Reports &amp; Export
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>A live snapshot of the business, and one-click CSV/Excel export of every register.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <Tile icon={TrendingUp} label="Total Sales Invoiced" value={rup(totalSales)} />
        <Tile icon={Receipt} label="Receivables Outstanding" value={rup(receivable)} color={receivable > 0 ? '#ef4444' : '#10b981'} />
        <Tile icon={TrendingDown} label="Purchase Bills" value={rup(totalPurch)} />
        <Tile icon={Wallet} label="Expenses" value={rup(totalExp)} />
      </div>
      <div style={{ ...card, marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)' }}>Operational Margin <span style={{ fontWeight: 500, textTransform: 'none' }}>(sales − purchases − expenses)</span></span>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: opMargin >= 0 ? '#10b981' : '#ef4444' }}>{rup(opMargin)}</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700, color: 'var(--text-primary)' }}>Export registers</div>
        {registers.map(reg => (
          <div key={reg.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{reg.label}</div>
              {reg.count != null && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{reg.count} records</div>}
            </div>
            <button onClick={() => download(reg.name, reg.path, reg.transform)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              <Download size={14} /> Download CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
