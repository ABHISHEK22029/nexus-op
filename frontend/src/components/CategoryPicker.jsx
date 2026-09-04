/* ══════════════════════════════════════════════════════════
   CategoryPicker — pick from the organisation's own vocabulary, or add to it.

   Vendors were classified by a `type` dropdown offering Civil, Bituminous,
   IT Hardware — a road contractor's categories, handed to every business.
   A furniture maker buys Board, Laminate and Hardware; a fabricator buys
   Plate, Section and Fasteners. When none of the options fit, people pick
   the least wrong one or leave it blank, and the list stops being filterable
   by the thing that actually distinguishes the rows.

   So the list belongs to the business. Type a name that is not there and it
   offers to add it — because the moment you need a category is the moment
   you are classifying something, not later in a settings screen.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Plus, Check, Tag } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CategoryPicker({
  kind,                    // 'vendor' | 'customer'
  value,
  onChange,
  placeholder = 'Choose or type to add…',
  style = {},
}) {
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);

  const load = () => {
    const t = getToken();
    fetch(`${API}/supply-categories?kind=${kind}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(r => (r.ok ? r.json() : []))
      .then(d => setOptions(Array.isArray(d) ? d : []))
      .catch(() => {});
  };
  useEffect(load, [kind]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setTyped(''); } };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setTyped(''); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const q = typed.trim().toLowerCase();
  const shown = useMemo(
    () => options.filter(o => !q || o.name.toLowerCase().includes(q)),
    [options, q]);

  /* Only offer to create when nothing already matches exactly — otherwise
     "Hardware" typed against an existing "Hardware" looks like a new one. */
  const exact = options.some(o => o.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  const create = async () => {
    setSaving(true);
    try {
      const t = getToken();
      const res = await fetch(`${API}/supply-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ kind, name: typed.trim() }),
      });
      if (res.ok) {
        const made = await res.json();
        setOptions(o => [...o, made]);
        onChange(made.name);
      } else {
        /* 409 means somebody else added it between the list load and now —
           still the right answer for the user, so select it either way. */
        onChange(typed.trim());
        load();
      }
    } finally {
      setSaving(false);
      setOpen(false);
      setTyped('');
    }
  };

  const field = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '0.85rem', textAlign: 'left', ...style,
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" style={field} onClick={() => setOpen(o => !o)}>
        <Tag size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        {value && (
          <span
            role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
            title="Clear"
            style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}
          >×</span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: 6,
        }}>
          <input
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); create(); } }}
            placeholder="Search, or type a new one…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginBottom: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none',
            }}
          />

          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {shown.map(o => (
              <button
                key={o.id ?? o.name} type="button"
                onClick={() => { onChange(o.name); setOpen(false); setTyped(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'none', border: 'none', borderRadius: 7, padding: '8px 10px',
                  cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontSize: '0.83rem',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Check size={13} style={{ opacity: value === o.name ? 1 : 0, color: 'var(--brand-amber)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{o.name}</span>
                {/* How many rows already use it — the difference between a
                    live category and one somebody typed once by accident. */}
                {Number(o.vendor_count || 0) + Number(o.customer_count || 0) > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {Number(o.vendor_count || 0) + Number(o.customer_count || 0)}
                  </span>
                )}
              </button>
            ))}
            {!shown.length && !canCreate && (
              <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No categories yet — type one above.
              </div>
            )}
          </div>

          {canCreate && (
            <button
              type="button" onClick={create} disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                marginTop: 4, padding: '9px 10px', borderRadius: 7, cursor: 'pointer',
                background: 'hsl(28,100%,54%,0.10)', border: '1px dashed var(--brand-amber)',
                color: 'var(--brand-amber)', fontSize: '0.83rem', fontWeight: 600, textAlign: 'left',
              }}
            >
              <Plus size={14} />{saving ? 'Adding…' : `Add “${typed.trim()}”`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
