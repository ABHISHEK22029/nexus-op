import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Plus, Trash2, X, ChevronDown, ChevronRight, Files } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STATUSES = ['Open', 'In Procurement', 'Delivered', 'Closed'];

export default function CustomerOrders() {
  const toast = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skus, setSkus] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [head, setHead] = useState({ customerId: '', customerPoRef: '', orderDate: '' });
  const [lines, setLines] = useState([{ skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }]);

  const load = async () => {
    const [o, c, s] = await Promise.all([
      fetch(`${API}/customer-orders`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/skus`).then(r => r.ok ? r.json() : []),
    ]);
    setOrders(Array.isArray(o) ? o : []); setCustomers(c); setSkus(s);
  };
  useEffect(() => { load(); }, []);

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const pickSku = (i, skuId) => {
    const sku = skus.find(s => String(s.id) === String(skuId));
    setLine(i, sku ? { skuId, description: sku.name, unit: sku.unit || 'nos', targetPrice: sku.price || '' } : { skuId: '' });
  };

  const create = async (e) => {
    e.preventDefault();
    if (!head.customerId) { toast.error('Pick a customer'); return; }
    const items = lines.filter(l => l.description.trim());
    if (!items.length) { toast.error('Add at least one line item'); return; }
    try {
      const res = await fetch(`${API}/customer-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...head, items }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Customer order ${d.orderNumber} created`);
      setShowForm(false); setHead({ customerId: '', customerPoRef: '', orderDate: '' });
      setLines([{ skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }]);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      const d = await fetch(`${API}/customer-orders/${id}`).then(r => r.json());
      setDetail(prev => ({ ...prev, [id]: d }));
    }
  };
  const setStatus = async (id, status) => {
    await fetch(`${API}/customer-orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };
  const del = async (id) => {
    if (!window.confirm('Delete this customer order?')) return;
    await fetch(`${API}/customer-orders/${id}`, { method: 'DELETE' }); load();
  };

  // One click: turn a customer-order line into a linked vendor quotation.
  const raiseQuotation = async (item) => {
    try {
      const res = await fetch(`${API}/quotations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partDescription: item.description, quantity: item.quantity, unit: item.unit, customerOrderItemId: item.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success(`Quotation raised for “${item.description}”`);
      navigate('/quotations');
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <ShoppingBag size={24} style={{ color: 'var(--brand-amber)' }} /> Customer Orders
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Log the PO your customer places with you, and drive procurement from it.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Order</button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Customer *</label>
              <select style={input} value={head.customerId} onChange={e => setHead({ ...head, customerId: e.target.value })}>
                <option value="">— Select customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {customers.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--accent-red)', marginTop: 3 }}>Add a customer first (Customers page).</div>}
            </div>
            <div><label style={lbl}>Customer PO Ref</label><input style={input} placeholder="TST/PO/889" value={head.customerPoRef} onChange={e => setHead({ ...head, customerPoRef: e.target.value })} /></div>
            <div><label style={lbl}>Order Date</label><input style={input} type="date" value={head.orderDate} onChange={e => setHead({ ...head, orderDate: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Line items (parts / SKUs)</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 1.2 }}><label style={lbl}>SKU (optional)</label>
                <select style={input} value={l.skuId} onChange={e => pickSku(i, e.target.value)}>
                  <option value="">— free text —</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 2 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder="Part / product" /></div>
              <div style={{ flex: 0.8 }}><label style={lbl}>Qty</label><input style={input} type="number" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Unit</label><input style={input} value={l.unit} onChange={e => setLine(i, { unit: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Target ₹</label><input style={input} type="number" value={l.targetPrice} onChange={e => setLine(i, { targetPrice: e.target.value })} /></div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 4 }}><Plus size={14} /> Add line</button>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm">Create Order</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {orders.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            <ShoppingBag size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No customer orders yet</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['', 'Order', 'Customer', 'PO Ref', 'Items', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <React.Fragment key={o.id}>
                  <tr style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)' }}>{expanded === o.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{o.order_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.customer_name || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{o.customer_po_ref || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{o.item_count}</td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <select value={o.status} onChange={e => setStatus(o.id, e.target.value)} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: '0.76rem', fontWeight: 700 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => del(o.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                  {expanded === o.id && detail[o.id] && (
                    <tr><td colSpan={7} style={{ padding: '0 14px 14px', background: 'var(--bg-elevated)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '10px 0 6px' }}>Line items</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {(detail[o.id].items || []).map(it => (
                            <tr key={it.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                              <td style={{ padding: '7px 4px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem' }}>{it.description}</td>
                              <td style={{ padding: '7px 4px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{it.quantity} {it.unit}</td>
                              <td style={{ padding: '7px 4px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{it.target_price ? `target ₹${Number(it.target_price).toLocaleString('en-IN')}` : ''}</td>
                              <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                                <button onClick={() => raiseQuotation(it)} className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <Files size={13} /> Raise Quotation
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Raise <b>Quotations</b> per line to source vendors, or bill the customer →</div>
                        <button onClick={() => navigate(`/customer-orders/${o.id}/invoice`)} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Files size={14} /> Create Invoice
                        </button>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
