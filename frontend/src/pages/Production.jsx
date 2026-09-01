/* ══════════════════════════════════════════════════════════
   Production & Yield — searchable, filterable, paginated.

   The order count and the status/no-output counts come from `q.summary`,
   the server's aggregate over the whole filtered set. Summing `q.rows`
   would count the current page only — a figure that looks authoritative,
   changes when you click Next, and is wrong in the direction that flatters.

   Average yield and scrap recovered stay on /production/summary: they are
   weighted by input across the project, which is not something the list
   endpoint can honestly average per page.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Plus, ArrowRight, TrendingUp, Recycle, AlertTriangle } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const yieldColor = (p) => (p == null ? 'var(--text-muted)' : p >= 85 ? '#10b981' : p >= 70 ? '#f59e0b' : '#ef4444');

export default function Production() {
  const { activeProject } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [projSummary, setProjSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productName: '', plannedQty: '', outputUom: 'nos' });

  /* /production REQUIRES ?projectId — it 400s without one. The active
     project therefore goes in as a baseline filter rather than a hand-built
     query string, so it composes with search instead of being overwritten by
     it, and "Clear filters" cannot widen the list to every project. */
  const q = useListQuery('production', {
    pageSize: 25,
    initialFilters: activeProject ? { projectId: String(activeProject.id) } : {},
  });

  // Keep the project filter in step when the active project changes.
  useEffect(() => {
    q.setFilters(activeProject ? { projectId: String(activeProject.id) } : {});
  }, [activeProject?.id]);

  // Weighted yield / scrap for the project — deliberately not a page sum.
  const loadProjectSummary = async () => {
    if (!activeProject) { setProjSummary(null); return; }
    try {
      const token = getToken();
      const res = await fetch(`${API}/production/summary?projectId=${activeProject.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setProjSummary(res.ok ? await res.json() : null);
    } catch { setProjSummary(null); }
  };
  useEffect(() => { loadProjectSummary(); }, [activeProject?.id]);

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
  const tileLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' };
  const tileValue = (tone) => ({ fontSize: '1.8rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' });

  const s = q.summary || {};
  const canWrite = can('production', 'write');

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
        {/* Hidden when the API would refuse it anyway. */}
        {canWrite && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> New Production Order
          </button>
        )}
      </div>

      {/* Summary tiles — counts from the server aggregate, not from the page */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 14, marginBottom: 20 }}>
        <div style={card}>
          <div style={tileLabel}>{q.isFiltered ? 'Orders (filtered)' : 'Production Orders'}</div>
          <div style={tileValue()}>{s.count ?? q.total}</div>
        </div>
        <div style={card}>
          <div style={tileLabel}>In Progress</div>
          <div style={tileValue('var(--brand-amber)')}>{s.in_progress ?? 0}</div>
        </div>
        {/* The one that needs someone to look: planned, material possibly
            issued, nothing booked back. */}
        <div style={card}>
          <div style={tileLabel}><AlertTriangle size={13} /> No Output Yet</div>
          <div style={tileValue(Number(s.no_output) > 0 ? '#ef4444' : '#10b981')}>{s.no_output ?? 0}</div>
        </div>
        <div style={card}>
          <div style={tileLabel}><TrendingUp size={13} /> Avg Yield</div>
          <div style={tileValue(yieldColor(projSummary?.avgYieldPct))}>{projSummary?.avgYieldPct != null ? `${projSummary.avgYieldPct}%` : '—'}</div>
        </div>
        <div style={card}>
          <div style={tileLabel}><Recycle size={13} /> Scrap Recovered</div>
          <div style={tileValue('#10b981')}>₹{(projSummary?.scrapRecovered ?? 0).toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Create form */}
      {showForm && canWrite && (
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

      {!activeProject ? (
        /* The endpoint is project-scoped and refuses a call without one, so
           say that plainly rather than showing an empty table. */
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Factory size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Select a project first</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Production orders belong to a project — pick one from the switcher.</div>
        </div>
      ) : (
        <>
          {/* Statuses are the three production_orders.status actually holds. */}
          <ListToolbar
            q={q}
            placeholder="Search order no., product, work order, customer…"
            filters={[{
              key: 'status',
              label: 'Status',
              options: [
                { value: 'Planned', label: 'Planned' },
                { value: 'In Progress', label: 'In progress' },
                { value: 'Completed', label: 'Completed' },
              ],
            }]}
          />

          {/* Orders table */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {q.rows.length === 0 ? (
              <EmptyState q={q} icon={Factory} noun="production orders"
                hint="Create one to start tracking material consumption, output and yield." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                      {['Order', 'Product', 'Status', 'Yield', 'Input', 'Scrap ₹', 'Cost/Unit', ''].map(h => (
                        <th key={h} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.rows.map(o => (
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
              </div>
            )}
          </div>

          <Pagination q={q} />
        </>
      )}
    </div>
  );
}
