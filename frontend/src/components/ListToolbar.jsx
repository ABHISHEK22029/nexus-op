/* ══════════════════════════════════════════════════════════
   ListToolbar + useListQuery — search, filter and paginate any list.

   The stakeholder complaint was blunt: there was no way to find anything.
   Every list rendered every row it had, unfiltered and unpaginated, which
   is fine with the eleven demo records and useless the day a real business
   has four thousand invoices.

   Two things this deliberately gets right, because they are what makes a
   filter usable rather than merely present:

   · "No invoices yet" and "No invoices match 'apolo'" are different
     situations and get different empty states. Showing the first when the
     second is true is how people conclude their data is gone.

   · The result count is always visible. A filtered list that looks
     identical to an unfiltered one, minus some rows, is how people miss
     that a filter is still applied and conclude records are missing.

   Server-side throughout — searching in the browser only works while the
   browser already has every row, which is the thing we are fixing.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronLeft, ChevronRight, SlidersHorizontal, BookmarkPlus } from 'lucide-react';

import { getToken } from '../lib/apiAuth';
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/** Data hook. Owns the query string so pages don't each reinvent it.
 *
 *  `initialFilters` is a BASELINE, not a starting position the user can
 *  clear their way out of. Several pages are scoped to the active project
 *  and pass it here; if "Clear filters" wiped it, clearing would silently
 *  widen the list to every project. For the same reason the baseline keys
 *  don't count towards `isFiltered` — otherwise a scoped page would always
 *  claim to be filtered, permanently offer a Clear button, and never show
 *  "no records yet" (only ever "nothing matched your filters", which sends
 *  people looking for data that was never there).
 *
 *  Pages that pass no `initialFilters` are unaffected. */
export function useListQuery(endpoint, { pageSize = 25, initialFilters = {} } = {}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const baseKeys = Object.keys(initialFilters);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ rows: [], total: 0, summary: null, loading: true, error: null });
  const reqId = useRef(0);

  // Debounce typing; a request per keystroke is a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to what we're asking for resets to the first page — otherwise
  // you search, stay on page 4, and see an empty list.
  useEffect(() => { setOffset(0); }, [debounced, JSON.stringify(filters)]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState(s => ({ ...s, loading: true, error: null }));
    const qs = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (debounced.trim()) qs.set('search', debounced.trim());
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    try {
      const token = getToken();
      const res = await fetch(`${API}/${endpoint}?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `Could not load (${res.status})`);
      }
      const data = await res.json();
      // Stale response from a superseded request — drop it.
      if (id !== reqId.current) return;
      const rows = Array.isArray(data) ? data : (data.items || []);
      const total = Array.isArray(data) ? data.length : (data.total ?? rows.length);
      /* Aggregates over the whole filtered set, when the endpoint supplies
         them. Pages must use these rather than summing `rows`, which after
         pagination is only the current page. */
      const summary = Array.isArray(data) ? null : (data.summary ?? null);
      setState({ rows, total, summary, loading: false, error: null });
    } catch (e) {
      if (id !== reqId.current) return;
      setState({ rows: [], total: 0, summary: null, loading: false, error: e.message });
    }
  }, [endpoint, pageSize, offset, debounced, JSON.stringify(filters)]);

  useEffect(() => { load(); }, [load]);

  const isFiltered = Boolean(debounced.trim())
    || Object.entries(filters).some(([k, v]) => v && !baseKeys.includes(k));

  /* ── Bulk selection ──────────────────────────────────────
     Selection is keyed by row id and cleared whenever the result set
     changes. Keeping a selection across a filter change is how someone
     deletes twelve records they can no longer see — the checkbox said
     "12 selected" and they had no way to know which twelve. */
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => { setSelected(new Set()); }, [debounced, JSON.stringify(filters), offset]);

  const pageIds = state.rows.map(r => r.id).filter(v => v != null);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  const selection = {
    ids: [...selected],
    count: selected.size,
    has: (id) => selected.has(id),
    toggle: (id) => setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    }),
    /* Selects only what is ON SCREEN, never the whole filtered set. "Select
       all" that silently spans pages you never looked at is how a bulk
       delete goes wrong. */
    toggleAllOnPage: () => setSelected(s => {
      const n = new Set(s);
      if (allOnPageSelected) pageIds.forEach(id => n.delete(id));
      else pageIds.forEach(id => n.add(id));
      return n;
    }),
    allOnPageSelected,
    clear: () => setSelected(new Set()),
  };

  return {
    ...state,
    search, setSearch,
    filters, setFilters,
    setFilter: (k, v) => setFilters(f => ({ ...f, [k]: f[k] === v ? '' : v })),
    // Keeps the baseline (e.g. the active project); drops everything else.
    clear: () => {
      setSearch('');
      setFilters(f => Object.fromEntries(baseKeys.map(k => [k, f[k]])));
      setSelected(new Set());
    },
    isFiltered,
    offset, setOffset, pageSize,
    reload: load,
    selection,
    endpoint,
  };
}

/* ══════════════════════════════════════════════════════════
   Saved views — a filter combination you use often, given a name.

   Zoho calls these Custom Views and they are the single most-used thing on
   a list page there, because real work is repetitive: "overdue invoices",
   "unpaid, this vendor", "low stock". Rebuilding the same filter every
   morning is the tax a list page charges when it can't remember.

   Stored per endpoint in localStorage — per browser, not per account. That
   is a deliberate limit for now rather than an oversight: server-side views
   need a table and a sharing model, and a personal shortcut that works
   today beats a shared one that doesn't exist.
   ══════════════════════════════════════════════════════════ */
const VIEWS_KEY = (endpoint) => `maks_views_${endpoint}`;

export function useSavedViews(q) {
  const [views, setViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY(q.endpoint)) || '[]'); }
    catch { return []; }
  });

  const persist = (next) => {
    setViews(next);
    try { localStorage.setItem(VIEWS_KEY(q.endpoint), JSON.stringify(next)); } catch { /* private mode */ }
  };

  const save = (name) => {
    const view = { name, search: q.search, filters: q.filters };
    persist([...views.filter(v => v.name !== name), view]);
  };
  const apply = (v) => { q.setSearch(v.search || ''); q.setFilters(v.filters || {}); };
  const remove = (name) => persist(views.filter(v => v.name !== name));

  return { views, save, apply, remove };
}

/** The visible controls. */
export function ListToolbar({ q, placeholder = 'Search…', filters = [], right = null }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={q.search}
          onChange={e => q.setSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{
            width: '100%', padding: '9px 32px 9px 34px', fontSize: '0.86rem',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            border: '1px solid var(--border-default)', borderRadius: 9, outline: 'none',
          }}
        />
        {q.search && (
          <button onClick={() => q.setSearch('')} aria-label="Clear search"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {filters.map(f => (
        <div key={f.key} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {f.label && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><SlidersHorizontal size={12} />{f.label}</span>}
          {f.options.map(o => {
            const active = q.filters[f.key] === o.value;
            return (
              <button key={o.value} onClick={() => q.setFilter(f.key, o.value)}
                aria-pressed={active}
                style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                  background: active ? 'rgba(245,158,11,0.14)' : 'var(--bg-surface)',
                  color: active ? '#b45309' : 'var(--text-muted)',
                }}>
                {o.label}
              </button>
            );
          })}
        </div>
      ))}

      {q.isFiltered && (
        <button onClick={q.clear} className="btn-secondary" style={{ fontSize: '0.76rem', padding: '5px 11px' }}>
          Clear filters
        </button>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Always visible: a filtered list that looks like an unfiltered one
            is how people conclude records have vanished. */}
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {q.loading ? 'Loading…'
            : q.isFiltered ? `${q.total} match${q.total === 1 ? '' : 'es'}`
            : `${q.total} total`}
        </span>
        {right}
      </div>
    </div>
  );
}

/** Page controls. Renders nothing when everything already fits. */
export function Pagination({ q }) {
  if (q.total <= q.pageSize) return null;
  const from = q.offset + 1;
  const to = Math.min(q.offset + q.pageSize, q.total);
  const btn = (disabled) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 10px', fontSize: '0.8rem', borderRadius: 8,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 2px 0' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {from}–{to} of {q.total}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={q.offset === 0} onClick={() => q.setOffset(Math.max(0, q.offset - q.pageSize))} style={btn(q.offset === 0)}>
          <ChevronLeft size={14} /> Previous
        </button>
        <button disabled={to >= q.total} onClick={() => q.setOffset(q.offset + q.pageSize)} style={btn(to >= q.total)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/** Empty state that distinguishes "nothing here" from "nothing matched". */
export function EmptyState({ q, icon: Icon, noun = 'records', hint }) {
  if (q.loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>;

  if (q.error) return (
    <div style={{ padding: 36, textAlign: 'center' }}>
      <div style={{ fontWeight: 600, color: '#dc2626' }}>{q.error}</div>
      <button onClick={q.reload} className="btn-secondary" style={{ marginTop: 10 }}>Try again</button>
    </div>
  );

  if (q.isFiltered) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      {Icon && <Icon size={34} style={{ opacity: 0.3, marginBottom: 8 }} />}
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
        No {noun} match {q.search ? `“${q.search}”` : 'these filters'}
      </div>
      <button onClick={q.clear} className="btn-secondary" style={{ marginTop: 10 }}>Clear filters</button>
    </div>
  );

  return (
    <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
      {Icon && <Icon size={38} style={{ opacity: 0.35, marginBottom: 10 }} />}
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No {noun} yet</div>
      {hint && <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SavedViews — the named-filter strip that sits above a list.
   ══════════════════════════════════════════════════════════ */
export function SavedViews({ q }) {
  const { views, save, apply, remove } = useSavedViews(q);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const chip = (active) => ({
    fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: 999,
    cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--brand-amber)' : 'var(--border-default)'}`,
    background: active ? 'rgba(245,158,11,0.14)' : 'var(--bg-surface)',
    color: active ? '#b45309' : 'var(--text-muted)',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  });

  const matches = (v) =>
    (v.search || '') === (q.search || '') &&
    JSON.stringify(v.filters || {}) === JSON.stringify(q.filters || {});

  if (!views.length && !q.isFiltered) return null;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>
        Views
      </span>
      {views.map(v => {
        const active = matches(v);
        return (
          <span key={v.name} style={chip(active)}>
            <button onClick={() => apply(v)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
              {v.name}
            </button>
            <button onClick={() => remove(v.name)} title={`Delete "${v.name}"`} aria-label={`Delete view ${v.name}`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', opacity: 0.6 }}>
              <X size={11} />
            </button>
          </span>
        );
      })}

      {/* Only offered when something is actually filtered — saving the
          unfiltered list as a "view" would just be a button that does
          nothing. */}
      {q.isFiltered && !naming && (
        <button onClick={() => { setNaming(true); setName(''); }} style={{ ...chip(false), borderStyle: 'dashed' }}>
          <BookmarkPlus size={12} /> Save this view
        </button>
      )}
      {naming && (
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) { save(name.trim()); setNaming(false); }
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="Name this view…"
            style={{ fontSize: '0.78rem', padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', width: 150 }}
          />
          <button className="btn-primary btn-sm" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
            disabled={!name.trim()} onClick={() => { save(name.trim()); setNaming(false); }}>Save</button>
          <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }}
            onClick={() => setNaming(false)}>Cancel</button>
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BulkBar — appears only when rows are selected.

   Replaces the pattern of a delete icon on every single row: acting on
   twelve records meant twelve confirmations. It states the count in the
   confirm text, because "Delete 12 vendors?" is a different question from
   "Delete this vendor?" and deserves to read like one.
   ══════════════════════════════════════════════════════════ */
export function BulkBar({ q, actions = [], noun = 'records' }) {
  if (!q.selection.count) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '9px 14px', marginBottom: 10, borderRadius: 10,
      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
    }}>
      <strong style={{ fontSize: '0.84rem', color: '#b45309' }}>
        {q.selection.count} {noun.replace(/s$/, '')}{q.selection.count === 1 ? '' : 's'} selected
      </strong>
      <span style={{ flex: 1 }} />
      {actions.map(a => (
        <button key={a.label} onClick={() => a.onClick(q.selection.ids)}
          className={a.danger ? 'btn-secondary' : 'btn-secondary'}
          style={{ fontSize: '0.78rem', padding: '4px 11px', color: a.danger ? '#dc2626' : undefined, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {a.icon} {a.label}
        </button>
      ))}
      <button onClick={q.selection.clear} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 11px' }}>
        Clear
      </button>
    </div>
  );
}

/** Header checkbox — selects only what is on screen. */
export function SelectAllCell({ q }) {
  return (
    <th style={{ padding: '11px 0 11px 14px', width: 34 }}>
      <input
        type="checkbox"
        checked={q.selection.allOnPageSelected}
        onChange={q.selection.toggleAllOnPage}
        aria-label="Select all rows on this page"
        style={{ cursor: 'pointer', width: 15, height: 15 }}
      />
    </th>
  );
}

/** Row checkbox. stopPropagation so ticking a box never opens the record. */
export function SelectCell({ q, id }) {
  return (
    <td style={{ padding: '12px 0 12px 14px', width: 34 }} onClick={e => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={q.selection.has(id)}
        onChange={() => q.selection.toggle(id)}
        aria-label="Select row"
        style={{ cursor: 'pointer', width: 15, height: 15 }}
      />
    </td>
  );
}
