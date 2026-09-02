/* ══════════════════════════════════════════════════════════
   Delivery Challans — searchable, filterable, paginated.

   Totals come from `q.summary`, not from summing the rows on screen: after
   pagination the rows are one page, so "Value dispatched" summed locally
   would silently mean "value on page 1".

   The card that earns its place is E-way bill missing. Under GST Rule 138 a
   consignment over ₹50,000 cannot legally move without an e-way bill, and
   the number has to travel with the goods — those are the trucks that get
   stopped. The count is computed server-side over the whole filtered set.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Trash2, X, Eye } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

import { getToken } from '../lib/apiAuth';
import { today } from '../lib/dates';
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STATUSES = ['Draft', 'Dispatched', 'Delivered'];
const STATUS_COLOR = { Draft: '#64748b', Dispatched: '#2563eb', Delivered: '#10b981' };
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function DeliveryChallans() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useListQuery('delivery-challans', { pageSize: 25 });
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [head, setHead] = useState({ customerId: '', customerOrderId: '', challanDate: today(), dispatchThrough: '', vehicleNo: '', lrNo: '', placeOfSupply: '' });
  const [lines, setLines] = useState([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);

  // Only the pick-lists for the form load here; the list itself is q's job.
  useEffect(() => {
    (async () => {
      const [c, o] = await Promise.all([
        fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/customer-orders`).then(r => r.ok ? r.json() : []),
      ]);
      setCustomers(Array.isArray(c) ? c : []); setOrders(Array.isArray(o) ? o : []);
    })();
  }, []);

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const prefillFromOrder = async (orderId) => {
    setHead(h => ({ ...h, customerOrderId: orderId }));
    if (!orderId) return;
    try {
      const d = await fetch(`${API}/delivery-challans/prefill/${orderId}`).then(r => r.json());
      setHead(h => ({ ...h, customerOrderId: orderId, customerId: d.customerId || '', placeOfSupply: d.placeOfSupply || '' }));
      if (d.items?.length) setLines(d.items.map(it => ({ description: it.description, hsn: it.hsn || '', quantity: it.quantity, uom: it.uom || 'nos', rate: it.rate || '' })));
    } catch { /* ignore */ }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!head.customerId) { toast.error('Pick a customer'); return; }
    const items = lines.filter(l => l.description.trim());
    if (!items.length) { toast.error('Add at least one item'); return; }
    const token = getToken();
    const res = await fetch(`${API}/delivery-challans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...head, items }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.detail || d.error || 'Could not create the challan');
    toast.success(`Challan ${d.challanNumber} created`);
    setShowForm(false); setHead({ customerId: '', customerOrderId: '', challanDate: today(), dispatchThrough: '', vehicleNo: '', lrNo: '', placeOfSupply: '' });
    setLines([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);
    q.reload();
  };

  const setStatus = async (id, status) => {
    const token = getToken();
    const res = await fetch(`${API}/delivery-challans/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not update the status');
    }
    q.reload();
  };

  const del = async (dc) => {
    if (!window.confirm(`Delete ${dc.challan_number}?`)) return;
    const token = getToken();
    const res = await fetch(`${API}/delivery-challans/${dc.id}`, {
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
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const s = q.summary || {};
  const canDelete = can('delivery-challans', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <Truck size={24} style={{ color: 'var(--brand-amber)' }} /> Delivery Challans
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>The goods-out note to your customer — dispatch details and the value carried for the e-way bill.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Challan</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Challans (filtered)' : 'Challans'} value={s.count ?? q.total} />
        <Kpi card={card} label="Value dispatched" value={rupee(s.value)} />
        <Kpi card={card} label="In transit" value={s.in_transit ?? 0} tone="#2563eb" />
        {/* Rule 138: over ₹50,000 the goods may not move without an e-way
            bill, and the number travels with them. Non-zero here means a
            truck that can be stopped. */}
        <Kpi card={card} label="E-way bill missing" value={s.eway_missing ?? 0}
          tone={Number(s.eway_missing) > 0 ? '#ef4444' : '#10b981'}
          note={Number(s.eway_missing) > 0 ? 'Consignments over ₹50,000 with no e-way bill' : 'All consignments over ₹50,000 covered'} />
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Prefill from order</label>
              <select style={input} value={head.customerOrderId} onChange={e => prefillFromOrder(e.target.value)}>
                <option value="">— none —</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Customer *</label>
              <select style={input} value={head.customerId} onChange={e => setHead({ ...head, customerId: e.target.value })}>
                <option value="">— Select —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Challan Date</label><input style={input} type="date" value={head.challanDate} onChange={e => setHead({ ...head, challanDate: e.target.value })} /></div>
            <div><label style={lbl}>Dispatch through</label><input style={input} value={head.dispatchThrough} onChange={e => setHead({ ...head, dispatchThrough: e.target.value })} placeholder="Transporter" /></div>
            <div><label style={lbl}>Vehicle No.</label><input style={input} value={head.vehicleNo} onChange={e => setHead({ ...head, vehicleNo: e.target.value })} placeholder="GJ06AB1234" /></div>
            <div><label style={lbl}>LR / Docket No.</label><input style={input} value={head.lrNo} onChange={e => setHead({ ...head, lrNo: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Items dispatched</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 2.5 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>HSN</label><input style={input} value={l.hsn} onChange={e => setLine(i, { hsn: e.target.value })} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Qty</label><input style={input} type="number" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 0.6 }}><label style={lbl}>Unit</label><input style={input} value={l.uom} onChange={e => setLine(i, { uom: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Value ₹</label><input style={input} type="number" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 4 }}><Plus size={14} /> Add line</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm">Create Challan</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <ListToolbar
        q={q}
        placeholder="Search challan no., customer, vehicle, transporter…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: STATUSES.map(st => ({ value: st, label: st })),
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={Truck} noun="challans"
            hint="Create one when you dispatch goods — prefill it from a customer order." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                  {['Challan', 'Customer', 'Vehicle', 'Value', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {q.rows.map(dc => (
                  <tr key={dc.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/delivery-challans/${dc.id}`)}>{dc.challan_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{dc.customer_name || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>{dc.vehicle_no || '—'}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{rupee(dc.total_value)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <select value={dc.status} onChange={e => setStatus(dc.id, e.target.value)} style={{ ...input, width: 'auto', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[dc.status] }}>
                        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => navigate(`/delivery-challans/${dc.id}`)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 6 }}><Eye size={15} /></button>
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (
                        <button onClick={() => del(dc)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
}

const Kpi = ({ card, label, value, tone, note }) => (
  <div style={{ ...card, padding: 18 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {note && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{note}</div>}
  </div>
);
