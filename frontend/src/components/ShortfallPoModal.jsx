/* ══════════════════════════════════════════════════════════
   Order what's short.

   The requirements board already knew what to buy, how much (rounded up to
   the vendor's minimum) and from whom — and the server could raise the
   purchase orders (/material-requirements/to-po). Nothing on screen asked
   it to, so the shortfall was read off this table and typed into the PO
   screen line by line.

   This shows the plan first: one PO per vendor, its lines and value, and
   the materials that will be skipped because no vendor is linked. Raising
   purchase orders is a commitment, so it is previewed before it is made.
   POs over the sign-off threshold come out held for approval, as any other.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ShoppingCart, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qty = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function ShortfallPoModal({ onClose, onRaised, query = '' }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const headers = () => {
    const t = getToken();
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  };

  useEffect(() => {
    fetch(`${API}/material-requirements/purchase-plan${query ? `?${query}` : ''}`, { headers: headers() })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not work out the purchase plan'); return d; })
      .then(setPlan)
      .catch(e => setError(e.message));
  }, [query]);

  const raise = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`${API}/material-requirements/to-po${query ? `?${query}` : ''}`, {
        method: 'POST', headers: headers(), body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || d.error || 'The purchase orders were not raised');
      setResult(d);
      onRaised?.(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const vendors = plan?.vendors || [];
  const skipped = (result ? result.skipped : plan?.unassigned) || [];

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.45)' }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="sfpo-title" style={{
        width: '100%', maxWidth: 680, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.3))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <h2 id="sfpo-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <ShoppingCart size={17} style={{ color: 'var(--brand-amber)' }} />
              {result ? 'Purchase orders raised' : 'Raise purchase orders for the shortfall'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {result
                ? 'Each is a normal purchase order: approve, send and receive it as usual.'
                : 'One purchase order per vendor, from each material’s preferred vendor, at their price — quantities rounded up to their minimum order.'}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, fontSize: '0.84rem' }}>
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 9, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c' }}>{error}</div>
          )}

          {!plan && !error && <p style={{ color: 'var(--text-muted)' }}>Working out what to order…</p>}

          {result && (
            <div data-raised style={{ display: 'grid', gap: 8 }}>
              {result.created.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-subtle)' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981', flex: 'none' }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.poNumber}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{c.vendor} · {c.lines} line{c.lines === 1 ? '' : 's'}</span>
                  {c.approvalStatus === 'Pending Approval' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b45309' }}>Needs sign-off</span>}
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rup(c.value)}</span>
                </div>
              ))}
            </div>
          )}

          {plan && !result && (vendors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              {skipped.length ? 'Nothing can be ordered yet — every short material is missing a vendor.' : 'Nothing is short. There is nothing to order.'}
            </p>
          ) : vendors.map(v => (
            <div key={v.vendorId} data-plan-vendor style={{ marginBottom: 12, border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--bg-elevated)', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>{v.vendorName}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rup(v.total)}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {v.lines.map(l => (
                    <tr key={l.raw_material_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-primary)' }}>{l.material}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {qty(l.qty)} {l.uom}
                        {Number(l.qty) > Number(l.shortfall) && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>short {qty(l.shortfall)}, minimum order</span>}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>× {rup(l.rate)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rup(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )))}

          {skipped.length > 0 && (
            <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#b45309' }}>
                <AlertTriangle size={14} /> {skipped.length} short material{skipped.length === 1 ? '' : 's'} {result ? 'were' : 'will be'} skipped — no vendor linked
              </div>
              <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                {skipped.map(s => s.material).join(', ')}. Link a vendor on Vendors → What they supply, then come back.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          {result ? (
            <Link to="/purchase-orders" className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Open purchase orders <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
              <button type="button" onClick={raise} disabled={busy || !vendors.length} className="btn-primary btn-sm" data-raise-pos>
                {busy ? 'Raising…' : `Raise ${vendors.length} purchase order${vendors.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
