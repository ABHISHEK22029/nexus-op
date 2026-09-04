/* ══════════════════════════════════════════════════════════
   CategoryAdmin — the organisation's own words, tidied up.

   Most categories are created in the act of classifying, from the vendor and
   customer forms, because that is the moment somebody knows they need one.
   This is where they get renamed, merged in the head, and retired later.

   Deleting a category that is in use hides it from new entries rather than
   removing it. A category is referenced by NAME on vendor and customer rows,
   so deleting it outright would silently blank a classification somebody
   chose — the row would go from "Board" to nothing, with no way to tell
   whether it was never set or quietly lost.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const KINDS = [
  ['vendor', 'What we buy', 'Used on vendors — e.g. Board, Hardware, Laminate'],
  ['customer', 'What we sell', 'Used on customers — e.g. Fire doors, Handrails'],
];

export default function CategoryAdmin({ api, toast }) {
  const [kind, setKind] = useState('vendor');
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setRows(await api(`/supply-categories?kind=${kind}`)); setErr(''); }
    catch (e) { setErr(e.message); }
  }, [api, kind]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    try {
      await api('/supply-categories', { method: 'POST', body: JSON.stringify({ kind, name }) });
      setAdding('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (row) => {
    const inUse = Number(row.vendor_count || 0) + Number(row.customer_count || 0);
    const msg = inUse > 0
      ? `"${row.name}" is used by ${inUse} record(s). It will be hidden from new entries but stays readable on those. Continue?`
      : `Delete "${row.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      const r = await api(`/supply-categories/${row.id}`, { method: 'DELETE' });
      toast.success(r.deactivated ? 'Hidden from new entries' : 'Deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const th = { padding: '10px 14px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', textAlign: 'left' };
  const td = { padding: '11px 14px', fontSize: '0.86rem', color: 'var(--text-primary)' };
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' };

  const active = KINDS.find(k => k[0] === kind);

  if (err) {
    return (
      <div style={{ ...card, padding: 30, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 600 }}>{err}</div>
        <button onClick={load} className="btn-secondary" style={{ marginTop: 10 }}>Try again</button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        {KINDS.map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)}
            style={{
              padding: '6px 13px', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 700,
              background: kind === k ? 'hsl(28,100%,54%,0.12)' : 'transparent',
              border: `1px solid ${kind === k ? 'var(--brand-amber)' : 'var(--border-default)'}`,
              color: kind === k ? 'var(--brand-amber)' : 'var(--text-secondary)',
            }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {rows.length} defined
        </span>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder={active?.[2] || ''}
            style={{
              flex: 1, padding: '9px 11px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)', borderRadius: 8,
              color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
            }}
          />
          <button onClick={add} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-elevated)' }}>
            <th style={th}>Category</th>
            <th style={th}>In use by</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const inUse = Number(r.vendor_count || 0) + Number(r.customer_count || 0);
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...td, color: inUse ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {inUse ? `${inUse} record${inUse === 1 ? '' : 's'}` : 'not used yet'}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => remove(r)} className="btn-secondary"
                    title={inUse ? 'Hide from new entries' : 'Delete'}
                    style={{ fontSize: '0.74rem', padding: '4px 9px' }}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 26 }}>
                Nothing yet. Categories also appear here the moment somebody creates one while adding a {kind}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
