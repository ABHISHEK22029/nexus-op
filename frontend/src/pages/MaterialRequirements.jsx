/* ══════════════════════════════════════════════════════════
   Material Requirements — the deficiency board.

   Answers, for every material across every open order:
       how much do we NEED, how much do we HAVE, how much must we BUY?

   Design intent: this screen exists to drive a decision, not to display a
   table. The default view is what needs attention; the numbers are secondary
   to "what do I order, and how urgent is it".
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import SetupReadiness from '../components/SetupReadiness';
import { useSearchParams } from 'react-router-dom';
import { Layers, AlertTriangle, Search, RefreshCw, Info, TrendingDown, PackageCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* One status → one colour, everywhere. Same tint formula the rest of the
   app uses: 12% background of the hue, full-strength text. */
const STATUS = {
  Short:   { fg: '#dc2626', label: 'Short' },
  Ordered: { fg: '#f59e0b', label: 'Ordered' },
  Covered: { fg: '#16a34a', label: 'Covered' },
  Surplus: { fg: '#3b82f6', label: 'Surplus' },
};

export default function MaterialRequirements() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [shortOnly, setShortOnly] = useState(params.get('shortOnly') !== 'false');
  const orderId = params.get('orderId') || '';

  const load = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (orderId) qs.set('orderId', orderId);
      if (status) qs.set('status', status);
      if (shortOnly) qs.set('shortOnly', 'true');
      const r = await fetch(`${API}/material-requirements?${qs}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load material requirements');
      setData(await r.json());
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [orderId, status, shortOnly]);

  const rows = useMemo(() => {
    const items = data?.items || [];
    const q = search.trim().toLowerCase();
    return q ? items.filter(m => String(m.material).toLowerCase().includes(q) || String(m.category || '').toLowerCase().includes(q)) : items;
  }, [data, search]);

  /* Pareto: rank shortfall by value and mark where 80% of the exposure sits.
     Those get a negotiated RFQ; the tail can be auto-ordered.

     Computed over EVERY requirement, then looked up for whatever is on
     screen — not over the filtered rows. The cumulative share only means
     anything against the whole spend: computing it over a search result
     made any filtered set total 100%, so searching three cheap materials
     showed all three "above the 80% line" and marked them for negotiated
     RFQ. The 80/20 split is a property of the procurement book, not of the
     current search box. */
  const paretoByMaterial = useMemo(() => {
    const all = [...(data?.items || [])]
      .sort((a, b) => (b.shortfall_value || 0) - (a.shortfall_value || 0));
    const total = all.reduce((s, m) => s + (m.shortfall_value || 0), 0);
    const map = new Map();
    let cum = 0;
    for (const m of all) {
      cum += m.shortfall_value || 0;
      map.set(m.material, total > 0 ? (cum / total) * 100 : 0);
    }
    return map;
  }, [data]);

  const withPareto = useMemo(
    () => rows.map(m => ({ ...m, cumulativePct: paretoByMaterial.get(m.material) ?? 0 })),
    [rows, paretoByMaterial]
  );

  const categories = useMemo(
    () => [...new Set((data?.items || []).map(m => m.category).filter(Boolean))].sort(), [data]);

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* This is the screen where an empty data spine is most misleading —
          the table is legitimately empty and looks like a broken feature.
          The banner says which input is missing and what it costs. It hides
          itself once everything is in place. */}
      <SetupReadiness compact />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            <Layers size={22} style={{ color: 'var(--brand-amber)' }} /> Material Requirements
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4, maxWidth: '70ch' }}>
            What every open order needs, against what's in stock. Shortfalls are ranked by value, so the
            money goes where it matters.
          </p>
        </div>
        <button onClick={load} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* What needs attention, before any table */}
      {data?.summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Tile icon={<AlertTriangle size={15} />} tone="#dc2626" label="Materials short" value={data.summary.materials_short} />
          <Tile icon={<PackageCheck size={15} />} tone="#f59e0b" label="On order" value={data.summary.materials_ordered} />
          <Tile icon={<TrendingDown size={15} />} tone="#2563eb" label="Shortfall value" value={rupee(data.summary.total_shortfall_value)} />
        </div>
      )}

      {/* Anything the engine refused to guess at */}
      {data?.issues?.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 700, fontSize: '0.86rem' }}>
            <Info size={15} /> {data.issues.length} item{data.issues.length > 1 ? 's' : ''} couldn't be calculated
          </div>
          <ul style={{ margin: '6px 0 0 20px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {data.issues.slice(0, 5).map((i, n) => <li key={n}>{i.material || i.order ? <b>{i.material || i.order}: </b> : null}{i.message}</li>)}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material or category…"
            style={{ padding: '8px 12px 8px 32px', width: 260, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none' }} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={sel}>
          <option value="">All statuses</option>
          {Object.keys(STATUS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={params.get('category') || ''} onChange={e => { const p = new URLSearchParams(params); e.target.value ? p.set('category', e.target.value) : p.delete('category'); setParams(p); }} style={sel}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} />
          Only what's short
        </label>
        {orderId && (
          <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: 999, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            Filtered to order #{orderId}
            <button onClick={() => { const p = new URLSearchParams(params); p.delete('orderId'); setParams(p); }}
              style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-amber)' }}>clear</button>
          </span>
        )}
      </div>

      {/* The board */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
        {error ? (
          <Empty title="Couldn't load requirements" body={error} action={<button onClick={load} className="btn-secondary">Try again</button>} />
        ) : loading ? (
          <Empty title="Calculating…" body="Exploding bills of materials against stock on hand." />
        ) : withPareto.length === 0 ? (
          <Empty
            title={shortOnly ? 'Nothing is short' : 'No material requirements'}
            body={shortOnly
              ? 'Every material for the open orders is covered by stock or already on order.'
              : 'Requirements appear once an order has products with a bill of materials.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Material', 'Required', 'In Stock', 'Shortfall', 'On Order', 'Net', 'Status', 'To Order', 'Buy From', ''].map((h, i) => (
                    <th key={h + i} style={{ ...th, textAlign: [0, 6, 8, 9].includes(i) ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withPareto.map(m => {
                  const s = STATUS[m.status] || STATUS.Covered;
                  const isRfq = m.shortfall > 0 && m.cumulativePct <= 80;
                  return (
                    <tr key={m.raw_material_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.material}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {m.category && <>{m.category} · </>}
                          {m.orders?.length ? `for ${m.orders.slice(0, 2).join(', ')}${m.orders.length > 2 ? ` +${m.orders.length - 2}` : ''}` : null}
                          {m.is_critical && <span style={{ marginLeft: 6, color: '#dc2626', fontWeight: 700 }}>CRITICAL</span>}
                        </div>
                      </td>
                      <td style={tdNum}>{num(m.required)} <U>{m.base_uom}</U></td>
                      <td style={tdNum}>{num(m.available)}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: m.shortfall > 0 ? '#dc2626' : 'var(--text-muted)' }}>{m.shortfall > 0 ? num(m.shortfall) : '—'}</td>
                      <td style={tdNum}>{m.on_order > 0 ? num(m.on_order) : '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: m.net < 0 ? '#dc2626' : m.net > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {m.net > 0 ? `+${num(m.net)}` : num(m.net)}
                      </td>
                      <td style={td}><Pill fg={s.fg}>{s.label}</Pill></td>
                      <td style={tdNum}>
                        {m.shortfall > 0 ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{num(m.suggested_order_qty)} <U>{m.base_uom}</U></div>
                            {m.suggested_order_qty > m.shortfall && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                MOQ {num(m.moq)}{m.moq_source === 'vendor' ? ' (vendor)' : ''}
                              </div>
                            )}
                            {m.shortfall_value != null && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rupee(m.shortfall_value)}</div>}
                          </>
                        ) : '—'}
                      </td>
                      {/* Who to actually buy this from — a shortfall with no
                          supplier is a question, not an instruction. */}
                      <td style={td}>
                        {m.shortfall <= 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                          : m.preferred_vendor ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{m.preferred_vendor.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {m.preferred_vendor.price != null && <>₹{num(m.preferred_vendor.price)} · </>}
                                {m.lead_time_days != null ? `${m.lead_time_days}d lead` : 'lead unknown'}
                              </div>
                            </>
                          ) : (
                            <span title="Link a vendor to this material so purchase orders can be raised directly"
                              style={{ fontSize: '0.75rem', color: '#b45309' }}>No supplier linked</span>
                          )}
                      </td>
                      <td style={td}>
                        {m.shortfall > 0 && (
                          <span title={isRfq ? 'High value — worth comparing vendors' : 'Low value — order from the preferred vendor'}
                            style={{
                              fontSize: '0.68rem', fontWeight: 800, letterSpacing: '.04em', padding: '3px 8px', borderRadius: 6,
                              background: isRfq ? 'rgba(37,99,235,0.12)' : 'rgba(107,114,128,0.12)',
                              color: isRfq ? '#2563eb' : '#6b7280', whiteSpace: 'nowrap',
                            }}>
                            {isRfq ? 'RFQ' : 'AUTO-PO'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 10 }}>
        <b>Net</b> = stock + on order − required. Negative means still short; positive means covered with surplus
        (usually from ordering up to a minimum). <b>RFQ</b> marks the materials making up the top 80% of shortfall
        value — worth negotiating; the rest can be ordered from the preferred vendor.
      </p>
    </div>
  );
}

/* ── small pieces ───────────────────────────────────────── */
const th = { padding: '10px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' };
const td = { padding: '11px 14px', fontSize: '0.85rem', color: 'var(--text-primary)', verticalAlign: 'top' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const sel = { padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none' };

const U = ({ children }) => <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{children}</span>;

const Pill = ({ fg, children }) => (
  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: `${fg}20`, color: fg, fontWeight: 600, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{children}</span>
);

const Tile = ({ icon, tone, label, value }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tone }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

const Empty = ({ title, body, action }) => (
  <div style={{ padding: 46, textAlign: 'center' }}>
    <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4, maxWidth: '52ch', marginInline: 'auto' }}>{body}</div>
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);
