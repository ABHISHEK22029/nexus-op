/* ══════════════════════════════════════════════════════════
   OrderReadiness — "can we build this order, and what's stopping us?"

   The single most useful thing to know before starting a job. Note that
   buildable is the MINIMUM across every material in the bill of materials,
   and the limiting material is always NAMED — "can build 1 of 10" is a
   number, "blocked by Glass" is something you can act on.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Layers } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function OrderReadiness({ orderId, defaultOpen = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true); setError('');
    fetch(`${API}/customer-orders/${orderId}/readiness`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not check material readiness'))))
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <Shell><span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Checking material availability…</span></Shell>;
  if (error) return <Shell><span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{error}</span></Shell>;
  if (!data) return null;

  // No bill of materials — say so plainly rather than implying everything is fine.
  if (!data.lines?.length) {
    return (
      <Shell tone="#6b7280">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          <Layers size={15} /> {data.message || 'No bill of materials for this order, so readiness cannot be calculated.'}
        </div>
      </Shell>
    );
  }

  const blocked = data.blocked > 0;
  const tone = blocked ? '#dc2626' : '#16a34a';

  return (
    <Shell tone={tone}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        {blocked ? <AlertTriangle size={17} style={{ color: tone, flexShrink: 0 }} /> : <CheckCircle2 size={17} style={{ color: tone, flexShrink: 0 }} />}
        <span style={{ fontWeight: 700, fontSize: '0.93rem', color: 'var(--text-primary)' }}>
          {blocked
            ? <>Can build <span style={{ color: tone }}>{data.buildable} of {data.ordered}</span> — blocked by <span style={{ color: tone }}>{data.blocking}</span></>
            : <>All {data.ordered} can be built with stock on hand</>}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
          {open ? 'Hide' : 'Details'} {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {data.lines.map(line => (
            <div key={line.line_id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                {line.product}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  {' '}· {line.remaining} still to make
                  {line.produced > 0 && ` (${line.produced} already produced)`}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 520 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={hcell}>Material</th>
                      <th style={{ ...hcell, textAlign: 'right' }}>Per unit</th>
                      <th style={{ ...hcell, textAlign: 'right' }}>In stock</th>
                      <th style={{ ...hcell, textAlign: 'right' }}>Supports</th>
                      <th style={hcell}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {line.materials.map(m => {
                      const isBlocker = m.material === line.blocked_by;
                      return (
                        <tr key={m.raw_material_id}
                          style={{ borderTop: '1px solid var(--border-subtle)', background: isBlocker ? 'rgba(220,38,38,0.06)' : 'transparent' }}>
                          <td style={{ ...cell, fontWeight: isBlocker ? 700 : 400 }}>{m.material}</td>
                          <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m.per_unit)} <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{m.base_uom}</span></td>
                          <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m.available)}</td>
                          <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: isBlocker ? 700 : 400, color: isBlocker ? '#dc2626' : 'inherit' }}>
                            {m.can_make == null ? '—' : `${m.can_make} units`}
                          </td>
                          <td style={cell}>
                            {isBlocker && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '.04em', padding: '2px 7px', borderRadius: 5, background: 'rgba(220,38,38,0.12)', color: '#dc2626', whiteSpace: 'nowrap' }}>
                                LIMITING
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {blocked && (
            <Link to={`/material-requirements?orderId=${orderId}&shortOnly=true`}
              className="btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', marginTop: 4 }}>
              <Layers size={14} /> See what to order
            </Link>
          )}

          {data.issues?.length > 0 && (
            <ul style={{ margin: '10px 0 0 18px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {data.issues.slice(0, 3).map((i, n) => <li key={n}>{i.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}

const Shell = ({ tone = '#6b7280', children }) => (
  <div style={{
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderLeft: `3px solid ${tone}`, borderRadius: 10, padding: '13px 16px', marginBottom: 14,
  }}>{children}</div>
);

const hcell = { padding: '5px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
const cell = { padding: '7px 10px', color: 'var(--text-primary)' };
