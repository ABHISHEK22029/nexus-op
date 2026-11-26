/* ══════════════════════════════════════════════════════════════════════
   Editing a document on its own page, where it is printed from.

   The owner's words: "the edit option on the view page should always be
   there for any edit to any place in the view itself … edit it easily on
   the print page before printing, and the change stored on the server".

   How it works, for every document that uses it:
     · "Edit" in the toolbar, or a click on anything editable on the sheet
       (it lights up under the pointer), turns the sheet into its own form:
       the fields sit where the text was, in the document's own type, so
       nothing jumps and the layout is the one that prints.
     · What can change follows where the document has got to, and mirrors
       what the server allows: a draft invoice, everything; an issued one,
       only its notes, terms, due date and e-way bill (GST corrects an
       issued invoice with a credit or debit note). The bar says which.
     · Totals and tax are worked out again as you type (lib/docTotals).
     · Save sends only what changed. The server checks it and works the
       figures out itself; the page then reloads the document from the
       server, so the print and the PDF show exactly what was stored.
       Refused, the form stays as typed with the reason in the bar.
     · Cancel, Esc, or leaving the page with changes asks first.
     · Print and PDF are put away while editing: what prints is what was
       saved. (A Ctrl+P mid-edit still prints the fields as plain text.)

   Pieces: useDocEdit (the state), EditBar (the bar with Save and Cancel),
   Field (an input that sits in the document), Spot (marks a piece of the
   sheet as click-to-edit), onSheetClick (opens the editor at that piece).
   Styles in DocEdit.css (prefix de-).
   ══════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Check, X, AlertTriangle } from 'lucide-react';
import { useLeaveGuard } from '../lib/useLeaveGuard';
import './DocEdit.css';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useDocEdit() {
  const [state, setState] = useState(null);          // { original, draft }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tried, setTried] = useState(false);         // a save was attempted: show every problem
  const [focus, setFocus] = useState(null);

  const editing = !!state;
  const dirty = editing && !same(state.original, state.draft);
  useLeaveGuard(dirty);

  const start = useCallback((values, field) => {
    setState({ original: values, draft: values });
    setError(null); setTried(false); setFocus({ field: field || null, at: Date.now() });
  }, []);
  const stop = useCallback(() => { setState(null); setError(null); setTried(false); setSaving(false); }, []);
  const update = useCallback((fn) => { setState((s) => (s ? { ...s, draft: fn(s.draft) } : s)); setError(null); }, []);
  const set = useCallback((k, v) => update((d) => ({ ...d, [k]: v })), [update]);
  const merge = useCallback((obj) => update((d) => ({ ...d, ...obj })), [update]);
  const setItem = useCallback((i, p) => update((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...p } : it)) })), [update]);
  const addItem = useCallback((blank) => {
    update((d) => ({ ...d, items: [...d.items, blank] }));
    setFocus({ field: 'new-line', at: Date.now() });
  }, [update]);
  const removeItem = useCallback((i) => update((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) })), [update]);
  /** The keys whose value differs from when editing began. */
  const changed = useCallback((keys) => (state ? (keys || Object.keys(state.draft)).filter((k) => !same(state.draft[k], state.original[k])) : []), [state]);

  /* Put the cursor where the click was: the field for that piece of the
     sheet, else the first field. A new line: its description. */
  useEffect(() => {
    if (!editing || !focus) return undefined;
    const t = setTimeout(() => {
      /* Someone already typing in a field keeps their cursor: moving it
         would send the rest of what they type into another field. */
      if (focus.field !== 'new-line' && document.activeElement?.matches?.('[data-de-input], .de-in')) return;
      let el = null;
      if (focus.field === 'new-line') {
        const all = document.querySelectorAll('[data-de-input^="line-"][data-de-input$="-description"]');
        el = all[all.length - 1];
      } else if (focus.field) el = document.querySelector(`[data-de-input="${focus.field}"]`);
      el = el || document.querySelector('[data-de-input]');
      if (!el) return;
      el.focus({ preventScroll: false });
      if (el.tagName === 'INPUT' && !['date', 'number'].includes(el.type)) { try { el.select(); } catch { /* not selectable */ } }
    }, 40);
    return () => clearTimeout(t);
  }, [editing, focus]);

  return {
    editing, dirty, saving, setSaving, error, setError, tried, setTried,
    draft: state?.draft, original: state?.original,
    start, stop, set, merge, setItem, addItem, removeItem, changed,
  };
}

/** The bar above the sheet while editing: what can change, Save, Cancel,
    and why a save was refused. Ctrl/⌘+S saves; Esc cancels. */
export function EditBar({ ed, what, scope, problems = [], onSave, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!ed.saving) onSave(); }
      else if (e.key === 'Escape' && !e.target.closest?.('select')) { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed.saving, onSave, onCancel]);

  const shown = ed.tried ? problems : [];
  const message = ed.error || shown[0];
  return (
    <div className="de-bar print:hidden" role="region" aria-label={`Editing ${what}`} data-de-bar>
      <div className="de-bar-text">
        <div className="de-bar-title"><Pencil size={15} aria-hidden="true" /> Editing {what}</div>
        <div className="de-bar-scope">{scope}</div>
      </div>
      <div className="de-bar-actions">
        <span className={`de-bar-state${ed.dirty ? ' is-dirty' : ''}`} data-de-state>{ed.dirty ? 'Not saved yet' : 'No changes yet'}</span>
        <button type="button" className="de-btn" onClick={onCancel} disabled={ed.saving} data-de-cancel><X size={15} /> Cancel</button>
        <button type="button" className="de-btn is-primary" onClick={onSave} disabled={ed.saving} data-de-save>
          <Check size={15} /> {ed.saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      {message && (
        <div className="de-bar-error" role="alert" data-de-error>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{message}{!ed.error && shown.length > 1 ? ` (and ${shown.length - 1} more)` : ''}</span>
        </div>
      )}
    </div>
  );
}

/** An input that sits in the document, in its own type. `as`: input,
    textarea (grows with what is typed) or select. `name` ties it to the
    piece of the sheet that opened the editor (data-de-input). */
export function Field({ as = 'input', name, label, value, onChange, invalid, align, mono, width, minRows = 1, className = '', style, children, ...rest }) {
  const common = {
    className: `de-in${align === 'right' ? ' is-right' : ''}${align === 'center' ? ' is-center' : ''}${mono ? ' is-mono' : ''} ${className}`.trim(),
    'aria-label': label,
    'aria-invalid': invalid ? true : undefined,
    'data-de-input': name,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    style: { ...(width ? { width } : null), ...style },
    ...rest,
  };
  if (as === 'textarea') {
    const rows = Math.max(minRows, String(value ?? '').split('\n').length);
    return <textarea rows={rows} {...common} />;
  }
  if (as === 'select') return <select {...common}>{children}</select>;
  return <input autoComplete="off" {...common} />;
}

/** Marks a piece of the sheet as click-to-edit while it is not being
    edited. Renders its children unchanged when `on` is false. */
export function Spot({ field, on, children, block, className = '' }) {
  if (!on) return children;
  const Tag = block ? 'div' : 'span';
  return <Tag data-de-field={field} className={`de-spot ${className}`.trim()} title="Click to edit">{children}</Tag>;
}

/** A click on the sheet: if it landed on something editable (and not on a
    link or a control of its own), open the editor there. */
export const onSheetClick = (ed, begin) => (e) => {
  if (ed.editing) return;
  if (e.target.closest('a, button, select, input, textarea, label')) return;
  const spot = e.target.closest('[data-de-field]');
  if (spot) begin(spot.getAttribute('data-de-field'));
};

/** An unsaved document asks before its changes are thrown away. */
export async function confirmDiscard(ed, confirm) {
  if (!ed.dirty) return true;
  return confirm({ title: 'Discard your changes?', message: 'What you changed on this document has not been saved.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', tone: 'danger' });
}
