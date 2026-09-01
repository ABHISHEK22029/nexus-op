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
import { Search, X, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

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

  return {
    ...state,
    search, setSearch,
    filters, setFilters,
    setFilter: (k, v) => setFilters(f => ({ ...f, [k]: f[k] === v ? '' : v })),
    // Keeps the baseline (e.g. the active project); drops everything else.
    clear: () => {
      setSearch('');
      setFilters(f => Object.fromEntries(baseKeys.map(k => [k, f[k]])));
    },
    isFiltered,
    offset, setOffset, pageSize,
    reload: load,
  };
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
