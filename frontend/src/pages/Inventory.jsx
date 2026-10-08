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
import { useSearchParams } from 'react-router-dom';
import { Database, Package, Search, X, AlertTriangle, CheckCircle2, Plus, Scale, FileSpreadsheet, Pencil, Trash2, Link2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { AddStockModal, ItemStockPanel } from '../components/StockActions';
import StockUpload from '../components/StockUpload';
import StockLinkDialog from '../components/StockLinkDialog';
import FitNumber from '../components/FitNumber';
import { fmtCompactINR, fmtCompactQty, fmtINR, fmtQty } from '../lib/format';

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
  /* Adding opening stock and correcting a count were only ever possible
     through the API. See components/StockActions.jsx. */
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState(null);
  /* Stock lists: the same item can be held in more than one place. 'all'
     shows every list; 'main' the main stock; a number one list. */
  const [lists, setLists] = useState([]);
  const [listFilter, setListFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  /* Stock with no raw material or product behind it, which shortfalls
     cannot count. ?unlinked=1 — where the setup banner's "Fix this" lands —
     shows only those. */
  const [params, setParams] = useSearchParams();
  const onlyUnlinked = params.get('unlinked') === '1';
  const setOnlyUnlinked = (on) => setParams(p => { const n = new URLSearchParams(p); if (on) n.set('unlinked', '1'); else n.delete('unlinked'); return n; }, { replace: true });
  const [linking, setLinking] = useState(null);
  const { can } = usePermissions();
  const canWrite = can('inventory', 'write');

  /* No project filter. Stock is a company-level balance — see the note at
     the top of this file. */
  /* `loading` starts true; a reload keeps the cards on screen until the
     fresh list arrives rather than blanking them to "Loading…". */
  const load = () => {
    axios.get(`${API_BASE}/inventory`)
      .then(res => { setInventory(Array.isArray(res.data) ? res.data : (res.data?.items || [])); setError(''); })
      .catch(err => setError(err.response?.data?.error || err.message || 'Could not load stock'))
      .finally(() => setLoading(false));
  };
  const loadLists = () => axios.get(`${API_BASE}/inventory/lists`)
    .then(res => setLists(res.data?.lists || []))
    .catch(() => setLists([]));
  useEffect(load, []);
  useEffect(() => { loadLists(); }, []);
  const reloadAll = () => { load(); loadLists(); };

  const renameList = async (l) => {
    const name = window.prompt('Rename the stock list', l.name);
    if (name == null || !name.trim() || name.trim() === l.name) return;
    try {
      await axios.patch(`${API_BASE}/inventory/lists/${l.id}`, { name: name.trim() });
      toast.success(`Renamed to ${name.trim()}`); reloadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not rename the list'); }
  };
  const removeList = async (l) => {
    if (!window.confirm(`Remove the stock list “${l.name}”? Only an empty list can be removed.`)) return;
    try {
      await axios.delete(`${API_BASE}/inventory/lists/${l.id}`);
      toast.success(`“${l.name}” removed`); setListFilter('all'); reloadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not remove the list'); }
  };

  /* One item held in several lists: the total across them, by the item's
     identity (material, product, or name) — what the shortfall engine sees. */
  const itemKey = (i) => (i.raw_material_id ? `m${i.raw_material_id}` : i.sku_id ? `p${i.sku_id}` : `n${String(i.itemName || '').trim().toLowerCase()}`);
  const totals = useMemo(() => {
    const m = new Map();
    for (const i of inventory) {
      const k = itemKey(i);
      const t = m.get(k) || { qty: 0, rows: 0 };
      t.qty += Number(i.quantity) || 0; t.rows++;
      m.set(k, t);
    }
    return m;
  }, [inventory]);
  const isLinked = (i) => i.raw_material_id != null || i.sku_id != null;
  const unlinkedCount = useMemo(() => inventory.filter(i => !isLinked(i)).length, [inventory]);
  const inFilter = (i) => (onlyUnlinked && isLinked(i) ? false
    : listFilter === 'all' ? true
      : listFilter === 'main' ? i.stock_list_id == null
        : String(i.stock_list_id) === String(listFilter));
  const mainCount = useMemo(() => inventory.filter(i => i.stock_list_id == null).length, [inventory]);
  const activeList = lists.find(l => String(l.id) === String(listFilter)) || null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped = inventory.filter(inFilter);
    if (!q) return scoped;
    return scoped.filter(i =>
      String(i.itemName || '').toLowerCase().includes(q) ||
      String(i.item_code || '').toLowerCase().includes(q) ||
      String(i.category || '').toLowerCase().includes(q) ||
      String(i.location || '').toLowerCase().includes(q) ||
      String(i.stock_list_name || '').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, search, listFilter, onlyUnlinked]);

  /* Worth knowing before you read the cards: how much is short. */
  const summary = useMemo(() => {
    const scoped = inventory.filter(inFilter);
    const short = scoped.filter(i => (i.status || 'Healthy') !== 'Healthy').length;
    const value = scoped.reduce((s, i) => s + (Number(i.stock_value) || 0), 0);
    return { short, value, count: scoped.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, listFilter, onlyUnlinked]);

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

        {canWrite && (
          <button onClick={() => setUploading(true)} className="btn-secondary btn-sm"
            title="Bring stock in from an Excel or CSV sheet"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <FileSpreadsheet size={14} /> Upload sheet
          </button>
        )}
        {canWrite && (
          <button onClick={() => setAdding(true)} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Add stock
          </button>
        )}
        </div>
      </div>

      {/* Which stock list — shown once there is more than the main stock. */}
      {lists.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }} role="group" aria-label="Stock list">
          {[['all', 'All lists', inventory.length], ['main', 'Main stock', mainCount], ...lists.map(l => [String(l.id), l.name, l.items])].map(([key, text, n]) => {
            const on = String(listFilter) === key;
            return (
              <button key={key} type="button" onClick={() => setListFilter(key)} aria-pressed={on}
                style={{
                  border: `1px solid ${on ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius: 999, padding: '5px 12px',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: on ? 'var(--text-primary)' : 'var(--bg-surface)', color: on ? 'var(--bg-surface)' : 'var(--text-secondary)',
                }}>
                {text} <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </button>
            );
          })}
          {activeList && canWrite && (
            <span style={{ display: 'inline-flex', gap: 4, marginLeft: 4 }}>
              <button type="button" onClick={() => renameList(activeList)} title="Rename this list" aria-label={`Rename ${activeList.name}`}
                style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0 }}>
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => removeList(activeList)} title="Remove this list (only when empty)" aria-label={`Remove ${activeList.name}`}
                style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0 }}>
                <Trash2 size={13} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Two numbers worth having above the grid. */}
      {/* Shortfalls cannot count stock that is not linked to an item. Said
          here, with the way to see just those rows, rather than only in the
          setup banner on another screen. */}
      {!loading && (unlinkedCount > 0 || onlyUnlinked) && (
        <div data-unlinked-note style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
          <AlertTriangle size={15} style={{ color: '#b45309', flexShrink: 0 }} />
          <span style={{ flex: '1 1 220px' }}>
            {unlinkedCount === 0
              ? 'Every stock row is linked to an item.'
              : <><b style={{ color: 'var(--text-primary)' }}>{unlinkedCount} of {inventory.length}</b> stock row{inventory.length === 1 ? '' : 's'} {unlinkedCount === 1 ? 'is' : 'are'} not linked to a raw material or product, so shortfalls cannot count {unlinkedCount === 1 ? 'it' : 'them'}.</>}
          </span>
          <button type="button" className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 11px' }} onClick={() => setOnlyUnlinked(!onlyUnlinked)}>
            {onlyUnlinked ? 'Show all stock' : 'Show only these'}
          </button>
        </div>
      )}

      {/* Compact figures (₹16.03 L) with the exact value on hover; a stock
          value in the crores ran out of its tile. */}
      {!loading && inventory.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Items held</div>
            <FitNumber style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{summary.count}</FitNumber>
          </div>
          <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Needs ordering</div>
            <FitNumber style={{ fontSize: '1.5rem', fontWeight: 800, color: summary.short ? '#dc2626' : 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{summary.short}</FitNumber>
          </div>
          {summary.value > 0 && (
            <div style={{ ...card, padding: '12px 16px', flex: '1 1 180px', minWidth: 0 }} data-tile="stock-value">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Stock value</div>
              <FitNumber exact={fmtINR(summary.value)} style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtCompactINR(summary.value)}</FitNumber>
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
              <div key={item.id || item.itemName} data-stock-card
                style={{ ...card, padding: 16, minWidth: 0, border: `1px solid ${alert ? tone.ring : 'var(--border-subtle)'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: alert ? tone.bg : 'var(--bg-elevated)',
                  }}>
                    <Package size={17} style={{ color: alert ? tone.fg : 'var(--brand-amber)' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{item.itemName}</div>
                    {(item.category || item.item_code) && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{[item.item_code, item.category].filter(Boolean).join(' · ')}</div>
                    )}
                    {lists.length > 0 && listFilter === 'all' && (
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {item.stock_list_name || 'Main stock'}
                      </div>
                    )}
                  </div>
                </div>

                {!isLinked(item) && (
                  <div data-unlinked style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '-2px 0 10px', padding: '6px 9px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', fontSize: '0.74rem', fontWeight: 600, color: '#b45309' }}>
                    Not linked to an item
                    {canWrite && (
                      <button type="button" onClick={() => setLinking(item)} aria-label={`Link ${item.itemName} to an item`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.45)', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, color: '#b45309' }}>
                        <Link2 size={12} /> Link
                      </button>
                    )}
                  </div>
                )}

                {/* The quantity, then the status. They wrap onto two lines
                    when a big quantity needs the width — the pill used to be
                    pushed out past the card's edge. */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, maxWidth: '100%' }}
                    title={`${fmtQty(qty)} ${item.uom || item.base_uom || 'units'}`}>
                    <span data-qty style={{ fontSize: '1.8rem', fontWeight: 800, color: alert ? tone.fg : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {fmtCompactQty(qty)}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{item.uom || item.base_uom || 'units'}</span>
                  </div>
                  <span style={{ ...pill(tone), flexShrink: 0, whiteSpace: 'nowrap' }} data-pill>
                    {alert ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}{status}
                  </span>
                </div>
                {(totals.get(itemKey(item))?.rows || 0) > 1 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    {Number(totals.get(itemKey(item)).qty).toLocaleString('en-IN')} {item.uom || ''} across {totals.get(itemKey(item)).rows} lists
                  </div>
                )}

                <div style={{
                  marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
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
                      Reorder at {Number(item.reorderLevel) > 0 ? fmtCompactQty(item.reorderLevel) : 'not set'}
                    </button>
                  )}

                  {/* The quantity itself. Opens a stock take rather than an
                      editable number: you enter what you counted and the
                      difference is written to the ledger with a reason. */}
                  {canWrite && !isEditing && (
                    <button
                      onClick={() => setCounting(item)}
                      title="Record a physical count, or write off damage"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'none', border: '1px solid var(--border-default)',
                        borderRadius: 7, padding: '4px 9px', cursor: 'pointer',
                        fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Scale size={12} /> Count
                    </button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div style={{ ...card, gridColumn: '1 / -1', padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              {onlyUnlinked && !search
                ? <>Every stock row here is linked to an item. <button type="button" className="btn-secondary" style={{ marginLeft: 6 }} onClick={() => setOnlyUnlinked(false)}>Show all stock</button></>
                : inventory.length === 0
                ? <>Nothing in stock yet. Upload your stock sheet (Excel or CSV) to bring it all in at once — or it appears as goods receipts and production are recorded.
                  {canWrite && <div><button onClick={() => setUploading(true)} className="btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet size={14} /> Upload stock sheet</button></div>}</>
                : search ? `Nothing matches “${search}”.` : 'Nothing in this list yet.'}
            </div>
          )}
        </div>
      )}

      {adding && <AddStockModal onClose={() => setAdding(false)} onSaved={reloadAll} lists={lists} held={inventory}
        defaultList={listFilter === 'all' ? 'main' : listFilter} />}
      {uploading && <StockUpload lists={lists} defaultTarget={listFilter === 'all' ? 'main' : listFilter} onClose={() => setUploading(false)}
        onDone={(r) => { reloadAll(); if (r?.list?.id) setListFilter(String(r.list.id)); }} />}
      {counting && <ItemStockPanel item={counting} onClose={() => setCounting(null)} onSaved={reloadAll} />}
      {linking && <StockLinkDialog item={linking} onClose={() => setLinking(null)} onLinked={reloadAll} />}
    </div>
  );
}
