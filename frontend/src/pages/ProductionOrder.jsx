import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Plus, PackageMinus, PackagePlus, Recycle, Scale } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const yieldColor = (p) => (p == null ? 'var(--text-muted)' : p >= 85 ? '#10b981' : p >= 70 ? '#f59e0b' : '#ef4444');
const rupee = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

export default function ProductionOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [cons, setCons] = useState({ itemName: '', consumedQty: '', uom: 'kg', unitCost: '' });
  const [out, setOut] = useState({ itemName: '', outputQty: '', uom: 'nos', outputWeight: '' });
  const [scrap, setScrap] = useState({ scrapType: 'sellable', scrapQty: '', uom: 'kg', saleValue: '', isSold: false });

  const load = async () => {
    try {
      const r = await fetch(`${API}/production/${id}`);
      if (r.ok) setOrder(await r.json());
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, [id]);

  const post = async (path, body, okMsg) => {
    try {
      const r = await fetch(`${API}/production/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(okMsg);
      load();
      return true;
    } catch (e) { toast.error(e.message); return false; }
  };

  const delLine = async (kind, lineId) => {
    try {
      const r = await fetch(`${API}/production/${kind}/line/${lineId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to delete');
      toast.success('Removed'); load();
    } catch (e) { toast.error(e.message); }
  };

  const setStatus = async (status) => {
    await fetch(`${API}/production/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };

  if (!order) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading production order…</div>;
  const y = order.yield || {};

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };
  const label = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const secHead = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 };

  const Metric = ({ label: l, value, color, sub }) => (
    <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{l}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const lineRow = (kind, cols, lineId) => (
    <tr key={kind + lineId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
      {cols.map((c, i) => <td key={i} style={{ padding: '8px 10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c}</td>)}
      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
        <button onClick={() => delLine(kind, lineId)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><Trash2 size={14} /></button>
      </td>
    </tr>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate('/production')} className="inv-act-btn" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> All Production Orders</button>

      {/* Header */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-amber)' }}>{order.prod_number}</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0' }}>{order.product_name}</h1>
          {order.planned_qty && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Planned: {order.planned_qty} {order.output_uom}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Planned', 'In Progress', 'Completed'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{ padding: '7px 13px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (order.status === s ? 'var(--brand-amber)' : 'var(--border-default)'), background: order.status === s ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-elevated)', color: order.status === s ? 'var(--brand-amber)' : 'var(--text-muted)' }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Yield panel */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={secHead}><Scale size={17} style={{ color: 'var(--brand-amber)' }} /> Yield & Material Balance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Metric l="Yield" value={y.yieldPct != null ? `${y.yieldPct}%` : '—'} color={yieldColor(y.yieldPct)} sub="finished ÷ input" />
          <Metric l="Recovered" value={y.recoveredPct != null ? `${y.recoveredPct}%` : '—'} color={yieldColor(y.recoveredPct)} sub="incl. reusable remnant" />
          <Metric l="Scrap" value={y.scrapPct != null ? `${y.scrapPct}%` : '—'} sub={`${rupee(y.scrapRecovery)} recovered`} />
          <Metric l="Unaccounted Loss" value={y.unaccountedLoss != null ? `${y.unaccountedLoss} kg` : '—'} color={y.balanced ? 'var(--text-primary)' : '#ef4444'} sub={y.balanced ? 'balanced ✓' : 'check entries'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
          <Metric l="Input" value={y.inputWeight ? `${y.inputWeight} kg` : '—'} />
          <Metric l="Output" value={y.outputWeight ? `${y.outputWeight} kg` : '—'} sub={y.outputQty ? `${y.outputQty} pcs` : ''} />
          <Metric l="Net Material Cost" value={rupee(y.netMaterialCost)} sub={`gross ${rupee(y.materialCost)}`} />
          <Metric l="Cost / Unit" value={rupee(y.costPerUnit)} color="var(--brand-amber)" />
        </div>
      </div>

      {/* Three entry sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Consumption */}
        <div style={card}>
          <div style={secHead}><PackageMinus size={17} style={{ color: '#ef4444' }} /> Raw Material Consumed</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: 2, minWidth: 120 }}><label style={label}>Material *</label><input style={input} placeholder="MS Steel" value={cons.itemName} onChange={e => setCons({ ...cons, itemName: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 70 }}><label style={label}>Qty (kg) *</label><input style={input} type="number" placeholder="100" value={cons.consumedQty} onChange={e => setCons({ ...cons, consumedQty: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 70 }}><label style={label}>₹/kg</label><input style={input} type="number" placeholder="60" value={cons.unitCost} onChange={e => setCons({ ...cons, unitCost: e.target.value })} /></div>
            <button className="btn-primary btn-sm" style={{ padding: '9px 12px' }} onClick={async () => { if (!cons.itemName || cons.consumedQty === '') return toast.error('Material + qty required'); if (await post('consumption', { ...cons, uom: 'kg' }, 'Consumption added')) setCons({ itemName: '', consumedQty: '', uom: 'kg', unitCost: '' }); }}><Plus size={15} /></button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{(order.consumption || []).map(r => lineRow('consumption', [r.item_name, `${r.consumed_qty} ${r.uom}`, r.unit_cost ? `₹${r.unit_cost}/${r.uom}` : '—'], r.id))}</tbody>
          </table>
          {(!order.consumption || !order.consumption.length) && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 2px' }}>No material issued yet.</div>}
        </div>

        {/* Output */}
        <div style={card}>
          <div style={secHead}><PackagePlus size={17} style={{ color: '#10b981' }} /> Finished Output</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: 2, minWidth: 120 }}><label style={label}>Product *</label><input style={input} placeholder="V-type Bracket" value={out.itemName} onChange={e => setOut({ ...out, itemName: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 60 }}><label style={label}>Pcs</label><input style={input} type="number" placeholder="40" value={out.outputQty} onChange={e => setOut({ ...out, outputQty: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 70 }}><label style={label}>Weight (kg)</label><input style={input} type="number" placeholder="80" value={out.outputWeight} onChange={e => setOut({ ...out, outputWeight: e.target.value })} /></div>
            <button className="btn-primary btn-sm" style={{ padding: '9px 12px' }} onClick={async () => { if (!out.itemName) return toast.error('Product required'); if (await post('output', out, 'Output added')) setOut({ itemName: '', outputQty: '', uom: 'nos', outputWeight: '' }); }}><Plus size={15} /></button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{(order.output || []).map(r => lineRow('output', [r.item_name, r.output_qty ? `${r.output_qty} pcs` : '—', r.output_weight ? `${r.output_weight} kg` : '—'], r.id))}</tbody>
          </table>
          {(!order.output || !order.output.length) && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 2px' }}>No output recorded yet.</div>}
        </div>

        {/* Scrap */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={secHead}><Recycle size={17} style={{ color: '#f59e0b' }} /> Scrap & Remnant</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 130 }}><label style={label}>Type</label>
              <select style={input} value={scrap.scrapType} onChange={e => setScrap({ ...scrap, scrapType: e.target.value })}>
                <option value="sellable">Sellable scrap</option>
                <option value="remnant">Reusable remnant</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 80 }}><label style={label}>Qty (kg) *</label><input style={input} type="number" placeholder="18" value={scrap.scrapQty} onChange={e => setScrap({ ...scrap, scrapQty: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 90 }}><label style={label}>Sale value ₹</label><input style={input} type="number" placeholder="400" value={scrap.saleValue} onChange={e => setScrap({ ...scrap, saleValue: e.target.value })} disabled={scrap.scrapType === 'remnant'} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', paddingBottom: 9 }}>
              <input type="checkbox" checked={scrap.isSold} onChange={e => setScrap({ ...scrap, isSold: e.target.checked })} disabled={scrap.scrapType === 'remnant'} /> Sold
            </label>
            <button className="btn-primary btn-sm" style={{ padding: '9px 12px' }} onClick={async () => { if (scrap.scrapQty === '') return toast.error('Qty required'); if (await post('scrap', scrap, 'Scrap recorded')) setScrap({ scrapType: 'sellable', scrapQty: '', uom: 'kg', saleValue: '', isSold: false }); }}><Plus size={15} /></button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{(order.scrap || []).map(r => lineRow('scrap', [
              <span style={{ fontWeight: 600, color: r.scrap_type === 'remnant' ? '#3b82f6' : '#f59e0b' }}>{r.scrap_type === 'remnant' ? 'Remnant (reusable)' : 'Sellable scrap'}</span>,
              `${r.scrap_qty} ${r.uom}`,
              r.sale_value ? `${rupee(r.sale_value)}${r.is_sold ? ' · sold' : ' · unsold'}` : '—',
            ], r.id))}</tbody>
          </table>
          {(!order.scrap || !order.scrap.length) && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 2px' }}>No scrap or remnant recorded yet.</div>}
        </div>
      </div>
    </div>
  );
}
