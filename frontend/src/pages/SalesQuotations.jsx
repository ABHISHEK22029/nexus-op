import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, X, ChevronRight, ArrowRightLeft, Eye } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'];
const STATUS_COLOR = { Draft: '#64748b', Sent: '#2563eb', Accepted: '#10b981', Rejected: '#ef4444', Converted: '#8b5cf6' };
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function SalesQuotations() {
  const toast = useToast();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skus, setSkus] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [head, setHead] = useState({ customerId: '', quoteDate: '', validUntil: '', gstRate: '18', discount: '', terms: '' });
  const [lines, setLines] = useState([{ skuId: '', description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);

  const load = async () => {
    const [q, c, s] = await Promise.all([
      fetch(`${API}/sales-quotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/skus`).then(r => r.ok ? r.json() : []),
    ]);
    setQuotes(Array.isArray(q) ? q : []); setCustomers(c); setSkus(s);
  };
  useEffect(() => { load(); }, []);

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const pickSku = (i, skuId) => {
    const sku = skus.find(s => String(s.id) === String(skuId));
    setLine(i, sku ? { skuId, description: sku.name, uom: sku.unit || 'nos', rate: sku.price || '', hsn: sku.hsn || '' } : { skuId: '' });
  };

  // live preview of the total
  const sub = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const taxable = sub - (Number(head.discount) || 0);
  const gst = taxable * (Number(head.gstRate) || 0) / 100;
  const net = taxable + gst;

  const create = async (e) => {
    e.preventDefault();
    if (!head.customerId) { toast.error('Pick a customer'); return; }
    const items = lines.filter(l => l.description.trim());
    if (!items.length) { toast.error('Add at least one line item'); return; }
    try {
      const res = await fetch(`${API}/sales-quotations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...head, items }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Quotation ${d.quoteNumber} created`);
      setShowForm(false); setHead({ customerId: '', quoteDate: '', validUntil: '', gstRate: '18', discount: '', terms: '' });
      setLines([{ skuId: '', description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const convert = async (q) => {
    if (!window.confirm(`Convert ${q.quote_number} into a customer order?`)) return;
    try {
      const res = await fetch(`${API}/sales-quotations/${q.id}/convert`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Won! Created order ${d.orderNumber}`);
      navigate('/customer-orders');
    } catch (err) { toast.error(err.message); }
  };
  const setStatus = async (id, status) => {
    await fetch(`${API}/sales-quotations/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };
  const del = async (q) => {
    if (!window.confirm(`Delete ${q.quote_number}?`)) return;
    await fetch(`${API}/sales-quotations/${q.id}`, { method: 'DELETE' }); load();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <FileText size={24} style={{ color: 'var(--brand-amber)' }} /> Quotations
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Quote your customers up front — then convert a won quote straight into an order.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Quotation</button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Customer *</label>
              <select style={input} value={head.customerId} onChange={e => setHead({ ...head, customerId: e.target.value })}>
                <option value="">— Select —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Quote Date</label><input style={input} type="date" value={head.quoteDate} onChange={e => setHead({ ...head, quoteDate: e.target.value })} /></div>
            <div><label style={lbl}>Valid Until</label><input style={input} type="date" value={head.validUntil} onChange={e => setHead({ ...head, validUntil: e.target.value })} /></div>
            <div><label style={lbl}>GST %</label><input style={input} type="number" value={head.gstRate} onChange={e => setHead({ ...head, gstRate: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Line items</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 1.2 }}><label style={lbl}>SKU</label>
                <select style={input} value={l.skuId} onChange={e => pickSku(i, e.target.value)}>
                  <option value="">— free text —</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 2 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Qty</label><input style={input} type="number" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 0.6 }}><label style={lbl}>Unit</label><input style={input} value={l.uom} onChange={e => setLine(i, { uom: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Rate ₹</label><input style={input} type="number" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { skuId: '', description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 4 }}><Plus size={14} /> Add line</button>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={lbl}>Discount ₹</label>
              <input style={{ ...input, width: 160 }} type="number" value={head.discount} onChange={e => setHead({ ...head, discount: e.target.value })} placeholder="0" />
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>Sub-total: <b style={{ color: 'var(--text-primary)' }}>{rupee(sub)}</b></div>
              <div>GST ({head.gstRate || 0}%): <b style={{ color: 'var(--text-primary)' }}>{rupee(gst)}</b></div>
              <div style={{ fontSize: '1.05rem', marginTop: 2 }}>Net: <b style={{ color: 'var(--brand-amber)' }}>{rupee(net)}</b></div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>Terms / notes</label><input style={input} value={head.terms} onChange={e => setHead({ ...head, terms: e.target.value })} placeholder="Payment terms, validity, delivery…" /></div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm">Create Quotation</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {quotes.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No quotations yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Create one to quote a customer, then convert it to an order when you win.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['Quote', 'Customer', 'Valid until', 'Amount', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/sales-quotations/${q.id}`)}>{q.quote_number}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{q.customer_name || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{q.valid_until ? String(q.valid_until).slice(0, 10) : '—'}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{rupee(q.net_amount)}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {q.status === 'Converted'
                      ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLOR.Converted, background: STATUS_COLOR.Converted + '1f', padding: '3px 9px', borderRadius: 999 }}>Converted</span>
                      : <select value={q.status} onChange={e => setStatus(q.id, e.target.value)} style={{ ...input, width: 'auto', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[q.status] }}>
                          {STATUSES.filter(s => s !== 'Converted').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/sales-quotations/${q.id}`)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 4 }}><Eye size={15} /></button>
                    {q.status !== 'Converted' && (
                      <button onClick={() => convert(q)} title="Convert to order" className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 6, color: 'var(--brand-amber)' }}>
                        <ArrowRightLeft size={13} /> Convert
                      </button>
                    )}
                    {q.status === 'Converted' && q.converted_order_id && (
                      <button onClick={() => navigate('/customer-orders')} className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', marginRight: 6 }}>View order →</button>
                    )}
                    <button onClick={() => del(q)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
