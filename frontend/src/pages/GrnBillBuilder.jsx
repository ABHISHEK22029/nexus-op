import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ReceiptText } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const rup = n => `₹${Number(r2(n)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function GrnBillBuilder() {
  const { grnId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ctx, setCtx] = useState(null);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ billDate: '', vendorBillRef: '', freight: '', otherCharges: '', discount: '', gstRate: 18, interstate: false, roundOff: '', notes: '' });

  useEffect(() => {
    fetch(`${API}/grn-bills/prefill/${grnId}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) { toast.error('Could not load GRN'); return; }
      setCtx(d);
      setItems((d.items || []).map(it => ({ ...it, quantity: it.quantity ?? '', rate: it.rate ?? '' })));
    });
  }, [grnId]);

  const setItem = (i, patch) => setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems([...items, { description: '', hsn: '', uom: 'nos', quantity: '', rate: '' }]);
  const rmItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  // Live totals (mirrors backend)
  const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(subTotal + (+f.freight || 0) + (+f.otherCharges || 0) - (+f.discount || 0));
  const gstTotal = r2(taxable * (+f.gstRate || 0) / 100);
  const cgst = f.interstate ? 0 : r2(gstTotal / 2);
  const igst = f.interstate ? gstTotal : 0;
  const net = r2(taxable + gstTotal + (+f.roundOff || 0));

  const save = async () => {
    const valid = items.filter(it => it.description.trim());
    if (!valid.length) { toast.error('Add at least one line item'); return; }
    try {
      const res = await fetch(`${API}/grn-bills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: Number(grnId), poId: ctx?.po?.id, vendorId: ctx?.vendor?.id, projectId: ctx?.projectId,
          billDate: f.billDate || null, vendorBillRef: f.vendorBillRef, items: valid,
          freight: +f.freight || 0, otherCharges: +f.otherCharges || 0, discount: +f.discount || 0,
          gstRate: +f.gstRate || 0, interstate: f.interstate, roundOff: +f.roundOff || 0, notes: f.notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Bill ${d.billNumber} created`);
      navigate(`/grn-bills/${d.id}`);
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const input = { width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const th = { padding: '8px 8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', textAlign: 'left' };

  if (!ctx) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading GRN…</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => navigate('/grn')} className="inv-act-btn" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Back to GRN</button>

      <div style={{ ...card, marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <ReceiptText size={22} style={{ color: 'var(--brand-amber)' }} /> New GRN Bill
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>
          From GRN #{ctx.grn?.id} · PO {ctx.po?.poNumber || ctx.po?.id} · Vendor <b>{ctx.vendor?.name || '—'}</b> — everything below is editable.
        </p>
      </div>

      {/* Header fields */}
      <div style={{ ...card, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div><label style={lbl}>Bill Date</label><input style={input} type="date" value={f.billDate} onChange={e => setF({ ...f, billDate: e.target.value })} /></div>
        <div><label style={lbl}>Vendor Bill Ref</label><input style={input} value={f.vendorBillRef} onChange={e => setF({ ...f, vendorBillRef: e.target.value })} placeholder="INV-2026-..." /></div>
        <div><label style={lbl}>GST Rate %</label><input style={input} type="number" value={f.gstRate} onChange={e => setF({ ...f, gstRate: e.target.value })} /></div>
        <div><label style={lbl}>GST Type</label>
          <select style={input} value={f.interstate ? 'igst' : 'cgstsgst'} onChange={e => setF({ ...f, interstate: e.target.value === 'igst' })}>
            <option value="cgstsgst">Intra-state (CGST+SGST)</option>
            <option value="igst">Inter-state (IGST)</option>
          </select>
        </div>
      </div>

      {/* Line items */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Line Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, width: '38%' }}>Description</th><th style={th}>HSN</th><th style={th}>UOM</th><th style={th}>Qty</th><th style={th}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '5px 4px' }}><input style={input} value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="Item" /></td>
                <td style={{ padding: '5px 4px', width: 80 }}><input style={input} value={it.hsn || ''} onChange={e => setItem(i, { hsn: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 70 }}><input style={input} value={it.uom || ''} onChange={e => setItem(i, { uom: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 80 }}><input style={input} type="number" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} /></td>
                <td style={{ padding: '5px 4px', width: 90 }}><input style={input} type="number" value={it.rate} onChange={e => setItem(i, { rate: e.target.value })} /></td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{rup((+it.quantity || 0) * (+it.rate || 0))}</td>
                <td style={{ padding: '5px 4px' }}><button onClick={() => rmItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 10 }}><Plus size={14} /> Add line</button>
      </div>

      {/* Charges + totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Charges & Adjustments</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Freight ₹</label><input style={input} type="number" value={f.freight} onChange={e => setF({ ...f, freight: e.target.value })} /></div>
            <div><label style={lbl}>Other Charges ₹</label><input style={input} type="number" value={f.otherCharges} onChange={e => setF({ ...f, otherCharges: e.target.value })} /></div>
            <div><label style={lbl}>Discount ₹ (−)</label><input style={input} type="number" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></div>
            <div><label style={lbl}>Round Off ₹</label><input style={input} type="number" value={f.roundOff} onChange={e => setF({ ...f, roundOff: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>Notes</label><input style={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Terms / remarks" /></div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Bill Summary</div>
          {[
            ['Sub-total', subTotal], ['+ Freight', +f.freight || 0], ['+ Other charges', +f.otherCharges || 0], ['− Discount', -(+f.discount || 0)],
            ['Taxable value', taxable],
            ...(f.interstate ? [[`IGST @ ${f.gstRate}%`, igst]] : [[`CGST @ ${r2((+f.gstRate) / 2)}%`, cgst], [`SGST @ ${r2((+f.gstRate) / 2)}%`, cgst]]),
            ['Round off', +f.roundOff || 0],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.84rem', color: k === 'Taxable value' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: k === 'Taxable value' ? 700 : 500, borderTop: k === 'Taxable value' ? '1px solid var(--border-subtle)' : 'none' }}>
              <span>{k}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(v)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', marginTop: 6, borderTop: '2px solid var(--border-default)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <span>Net Payable</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(net)}</span>
          </div>
          <button onClick={save} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Create Bill</button>
        </div>
      </div>
    </div>
  );
}
