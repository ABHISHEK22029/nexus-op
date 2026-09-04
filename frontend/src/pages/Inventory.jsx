/* ══════════════════════════════════════════════════════════
   Stock on hand — what you are holding, and what is running out.

   Rewritten for two reasons.

   1. IT WAS EMPTY. The page filtered by the selected project, but stock is
      company-level: of 102 rows on this database only 8 carry a projectId,
      because migration 034 made that column nullable when the ledger made
      stock a business-wide balance. So a project-scoped view showed almost
      nothing and read as a broken feature. The dashboard was corrected for
      exactly this reason; this page had not been.

   2. IT WAS WRITTEN FOR THE DARK THEME ONLY. Hardcoded Tailwind colours —
      `bg-[#111113]`, `text-white`, `text-gray-500` — on a product whose
      light theme is a warm off-white. Measured in light mode it had an
      unreadable heading and a search box whose magnifier sat on top of the
      text: the `pl-10` class never applied, because the global
      `input[type="text"]` rule (specificity 0,1,1) beats a Tailwind utility
      class (0,1,0) and forces `padding: 10px 14px`.

      That trap is not specific to this page — Tailwind padding utilities
      silently do nothing on ANY input in this app. The rest of the product
      uses inline styles over CSS variables, so this page now does too, and
      inherits both themes for free.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Database, Package, Search, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Semantic colour, not theme colour — these read on cream and on charcoal
   because they are stated as translucent tints over whatever is behind. */
const TONE = {
  'Out of Stock':   { fg: '#dc2626', bg: 'rgba(220,38,38,0.12)',  ring: 'rgba(220,38,38,0.35)' },
  'Low Stock':      { fg: '#dc2626', bg: 'rgba(220,38,38,0.10)',  ring: 'rgba(220,38,38,0.28)' },
  'Near threshold': { fg: '#b45309', bg: 'rgba(245,158,11,0.14)', ring: 'rgba(245,158,11,0.32)' },
  Healthy:          { fg: '#059669', bg: 'rgba(16,185,129,0.12)', ring: 'var(--border-subtle)' },
};

export default function Inventory() {
  const toast = useToast();
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');

  /* No project filter. Stock is a company-level balance — see the note at
     the top of this file. */
  const load = () => {
    setLoading(true);
    axios.get(`${API_BASE}/inventory`)
      .then(res => { setInventory(Array.isArray(res.data) ? res.data : (res.data?.items || [])); setError(''); })
      .catch(err => setError(err.response?.data?.error || err.message || 'Could not load stock'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(i =>
      String(i.itemName || '').toLowerCase().includes(q) ||
      String(i.category || '').toLowerCase().includes(q) ||
      String(i.location || '').toLowerCase().includes(q));
  }, [inventory, search]);

  /* Worth knowing before you read the cards: how much is short. */
  const summary = useMemo(() => {
    const short = inventory.filter(i => (i.status || 'Healthy') !== 'Healthy').length;
    const value = inventory.reduce((s, i) => s + (Number(i.stock_value) || 0), 0);
    return { short, value };
  }, [inventory]);

  const saveReorder = async (item) => {
    const value = draft === '' ? 0 : Number(draft);
    if (Number.isNaN(value) || value < 0) { toast.error('Enter a valid reorder level'); return; }
    try {
      await axios.patch(`${API_BASE}/inventory/${item.id}`, { min_stock_level: value });
      const fresh = await axios.get(`${API_BASE}/inventory`);
      setInventory(Array.isArray(fresh.data) ? fresh.data : (fresh.data?.items || []));
      toast.success(`Reorder level set for ${item.itemName}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the reorder level');
    } finally { setEditingId(null); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const pill = (t) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 999,
    fontSize: '0.72rem', fontWeight: 700,
    background: t.bg, color: t.fg,
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <Database size={23} style={{ color: 'var(--brand-amber)' }} /> Stock on hand
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            What you are holding right now, across the business. Set a reorder level to make the low-stock warning mean something.
          </p>
        </div>

        <div style={{ position: 'relative', minWidth: 240 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock…"
            aria-label="Search stock"
            /* Inline, because a Tailwind padding class loses to the global
               input[type="text"] rule and the icon ends up on the text. */
            style={{
              width: 260, boxSizing: 'border-box',
              padding: '9px 30px 9px 34px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search"
              style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Two numbers worth having above the grid. */}
      {!loading && inventory.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Items held</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{inventory.length}</div>
          </div>
          <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Needs ordering</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: summary.short ? '#dc2626' : 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{summary.short}</div>
          </div>
          {summary.value > 0 && (
            <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Stock value</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>₹{summary.value.toLocaleString('en-IN')}</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ ...card, padding: 26, textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>
          {error}
          <div><button onClick={load} className="btn-secondary" style={{ marginTop: 10 }}>Try again</button></div>
        </div>
      )}

      {!error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {loading ? (
            <div style={{ ...card, gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : rows.length ? rows.map(item => {
            const status = item.status || 'Healthy';
            const tone = TONE[status] || TONE.Healthy;
            const alert = status !== 'Healthy';
            const qty = item.totalQuantity ?? item.quantity ?? 0;
            const isEditing = editingId === item.id;
            return (
              <div key={item.id || item.itemName}
                style={{ ...card, padding: 16, border: `1px solid ${alert ? tone.ring : 'var(--border-subtle)'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: alert ? tone.bg : 'var(--bg-elevated)',
                  }}>
                    <Package size={17} style={{ color: alert ? tone.fg : 'var(--brand-amber)' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.3 }}>{item.itemName}</div>
                    {item.category && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.category}</div>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: alert ? tone.fg : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {Number(qty).toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.uom || item.base_uom || 'units'}</span>
                  </div>
                  <span style={pill(tone)}>
                    {alert ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}{status}
                  </span>
                </div>

                <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-subtle)' }}>
                  {isEditing ? (
                    <input
                      autoFocus type="number" min="0" value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => saveReorder(item)}
                      onKeyDown={e => { if (e.key === 'Enter') saveReorder(item); if (e.key === 'Escape') setEditingId(null); }}
                      style={{
                        width: 110, padding: '4px 8px', fontSize: '0.78rem',
                        background: 'var(--bg-elevated)', border: '1px solid var(--brand-amber)',
                        borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingId(item.id); setDraft(String(item.reorderLevel ?? 0)); }}
                      title="Click to set the reorder level"
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: '0.74rem', color: 'var(--text-muted)',
                        textDecoration: 'underline dotted', textUnderlineOffset: 3,
                      }}
                    >
                      Reorder at {Number(item.reorderLevel) > 0 ? Number(item.reorderLevel).toLocaleString('en-IN') : 'not set'}
                    </button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div style={{ ...card, gridColumn: '1 / -1', padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              {inventory.length === 0
                ? 'Nothing in stock yet. Stock appears here when a goods receipt is recorded or production books output.'
                : `Nothing matches “${search}”.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
