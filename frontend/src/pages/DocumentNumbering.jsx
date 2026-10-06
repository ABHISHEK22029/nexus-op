/* ══════════════════════════════════════════════════════════
   Settings → Document numbering.

   A business moving over from Tally or a spreadsheet is already somewhere
   in its series — invoice 147 of this financial year, say — and the very
   first invoice it raises here has to be 148, in its own format. Until now
   every series was INV-0001 and could not be changed, so that first
   invoice was wrong before anyone had typed a line.

   Each row is one series: how the number is written (prefix + digits) and
   what the next one will be. The preview is the exact number the next
   document gets — computed by the server, which also skips any number
   already used — so what this screen promises is what happens.

   Nothing here touches a number already on a document.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Hash, Save, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* The financial year as the server writes it into {FY}: 2026-27 for an
   April year. Only for the live preview while typing — the saved preview
   always comes back from the server. */
function fyNow(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
const preview = (prefix, pad, seq) =>
  String(prefix || '').replace(/\{FY\}/gi, fyNow()) + String(seq || 1).padStart(Number(pad) || 1, '0');

export default function DocumentNumbering() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');

  const load = () => fetch(`${API}/document-series`)
    .then(r => (r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.detail || d.error || 'Could not load')))))
    .then(d => { setRows(d); setEdits({}); })
    .catch(e => setLoadError(e.message));
  useEffect(() => { load(); }, []);

  const val = (row, k) => (edits[row.docType]?.[k] ?? (k === 'nextSeq' ? row.nextSeq : row[k]));
  const set = (row, k, v) => {
    setEdits(e => ({ ...e, [row.docType]: { ...e[row.docType], [k]: v } }));
    setErrors(e => ({ ...e, [row.docType]: null }));
  };
  const dirty = (row) => !!edits[row.docType] && Object.keys(edits[row.docType]).length > 0;

  const save = async (row) => {
    setSaving(row.docType);
    try {
      const body = {
        prefix: val(row, 'prefix'),
        pad: Number(val(row, 'pad')),
        nextSeq: String(val(row, 'nextSeq') ?? '').trim(),
      };
      const r = await fetch(`${API}/document-series/${row.docType}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErrors(e => ({ ...e, [row.docType]: d.error || d.detail || 'Could not save' })); return; }
      setRows(list => list.map(x => (x.docType === row.docType ? d : x)));
      setEdits(e => { const n = { ...e }; delete n[row.docType]; return n; });
      if (d.warning) toast.error(d.warning);
      else toast.success(`${d.label}: the next one will be ${d.nextNumber}`);
    } finally { setSaving(null); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 };
  const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', width: '100%' };
  const th = { padding: '10px 12px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' };

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Hash size={20} style={{ color: 'var(--brand-amber)' }} /> Document numbering
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4, maxWidth: '72ch' }}>
          Set how each document is numbered and what the next number is — for example, carry on from
          invoice 147 in your old books. Numbers already on documents never change.
        </p>
      </div>

      <div style={{ ...card, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
        <Info size={16} style={{ flex: 'none', marginTop: 2, color: 'var(--brand-amber)' }} />
        <div>
          Put <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{'{FY}'}</code> in a prefix to print the
          financial year — <code style={{ fontFamily: 'var(--font-mono)' }}>KBS/{'{FY}'}/</code> gives{' '}
          <b style={{ fontFamily: 'var(--font-mono)' }}>{preview('KBS/{FY}/', 3, 148)}</b>. A series with the year in it
          starts again at 1 each April. GST allows at most 16 characters, using letters, digits, “-” and “/”.
        </div>
      </div>

      {loadError && (
        <div style={{ ...card, padding: 14, color: '#dc2626', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} /> {loadError}
        </div>
      )}
      {!rows && !loadError && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {rows && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Document</th>
                <th style={{ ...th, width: 200 }}>Prefix</th>
                <th style={{ ...th, width: 110 }}>Digits</th>
                <th style={{ ...th, width: 140 }}>Next number</th>
                <th style={th}>Next document</th>
                <th style={{ ...th, width: 96 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const p = val(row, 'prefix'), d = val(row, 'pad'), n = val(row, 'nextSeq');
                const shown = dirty(row) ? preview(p, d, n) : row.nextNumber;
                const err = errors[row.docType];
                return (
                  <tr key={row.docType}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                      {row.label}
                      {row.perYear && <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>restarts each financial year</div>}
                    </td>
                    <td style={td}>
                      <input style={{ ...input, fontFamily: 'var(--font-mono)' }} value={p ?? ''}
                        onChange={e => set(row, 'prefix', e.target.value)} aria-label={`${row.label} prefix`} placeholder="none" />
                    </td>
                    <td style={td}>
                      <select style={input} value={d} onChange={e => set(row, 'pad', e.target.value)} aria-label={`${row.label} digits`}>
                        {[1, 2, 3, 4, 5, 6].map(k => <option key={k} value={k}>{k} ({'0'.repeat(k - 1)}1)</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input style={{ ...input, fontFamily: 'var(--font-mono)' }} inputMode="numeric" value={n ?? ''}
                        onChange={e => set(row, 'nextSeq', e.target.value.replace(/[^\d]/g, ''))} aria-label={`${row.label} next number`} />
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{shown || '—'}</span>
                      {shown && shown.length > 16 && (
                        <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 2 }}>{shown.length} characters — GST allows 16</div>
                      )}
                      {err && <div role="alert" style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>{err}</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {dirty(row) ? (
                        <button className="btn-primary btn-sm" disabled={saving === row.docType} onClick={() => save(row)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Save size={14} /> {saving === row.docType ? 'Saving…' : 'Save'}
                        </button>
                      ) : (
                        <CheckCircle2 size={16} style={{ color: 'var(--text-disabled)' }} aria-label="Saved" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
