/* ══════════════════════════════════════════════════════════
   Link a stock row to the item it is.

   The setup banner said "0 of 4 stock rows linked — Fix this", and there was
   nowhere to fix it. A stock row with neither a raw material nor a product
   behind it is invisible to shortfalls: the BOM asks for material #7 and
   nothing on the shelf says it is material #7, so "available" reads zero
   however much is in the yard.

   This picks the item — the closest name first — or makes a new raw
   material from the row's own name and unit. It refuses a link whose units
   differ, because shortfalls read a material's stock in the material's own
   unit: 120 nos linked to a material kept in kg would count as 120 kg.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { Link2, Search, AlertTriangle, Plus, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';
import { unitCode } from '../lib/units';
import { fmtQty } from '../lib/format';
import { Shell } from './StockActions';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const headers = () => {
  const t = getToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

const words = (s) => String(s || '').toLowerCase().replace(/[×x]/g, ' x ').split(/[^a-z0-9]+/).filter(Boolean);
const squash = (s) => words(s).join('');

/* How alike two names are, 0 to 1: the same once spacing and punctuation
   are ignored, one inside the other, or the share of words in common. */
function likeness(a, b) {
  const A = squash(a), B = squash(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.8;
  const wa = new Set(words(a)), wb = new Set(words(b));
  const common = [...wa].filter(w => wb.has(w)).length;
  return common / Math.max(wa.size, wb.size);
}

export default function StockLinkDialog({ item, onClose, onLinked }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPick] = useState(null);     // { kind: 'material'|'product', id }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/inventory/unmatched`, { headers: headers() })
      .then(r => (r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || 'Could not load your items')))))
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  const stockUnit = unitCode(item.uom || item.base_uom);

  /* Materials and products as one list, the likeliest first. */
  const options = useMemo(() => {
    if (!data) return [];
    const all = [
      ...(data.candidates || []).map(m => ({ kind: 'material', id: m.id, name: m.name, code: m.material_code, unit: m.base_uom || m.unit })),
      ...(data.products || []).map(p => ({ kind: 'product', id: p.id, name: p.name, code: p.sku_code, unit: p.unit })),
    ].map(o => ({ ...o, score: likeness(item.itemName, o.name) }));
    all.sort((x, y) => y.score - x.score || String(x.name).localeCompare(String(y.name)));
    return all;
  }, [data, item.itemName]);

  const q = search.trim().toLowerCase();
  const shown = q
    ? options.filter(o => `${o.name} ${o.code || ''}`.toLowerCase().includes(q))
    : options;
  const best = options[0] && options[0].score >= 0.5 ? options[0] : null;

  /* The suggestion is chosen until somebody picks something else. */
  const pick = picked || (best ? { kind: best.kind, id: best.id } : null);

  const chosen = pick && options.find(o => o.kind === pick.kind && o.id === pick.id);
  const unitClash = chosen && stockUnit && chosen.unit && unitCode(chosen.unit) !== stockUnit;

  const link = async (target) => {
    setSaving(true);
    try {
      const body = target.kind === 'product' ? { sku_id: target.id } : { raw_material_id: target.id };
      const r = await fetch(`${API}/inventory/${item.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not link this stock');
      toast.success(`“${item.itemName}” is now linked to ${target.name}`);
      onLinked?.();
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  /* Offered unless an item of the same name, kept in the same unit, is
     already there to link to. When the name is taken by one kept in another
     unit, the new one carries its unit in its name so the two can be told
     apart. */
  const sameName = options.some(o => o.kind === 'material' && o.score === 1);
  const exactSameUnit = options.some(o => o.score === 1 && !(stockUnit && o.unit && unitCode(o.unit) !== stockUnit));
  const newName = `${String(item.itemName || '').trim()}${sameName ? ` (${stockUnit || 'nos'})` : ''}`;

  /* A new raw material named and measured as the stock row is. */
  const addAsMaterial = async () => {
    setSaving(true);
    try {
      const unit = stockUnit || 'nos';
      const r = await fetch(`${API}/raw-materials`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ name: newName, unit, base_uom: unit, category: item.category || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error || 'Could not add the raw material');
      await link({ kind: 'material', id: d.id, name: `a new raw material, kept in ${unit}` });
    } catch (e) { toast.error(e.message); setSaving(false); }
  };

  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px 9px 32px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
  };

  return (
    <Shell
      title={`Link “${item.itemName}”`}
      subtitle={`${fmtQty(item.quantity)} ${item.uom || ''} in stock. Shortfalls only count stock that is linked to a raw material or a product.`}
      icon={<Link2 size={17} style={{ color: 'var(--brand-amber)' }} />}
      onClose={onClose}
      width={560}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" disabled={!chosen || unitClash || saving}
            onClick={() => link(chosen)} style={{ opacity: !chosen || unitClash || saving ? 0.55 : 1 }}>
            <Link2 size={14} /> {saving ? 'Linking…' : 'Link stock'}
          </button>
        </>
      )}
    >
      {error && <div role="alert" style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>{error}</div>}
      {!data && !error && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading your items…</div>}

      {data && (
        <>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search raw materials and products…"
              aria-label="Search raw materials and products" style={input} autoFocus autoComplete="off" />
          </div>

          <div role="listbox" aria-label="Raw materials and products" style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {shown.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 2px' }}>
                {options.length ? `Nothing matches “${search}”.` : 'You have no raw materials or products yet. Add this one below.'}
              </div>
            )}
            {shown.map(o => {
              const on = pick && pick.kind === o.kind && pick.id === o.id;
              const clash = stockUnit && o.unit && unitCode(o.unit) !== stockUnit;
              return (
                <button key={`${o.kind}${o.id}`} type="button" role="option" aria-selected={on}
                  onClick={() => setPick({ kind: o.kind, id: o.id })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '9px 11px', borderRadius: 9,
                    border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-subtle)'}`,
                    background: on ? 'hsl(28,100%,54%,0.08)' : 'var(--bg-surface)',
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {o.name}{o.code ? <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {o.code}</span> : null}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: clash ? '#b45309' : 'var(--text-muted)', marginTop: 1 }}>
                      {o.kind === 'product' ? 'Product' : 'Raw material'}{o.unit ? ` · kept in ${o.unit}` : ''}
                    </span>
                  </span>
                  {best && best.kind === o.kind && best.id === o.id && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#059669', whiteSpace: 'nowrap' }}>
                      Suggested
                    </span>
                  )}
                  {on && <CheckCircle2 size={16} style={{ color: 'var(--brand-amber)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {unitClash && (
            <div role="alert" style={{ display: 'flex', gap: 8, marginTop: 10, padding: '9px 11px', borderRadius: 9, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              <AlertTriangle size={15} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
              <span>
                This stock is counted in <b>{item.uom}</b>, but {chosen.name} is kept in <b>{chosen.unit}</b>. Shortfalls read stock in the
                item’s own unit, so {fmtQty(item.quantity)} {item.uom} would be counted as {fmtQty(item.quantity)} {chosen.unit}. Pick an item
                kept in {item.uom}, or add this one as a new raw material.
              </span>
            </div>
          )}

          {!exactSameUnit && (
            <button type="button" onClick={addAsMaterial} disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', marginTop: 12, cursor: 'pointer', textAlign: 'left',
                padding: '10px 12px', borderRadius: 9, border: '1px dashed var(--border-default)', background: 'transparent',
                color: 'var(--text-primary)', fontSize: '0.85rem',
              }}>
              <Plus size={15} style={{ color: 'var(--brand-amber)', flexShrink: 0 }} />
              <span>
                <b>Add it as a new raw material</b>
                <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  “{newName}”, kept in {stockUnit || 'nos'} — and link this stock to it
                </span>
              </span>
            </button>
          )}
        </>
      )}
    </Shell>
  );
}
