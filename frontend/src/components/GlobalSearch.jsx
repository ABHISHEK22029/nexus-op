/* ══════════════════════════════════════════════════════════
   GlobalSearch — find anything, from anywhere. Ctrl+K.

   Finding INV-0007 or Apollo's order meant knowing which screen it lived
   on, opening it, and searching there. This is one box for everything:
   orders, invoices, quotations, challans, customers, purchase orders,
   vendor bills, vendors, production, products, materials, notes and
   enquiries — a few of each as you type, grouped, with how many there are.

   The idea is the agent portal's (a header search, results grouped by kind
   with counts, a result opens the record); the palette and the keyboard
   are ours: Ctrl+K or "/" from any screen, ↑ ↓ to move, Enter to open,
   Esc to close. Before anything is typed it shows what you opened last —
   kept in this browser only, per person.

   The server returns only this company's records and only the kinds your
   role may read (backend/controllers/SearchController).
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, ShoppingBag, Receipt, FileText, Truck, Users, ShoppingCart, Wallet,
  Building2, Factory, Package, Boxes, FileMinus, Inbox, Clock, CornerDownLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fmtINR } from '../lib/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ICONS = {
  customer_order: ShoppingBag, sales_invoice: Receipt, sales_quotation: FileText, delivery_challan: Truck,
  customer: Users, purchase_order: ShoppingCart, vendor_bill: Wallet, vendor: Building2,
  production_order: Factory, product: Package, material: Boxes, note: FileMinus, enquiry: Inbox,
};
const OPEN_EVENT = 'maks:open-search';
/* The field at the top of the side menu (panel), or the icon in the rail. */
export function SearchTrigger({ variant = 'panel' }) {
  const openIt = () => window.dispatchEvent(new Event(OPEN_EVENT));
  if (variant === 'rail') {
    return (
      <button type="button" className="nav-rail-item gs-rail" onClick={openIt} title={`Search everything (${isMac ? '⌘' : 'Ctrl'}+K)`} data-global-search="rail">
        <Search size={19} aria-hidden="true" />
        <span>Search</span>
      </button>
    );
  }
  return (
    <button type="button" className="gs-trigger" onClick={openIt} aria-label="Search everything" data-global-search="panel">
      <Search size={14} aria-hidden="true" />
      <span className="gs-trigger-text">Search</span>
      <kbd className="gs-kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const fmtDay = (d) => {
  if (!d) return '';
  const x = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/* What you opened last, in this browser, per person — a convenience, so a
   failure to read or write it is ignored. */
const recentKey = (user) => `maks_recent_open:${user?.id || 'anon'}`;
const readRecent = (user) => { try { return JSON.parse(localStorage.getItem(recentKey(user)) || '[]'); } catch { return []; } };
const rememberRecent = (user, item) => {
  try {
    const list = readRecent(user).filter(x => x.href !== item.href);
    localStorage.setItem(recentKey(user), JSON.stringify([item, ...list].slice(0, 8)));
  } catch { /* private mode */ }
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);

  /* Ctrl+K / Cmd+K anywhere; "/" when not typing in a field. */
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(o => !o); }
      else if (e.key === '/' && !typing && !open) { e.preventDefault(); setOpen(true); }
    };
    /* the side menu's search field and rail button open it too */
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, [open]);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 0); setActive(0); }
    else { setQ(''); setData(null); }
  }, [open]);

  /* As you type, a moment after the last key; an older answer arriving
     late never replaces a newer one. */
  useEffect(() => {
    const term = q.trim();
    if (!term) { setData(null); setLoading(false); return undefined; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/search?q=${encodeURIComponent(term)}`);
        const d = r.ok ? await r.json() : { groups: [], total: 0, error: true };
        if (mine === seq.current) { setData(d); setActive(0); }
      } catch { if (mine === seq.current) setData({ groups: [], total: 0, error: true }); }
      finally { if (mine === seq.current) setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const recent = useMemo(() => (open && !q.trim() ? readRecent(user) : []), [open, q, user]);
  /* every row in order, for ↑ ↓ */
  const flat = useMemo(() => (q.trim()
    ? (data?.groups || []).flatMap(g => g.items.map(it => ({ ...it, kind: g.kind, kindLabel: g.label })))
    : recent), [data, q, recent]);

  const go = (it) => {
    if (!it) return;
    rememberRecent(user, { href: it.href, title: it.title, party: it.party || null, kind: it.kind, kindLabel: it.kindLabel });
    setOpen(false);
    navigate(it.href);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
  };
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let idx = -1;
  const renderRow = (it, key) => {
    idx += 1;
    const i = idx;
    const Icon = ICONS[it.kind] || Search;
    return (
      <button key={key} type="button" data-idx={i} data-search-result={it.kind}
        className={`gs-row${i === active ? ' is-active' : ''}`}
        onMouseMove={() => setActive(i)} onClick={() => go(it)}>
        <span className="gs-row-icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="gs-row-main">
          <span className="gs-row-title">{it.title}</span>
          {(it.party || it.status || it.kindLabel) && (
            <span className="gs-row-sub">{[!q.trim() && it.kindLabel, it.party, it.status].filter(Boolean).join(' · ')}</span>
          )}
        </span>
        <span className="gs-row-side">
          {it.amount != null && <span className="gs-row-amount">{fmtINR(it.amount)}</span>}
          {it.date && <span className="gs-row-date">{fmtDay(it.date)}</span>}
        </span>
      </button>
    );
  };

  return (
    <>
      {open && (
        <div className="gs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="gs-panel" role="dialog" aria-modal="true" aria-label="Search everything">
            <div className="gs-input-row">
              <Search size={18} className="gs-input-icon" aria-hidden="true" />
              <input ref={inputRef} className="gs-input" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Search orders, invoices, customers, POs, products…" aria-label="Search" data-global-search-input
                autoComplete="off" spellCheck="false" />
              {loading && <span className="gs-spinner" aria-hidden="true" />}
              <button type="button" className="gs-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>

            <div className="gs-results" ref={listRef}>
              {!q.trim() ? (
                recent.length > 0 ? (
                  <div className="gs-group">
                    <div className="gs-group-head"><Clock size={12} aria-hidden="true" /> Recently opened</div>
                    {recent.map(it => renderRow(it, it.href))}
                  </div>
                ) : (
                  <div className="gs-empty">
                    Type a number, a name or a few words — <b>INV-0007</b>, <b>apollo</b>, <b>ms plate</b>.
                    <div className="gs-empty-sub">Words can be in any order: "apollo 0007" finds Apollo's invoice INV-0007.</div>
                  </div>
                )
              ) : data?.error ? (
                <div className="gs-empty">Search isn't answering right now. Try again in a moment.</div>
              ) : data && !data.groups.length && !loading ? (
                <div className="gs-empty">Nothing matches "<b>{q.trim()}</b>". Try fewer words, or part of a number.</div>
              ) : (
                (data?.groups || []).map(g => (
                  <div key={g.kind} className="gs-group">
                    <div className="gs-group-head">
                      {g.label}
                      <span className="gs-group-count">{g.total > g.items.length ? `${g.items.length} of ${g.total}` : g.total}</span>
                    </div>
                    {g.items.map(it => renderRow({ ...it, kind: g.kind, kindLabel: g.label }, `${g.kind}-${it.id}`))}
                  </div>
                ))
              )}
            </div>

            <div className="gs-foot" aria-hidden="true">
              <span><kbd className="gs-kbd">↑</kbd><kbd className="gs-kbd">↓</kbd> to move</span>
              <span><kbd className="gs-kbd"><CornerDownLeft size={10} /></kbd> to open</span>
              <span><kbd className="gs-kbd">Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
