/* ══════════════════════════════════════════════════════════════════════
   History — every change to a document, on the document's own page.

   The owner's words: "any thing might get change anytime and we should be
   able to hold all those things in line". So each change made on the
   page (or by its status, sign-off or dispatch) is kept by the server
   (backend/shared/docHistory): the document as it was just before and
   just after, who changed it and when.

   Here:
     · History, in the toolbar, opens a panel of the changes, newest
       first, each said in words — "Rate, line 2: ₹120.00 → ₹130.00".
     · Any earlier version can be shown on the page itself, in the same
       layout, and printed as it was. A bar above the sheet says which
       version it is; editing waits until you go back to the current one.

   Pieces: useDocHistory (the state), HistoryButton, HistoryPanel,
   VersionBar. Styles in DocHistory.css (prefix dh-).
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { History, X, Eye, ArrowLeft, Printer } from 'lucide-react';
import './DocHistory.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ACTION = { edit: 'Edited', status: 'Status changed', approval: 'Sign-off', dispatch: 'Dispatched' };

export const when = (at) => {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* path: the documents' API path (sales-invoices). apply(copy): put an
   earlier copy on the page. reload(): fetch the current document again. */
export function useDocHistory({ path, id, apply, reload }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);     // null while loading
  const [err, setErr] = useState('');
  const [viewing, setViewing] = useState(null);

  const refresh = useCallback(() => {
    setList(null); setErr('');
    return fetch(`${API}/${path}/${id}/history`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || d.detail || 'The history could not be loaded.');
        setList(Array.isArray(d.versions) ? d.versions : []);
      })
      .catch(e => { setErr(e.message); setList([]); });
  }, [path, id]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);
  useEffect(() => { setViewing(null); setOpen(false); }, [id]);

  const view = (copy, meta) => {
    apply(copy);
    setViewing(meta);
    setOpen(false);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* old browser */ }
  };
  const back = async () => { setViewing(null); await reload(); };
  return { open, setOpen, list, err, viewing, view, back, refresh };
}

export function HistoryButton({ hist, className = 'btn-secondary btn-sm' }) {
  return (
    <button type="button" onClick={() => hist.setOpen(true)} className={className} data-doc-history
      title="Every change to this document — what changed, who changed it and when"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <History size={15} /> History
    </button>
  );
}

/* Versions, oldest = 1. Change j (oldest first) made version j + 2; the
   copy before the first change is version 1, as it was first saved. */
function versionsOf(list) {
  const rows = [...list].reverse();
  const out = rows.map((r, j) => ({
    n: j + 2, row: r, copy: r.after, at: r.at, by: r.by, action: r.action, changes: r.changes || [],
  }));
  if (rows.length) out.unshift({ n: 1, copy: rows[0].before, at: rows[0].before?.created_at || rows[0].before?.createdAt, first: true, changes: [] });
  return out.reverse();
}

export function HistoryPanel({ hist, what = 'this document' }) {
  const { open, setOpen, list, err } = hist;
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, setOpen]);
  if (!open) return null;
  const versions = list ? versionsOf(list) : [];
  const total = versions.length;
  return createPortal(
    <div className="dh-scrim print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }} data-history-panel>
      <aside className="dh-panel" role="dialog" aria-modal="true" aria-label={`History of ${what}`}>
        <header className="dh-head">
          <div>
            <div className="dh-eyebrow">History</div>
            <h2 className="dh-title">{what}</h2>
          </div>
          <button type="button" className="dh-close" onClick={() => setOpen(false)} aria-label="Close the history"><X size={18} /></button>
        </header>
        <div className="dh-body">
          {list === null && <p className="dh-quiet">Loading the changes…</p>}
          {list !== null && err && <p className="dh-error" role="alert">{err}</p>}
          {list !== null && !err && !versions.length && (
            <div className="dh-empty" data-history-empty>
              <p><strong>No changes yet.</strong></p>
              <p>From now on, every change to {what} is kept here: what changed, who changed it and when. Any earlier version can be opened and printed as it was.</p>
            </div>
          )}
          {versions.length > 0 && (
            <ol className="dh-list">
              {versions.map((v, i) => {
                const current = i === 0;
                const showing = hist.viewing?.n === v.n;
                return (
                  <li key={v.n} className={`dh-item${current ? ' is-current' : ''}${showing ? ' is-showing' : ''}`} data-history-version={v.n}>
                    <div className="dh-dot" aria-hidden="true" />
                    <div className="dh-item-main">
                      <div className="dh-item-head">
                        <span className="dh-vno">Version {v.n}{current ? ' · current' : ''}{v.first ? ' · as first saved' : ''}</span>
                        {!current && (
                          <button type="button" className="dh-view" data-history-view={v.n}
                            onClick={() => hist.view(v.copy, { n: v.n, of: total, at: v.at, by: v.by, first: !!v.first })}>
                            <Eye size={13} /> {showing ? 'Showing' : 'View'}
                          </button>
                        )}
                      </div>
                      <div className="dh-meta">
                        {v.first ? 'Before any change was made' : (ACTION[v.action] || 'Changed')}
                        {v.at && <> · {when(v.at)}</>}
                        {v.by && <> · {v.by}</>}
                      </div>
                      {v.changes.length > 0 && (
                        <ul className="dh-changes">
                          {v.changes.slice(0, 40).map((c, k) => (
                            <li key={k} data-history-change>
                              <span className="dh-field">{c.field}</span>
                              {c.from && c.to ? (
                                <span className="dh-vals"><s>{c.from}</s> <span aria-hidden="true">→</span><span className="dh-sr">changed to</span> <b>{c.to}</b></span>
                              ) : c.to ? <span className="dh-vals"><b>{c.to}</b></span>
                                : <span className="dh-vals"><s>{c.from}</s></span>}
                            </li>
                          ))}
                          {v.changes.length > 40 && <li className="dh-quiet">and {v.changes.length - 40} more</li>}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/* Above the sheet while an earlier version is on the page. */
export function VersionBar({ hist, onPrint, children }) {
  const v = hist.viewing;
  if (!v) return null;
  return (
    <div className="dh-bar print:hidden" role="status" data-version-bar>
      <div className="dh-bar-text">
        <History size={17} aria-hidden="true" />
        <span>
          <strong>Version {v.n} of {v.of}</strong>
          {v.first ? ' — as it was first saved' : v.at ? ` — saved ${when(v.at)}${v.by ? ` by ${v.by}` : ''}` : ''}.
          {' '}This is an earlier copy, not the current document.
        </span>
      </div>
      <div className="dh-bar-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={() => hist.setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <History size={15} /> All versions
        </button>
        {children}
        {onPrint && (
          <button type="button" className="btn-secondary btn-sm" onClick={onPrint} data-version-print style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Printer size={15} /> Print this version
          </button>
        )}
        <button type="button" className="btn-primary btn-sm" onClick={hist.back} data-version-back style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> Back to the current version
        </button>
      </div>
    </div>
  );
}
