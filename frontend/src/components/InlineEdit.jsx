/* ══════════════════════════════════════════════════════════
   Edit a value in place, on the document itself.

   Until now a wrong invoice number meant deleting the invoice and raising
   another — which is how a numbering series ends up with holes in it, and
   holes in a series are what an auditor asks about.

   Click the value, change it, press Enter. Escape abandons the edit.
   Nothing about the document moves while you do it: the input is sized and
   styled to sit exactly where the text was, because a field that jumps when
   you click it makes a careful person check the rest of the page.

   `canEdit` comes from the document's status, and mirrors what the server
   allows — but the server is the authority. If it refuses, the old value
   comes straight back and the reason is shown, rather than leaving the
   screen claiming a change that did not happen.

   Never rendered as an input on paper: the wrapper carries `print:hidden`
   on the pencil and the input inherits the document's own type styles.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

export default function InlineEdit({
  value,
  field,
  onSave,                 // (field, value) => Promise<{ok, error}>
  canEdit = true,
  type = 'text',
  placeholder = '—',
  title,                  // why it cannot be edited, when it cannot
  format = (v) => v,      // how it reads when not being edited
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select?.(); } }, [editing]);

  const commit = async () => {
    if (String(draft) === String(value ?? '')) { setEditing(false); return; }
    setBusy(true); setError(null);
    const res = await onSave(field, draft);
    setBusy(false);
    if (res?.ok) { setEditing(false); return; }
    /* Put the document back the way it was and say why. */
    setDraft(value ?? '');
    setError(res?.error || 'Could not save');
  };

  const cancel = () => { setDraft(value ?? ''); setEditing(false); setError(null); };

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <strong>{format(value) || placeholder}</strong>
        {canEdit && (
          <button
            type="button"
            className="print:hidden"
            onClick={() => setEditing(true)}
            title={`Edit ${field.replace(/_/g, ' ')}`}
            aria-label={`Edit ${field.replace(/_/g, ' ')}`}
            style={{ border: 0, background: 'transparent', padding: 2, cursor: 'pointer',
                     color: 'var(--text-muted)', display: 'inline-flex', lineHeight: 0 }}
          >
            <Pencil size={12} />
          </button>
        )}
        {!canEdit && title && (
          <span className="print:hidden" title={title}
            style={{ fontSize: '0.68rem', color: 'var(--text-disabled)' }}>🔒</span>
        )}
        {error && <span className="print:hidden" style={{ fontSize: '0.7rem', color: '#dc2626' }}>{error}</span>}
      </span>
    );
  }

  return (
    <span className="print:hidden" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        ref={inputRef}
        type={type}
        value={draft}
        disabled={busy}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        aria-label={field.replace(/_/g, ' ')}
        style={{
          font: 'inherit', fontWeight: 700, color: 'var(--text-primary)',
          background: 'var(--bg-elevated)', border: '1px solid var(--brand-amber)',
          borderRadius: 5, padding: '1px 6px', minWidth: 120, maxWidth: 220, outline: 'none',
        }}
      />
      <button type="button" onClick={commit} disabled={busy} aria-label="Save"
        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#16a34a', lineHeight: 0, padding: 2 }}>
        {busy ? <Loader2 size={13} /> : <Check size={14} />}
      </button>
      <button type="button" onClick={cancel} disabled={busy} aria-label="Cancel"
        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0, padding: 2 }}>
        <X size={14} />
      </button>
    </span>
  );
}
