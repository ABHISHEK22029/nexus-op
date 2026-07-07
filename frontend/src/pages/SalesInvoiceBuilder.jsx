import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ReceiptIndianRupee } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const rup = n => `₹${Number(r2(n)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function SalesInvoiceBuilder() {
  const { coId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ctx, setCtx] = useState(null);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ invoiceDate: '', discount: '', gstRate: 18, interstate: false, roundOff: '', notes: '' });

  useEffect(() => {
    fetch(`${API}/sales-invoices/prefill/${coId}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) { toast.error('Could not load the order'); return; }
      setCtx(d);
      setItems((d.items || []).map(it => ({ ...it, quantity: it.quantity ?? '', rate: it.rate ?? '' })));
      setF(prev => ({ ...prev, gstRate: d.gstRate ?? prev.gstRate, interstate: !!d.interstate }));
    });
  }, [coId]);

  const setItem = (i, patch) => setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems([...items, { description: '', hsn: '', uom: 'nos', quantity: '', rate: '' }]);

  const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(subTotal - (+f.discount || 0));
  const gstTotal = r2(taxable * (+f.gstRate || 0) / 100);
  const half = f.interstate ? 0 : r2(gstTotal / 2);
  const net = r2(taxable + gstTotal + (+f.roundOff || 0));

  const save = async () => {
    const valid = items.filter(it => it.description.trim());
    if (!valid.length) { toast.error('Add at least one line item'); return; }
    try {
      const res = await fetch(`${API}/sales-invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: ctx?.customerId, customerOrderId: Number(coId), invoiceDate: f.invoiceDate || null,
          items: valid, discount: +f.discount || 0, gstRate: +f.gstRate || 0, interstate: f.interstate,
          roundOff: +f.roundOff || 0, notes: f.notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Invoice ${d.invoiceNumber} created`);
      navigate(`/sales-invoices/${d.id}`);
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const input = { width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const th = { padding: '8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', textAlign: 'left' };

  if (!ctx) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading order…</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => navigate('/customer-orders')} className="inv-act-btn" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Back to Orders</button>

      <div style={{ ...card, marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <ReceiptIndianRupee size={22} style={{ color: 'var(--brand-amber)' }} /> New Sales Invoice
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>
          Order {ctx.customerOrder?.order_number} · Customer <b>{ctx.customer?.name || '—'}</b> — bill your customer for the delivered order. Everything below is editable.
        </p>
      </div>

      <div style={{ ...card, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div><label style={lbl}>Invoice Date</label><input style={input} type="date" value={f.invoiceDate} onChange={e => setF({ ...f, invoiceDate: e.target.value })} /></div>
        <div><label style={lbl}>GST Rate %</label><input style={input} type="number" value={f.gstRate} onChange={e => setF({ ...f, gstRate: e.target.value })} /></div>
        <div><label style={lbl}>GST Type</label>
          <select style={input} value={f.interstate ? 'igst' : 'cgstsgst'} onChange={e => setF({ ...f, interstate: e.target.value === 'igst' })}>
            <option value="cgstsgst">Intra-state (CGST+SGST)</option>
            <option value="igst">Inter-state (IGST)</option>
          </select>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Line Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, width: '40%' }}>Description</th><th style={th}>HSN</th><th style={th}>UOM</th><th style={th}>Qty</th><th style={th}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '5px 4px' }}><input style={input} value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="Item" /></td>
                <td style={{ padding: '5px 4px', width: 80 }}><input style={input} value={it.hsn || ''} onChange={e => setItem(i, { hsn: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 70 }}><input style={input} value={it.uom || ''} onChange={e => setItem(i, { uom: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 80 }}><input style={input} type="number" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 90 }}><input style={input} type="number" value={it.rate} onChange={e => setItem(i, { rate: e.target.value })} /></td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{rup((+it.quantity || 0) * (+it.rate || 0))}</td>
                <td style={{ padding: '5px 4px' }}><button onClick={() => setItems(items.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 10 }}><Plus size={14} /> Add line</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Adjustments</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Discount ₹ (−)</label><input style={input} type="number" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></div>
            <div><label style={lbl}>Round Off ₹</label><input style={input} type="number" value={f.roundOff} onChange={e => setF({ ...f, roundOff: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>Notes</label><input style={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Terms / remarks" /></div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Invoice Summary</div>
          {[
            ['Sub-total', subTotal], ['− Discount', -(+f.discount || 0)], ['Taxable value', taxable],
            ...(f.interstate ? [[`IGST @ ${f.gstRate}%`, gstTotal]] : [[`CGST @ ${r2((+f.gstRate) / 2)}%`, half], [`SGST @ ${r2((+f.gstRate) / 2)}%`, half]]),
            ['Round off', +f.roundOff || 0],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.84rem', color: k === 'Taxable value' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: k === 'Taxable value' ? 700 : 500, borderTop: k === 'Taxable value' ? '1px solid var(--border-subtle)' : 'none' }}>
              <span>{k}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(v)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', marginTop: 6, borderTop: '2px solid var(--border-default)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <span>Invoice Total</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(net)}</span>
          </div>
          <button onClick={save} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Create Invoice</button>
        </div>
      </div>
    </div>
  );
}
