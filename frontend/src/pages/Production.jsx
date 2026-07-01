import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Plus, ArrowRight, TrendingUp, Recycle } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const yieldColor = (p) => (p == null ? 'var(--text-muted)' : p >= 85 ? '#10b981' : p >= 70 ? '#f59e0b' : '#ef4444');

export default function Production() {
  const { activeProject } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productName: '', plannedQty: '', outputUom: 'nos' });

  const load = async () => {
    if (!activeProject) return;
    try {
      const [o, s] = await Promise.all([
        fetch(`${API}/production?projectId=${activeProject.id}`).then(r => r.json()),
        fetch(`${API}/production/summary?projectId=${activeProject.id}`).then(r => r.json()),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setSummary(s);
    } catch { setOrders([]); }
  };
  useEffect(() => { load(); }, [activeProject]);

  const create = async (e) => {
    e.preventDefault();
    if (!activeProject) { toast.error('Select a project first'); return; }
    if (!form.productName.trim()) { toast.error('Enter what you are producing'); return; }
    try {
      const res = await fetch(`${API}/production`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, ...form, plannedQty: form.plannedQty || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Production order ${data.prodNumber} created`);
      setForm({ productName: '', plannedQty: '', outputUom: 'nos' });
      setShowForm(false);
      navigate(`/production/${data.id}`);
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const input = { width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <Factory size={24} style={{ color: 'var(--brand-amber)' }} /> Production & Yield
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Track raw material in, finished goods out, scrap recovered — and your yield.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> New Production Order
        </button>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Production Orders</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{summary?.orders ?? 0}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}><TrendingUp size={13} /> Avg Yield</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: yieldColor(summary?.avgYieldPct), marginTop: 4 }}>{summary?.avgYieldPct != null ? `${summary.avgYieldPct}%` : '—'}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}><Recycle size={13} /> Scrap Recovered</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>₹{(summary?.scrapRecovered ?? 0).toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} style={{ ...card, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>What are you producing? *</label>
            <input style={input} placeholder="e.g. V-type Brackets, MS Gratings" value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Planned Qty</label>
            <input style={input} type="number" placeholder="40" value={form.plannedQty} onChange={e => setForm({ ...form, plannedQty: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Unit</label>
            <select style={input} value={form.outputUom} onChange={e => setForm({ ...form, outputUom: e.target.value })}>
              <option value="nos">nos</option><option value="kg">kg</option><option value="sets">sets</option><option value="units">units</option>
            </select>
          </div>
          <button type="submit" className="btn-primary btn-sm">Create & Open</button>
        </form>
      )}

      {/* Orders table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {orders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Factory size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No production orders yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Create one to start tracking material consumption, output and yield.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['Order', 'Product', 'Status', 'Yield', 'Input', 'Scrap ₹', 'Cost/Unit', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => navigate(`/production/${o.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{o.prod_number}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.product_name}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: o.status === 'Completed' ? 'hsl(160,60%,45%,0.12)' : o.status === 'In Progress' ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)', color: o.status === 'Completed' ? '#10b981' : o.status === 'In Progress' ? 'var(--brand-amber)' : 'var(--text-muted)' }}>{o.status}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 800, color: yieldColor(o.yield?.yieldPct) }}>{o.yield?.yieldPct != null ? `${o.yield.yieldPct}%` : '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{o.yield?.inputWeight ? `${o.yield.inputWeight} kg` : '—'}</td>
                  <td style={{ padding: '12px 14px', color: '#10b981', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{o.yield?.scrapRecovery ? `₹${o.yield.scrapRecovery.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{o.yield?.costPerUnit != null ? `₹${o.yield.costPerUnit.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-muted)' }}><ArrowRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
