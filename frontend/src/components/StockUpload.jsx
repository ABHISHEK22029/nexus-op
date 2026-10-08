/* ══════════════════════════════════════════════════════════
   Upload a stock sheet — Excel or CSV, in the business's own columns.

   1. Choose the file and where it goes (main stock, a list, or a new list).
   2. See what was understood: which column is which (changeable), and,
      row by row, what will happen — new item, recount, or a problem.
   3. If items are already held, say how to treat them: update the counts
      to the sheet, add the sheet to them, or keep the sheet as a separate
      stock list.

   Nothing is saved until the last button. The server reads the file again
   on that click and does exactly what the review showed.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Shell } from './StockActions';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const label = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none',
};
const muted = { fontSize: '0.76rem', color: 'var(--text-muted)' };
const RED = '#dc2626';
const GREEN = '#059669';
const AMBER = '#b45309';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 4 }));
const newRef = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/* A sheet to start from, in the columns this reads best. */
const TEMPLATE = 'Item code,Item name,Quantity,Unit,Rate,Reorder level,Category,Location\r\n'
  + 'MS-PL-10,MS Plate 10mm,1200,kg,62.50,300,Steel,Yard 1\r\n'
  + 'BLT-M12-50,Hex bolt M12 x 50,450,nos,8,100,Fasteners,Rack B\r\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'stock-sheet-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS = {
  new: { text: 'New item', fg: GREEN },
  match: { text: 'Already held', fg: 'var(--text-secondary)' },
  error: { text: 'Left out', fg: RED },
};

export default function StockUpload({ lists = [], defaultTarget = 'main', onClose, onDone }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const uploadId = useRef(newRef());
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState(defaultTarget || 'main');     // 'main' | list id | 'new'
  const [newList, setNewList] = useState('');
  /* Column choices the person changed; until then, the server's guess. */
  const [mapping, setMapping] = useState(null);
  const [plan, setPlan] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');                                // 'set' | 'add' — only when items are already held
  const [newItemsAs, setNewItemsAs] = useState('material');
  const [show, setShow] = useState('all');

  const form = (extra = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (target === 'new') fd.append('newList', newList.trim());
    else fd.append('target', String(target));
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  };

  /* Read (again) whenever the file, the destination or a column choice
     changes. Each review carries the choices it was made for, and Save is
     only offered while those are still the choices on screen — so what is
     saved is always what was shown. */
  const waitingForName = target === 'new' && !newList.trim();
  const currentKey = JSON.stringify([file?.name, file?.size, file?.lastModified, String(target), target === 'new' ? newList.trim() : '', mapping]);
  useEffect(() => {
    if (!file || waitingForName) return undefined;
    const key = currentKey;
    let gone = false;
    const t = setTimeout(async () => {
      setReading(true); setError('');
      try {
        const res = await fetch(`${API}/inventory/import/plan`, { method: 'POST', body: form() });
        const body = await res.json().catch(() => ({}));
        if (gone) return;
        if (!res.ok) { setPlan(null); setError(body.error || 'The sheet could not be read'); return; }
        setPlan({ ...body, key });
      } catch (e) { if (!gone) setError(e.message || 'The sheet could not be read'); }
      finally { if (!gone) setReading(false); }
    }, target === 'new' ? 450 : 0);
    return () => { gone = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  const fresh = !!plan && plan.key === currentKey && !waitingForName;

  const chooseFile = (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB. Split the sheet and upload it in parts.'); return; }
    setFile(f); setMapping(null); setPlan(null); setMode(''); setError('');
  };

  const shown = mapping || plan?.mapping || {};
  const setColumn = (field, col) => setMapping(m => {
    const next = { ...(m || plan?.mapping || {}) };
    /* A column can serve one field: choosing it here clears it elsewhere. */
    Object.keys(next).forEach(k => { if (String(next[k]) === String(col)) delete next[k]; });
    if (col === '') delete next[field]; else next[field] = Number(col);
    return next;
  });

  const counts = plan?.counts;
  const usable = counts ? counts.new + counts.matched : 0;
  const needsMode = counts?.matched > 0;
  const listName = target === 'main' ? 'Main stock'
    : target === 'new' ? (newList.trim() || 'the new list')
      : (lists.find(l => String(l.id) === String(target))?.name || 'the list');

  const rows = useMemo(() => {
    const items = plan?.items || [];
    if (show === 'new') return items.filter(i => i.status === 'new');
    if (show === 'changes') return items.filter(i => i.status === 'match' && Math.abs(i.change) >= 0.0001);
    if (show === 'problems') return items.filter(i => i.status === 'error');
    return items;
  }, [plan, show]);

  const commit = async () => {
    if (!plan || !usable) return;
    if (needsMode && !mode) { toast.error('Choose what to do with the items you already hold.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/inventory/import/commit`, {
        method: 'POST',
        body: form({ mode: mode || 'set', newItemsAs, uploadId: uploadId.current }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The upload could not be saved');
      const parts = [];
      if (body.created) parts.push(`${body.created} new`);
      if (body.updated) parts.push(`${body.updated} ${body.mode === 'add' ? 'topped up' : 'recounted'}`);
      if (body.unchanged) parts.push(`${body.unchanged} unchanged`);
      const left = (body.problems || 0);
      toast.success(`${body.list.name}: ${parts.join(', ') || 'nothing to change'}${left ? ` · ${left} row${left > 1 ? 's' : ''} left out` : ''}`);
      onDone?.(body);
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const pill = (fg) => ({
    display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, color: fg,
    padding: '2px 8px', borderRadius: 999, border: '1px solid currentColor', whiteSpace: 'nowrap',
  });
  const tab = (key, text, n) => (
    <button type="button" key={key} onClick={() => setShow(key)} aria-pressed={show === key}
      style={{
        border: '1px solid var(--border-default)', borderRadius: 999, padding: '4px 11px', cursor: 'pointer',
        fontSize: '0.76rem', fontWeight: 600,
        background: show === key ? 'var(--text-primary)' : 'transparent',
        color: show === key ? 'var(--bg-surface)' : 'var(--text-secondary)',
      }}>{text} <span style={{ opacity: 0.75 }}>{n}</span></button>
  );

  return (
    <Shell
      width={860}
      title="Upload stock sheet"
      subtitle="Excel (.xlsx) or CSV, in your own column names. Nothing is saved until you confirm."
      icon={<FileSpreadsheet size={17} style={{ color: 'var(--brand-amber)' }} />}
      onClose={onClose}
      footer={<>
        {plan && counts && (
          <span style={{ ...muted, marginRight: 'auto', alignSelf: 'center' }}>
            {usable} of {counts.rows} row{counts.rows !== 1 ? 's' : ''} will be saved
            {counts.problems ? ` · ${counts.problems} left out` : ''}
          </span>
        )}
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={commit} className="btn-primary btn-sm"
          disabled={saving || reading || !fresh || !usable || plan.missing?.length > 0 || (needsMode && !mode)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          {saving ? 'Saving…' : usable ? `Save ${usable} item${usable !== 1 ? 's' : ''} to ${listName}` : 'Save'}
        </button>
      </>}
    >
      {/* 1 — the file and where it goes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={label}>Stock sheet</label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}
            style={{
              border: '1.5px dashed var(--border-default)', borderRadius: 10, padding: '14px 12px',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--bg-elevated)',
            }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Upload size={14} /> {file ? 'Choose another' : 'Choose file'}
            </button>
            <span style={{ ...muted, minWidth: 0, overflowWrap: 'anywhere' }}>
              {file ? <b style={{ color: 'var(--text-primary)' }}>{file.name}</b> : 'or drop it here · .xlsx or .csv, up to 5,000 rows'}
            </span>
            <input ref={fileRef} type="file" hidden
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <button type="button" onClick={downloadTemplate}
            style={{ marginTop: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', ...muted, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            <Download size={12} /> Download a sample sheet
          </button>
        </div>
        <div>
          <label style={label} htmlFor="su-target">Save into</label>
          <select id="su-target" style={input} value={String(target)} onChange={e => { setTarget(e.target.value); setMode(''); }}>
            <option value="main">Main stock</option>
            {lists.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
            <option value="new">+ A new stock list…</option>
          </select>
          {target === 'new' && (
            <input style={{ ...input, marginTop: 8 }} value={newList} onChange={e => setNewList(e.target.value)} maxLength={60}
              placeholder="Name it — e.g. Site store, Godown 2" aria-label="New stock list name" autoFocus />
          )}
          <p style={{ ...muted, margin: '6px 0 0' }}>
            A stock list keeps one place's stock apart from another's. Shortfalls count every list.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${RED}55`, background: `${RED}10`, color: RED, fontSize: '0.84rem', marginBottom: 14, display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} /> <span>{error}</span>
        </div>
      )}

      {file && waitingForName && (
        <div style={{ ...muted, padding: 18, textAlign: 'center' }}>Name the new stock list to see what the sheet will do.</div>
      )}
      {reading && !plan && !waitingForName && (
        <div style={{ ...muted, padding: 18, textAlign: 'center' }}>
          <Loader2 size={15} style={{ verticalAlign: '-3px', animation: 'spin 1s linear infinite' }} /> Reading the sheet…
        </div>
      )}

      {plan && !waitingForName && (
        <div style={{ opacity: fresh ? 1 : 0.55, transition: 'opacity 120ms' }} aria-busy={!fresh}>
          {/* 2 — which column is which */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Columns</h3>
              <span style={muted}>
                Headings found on row {plan.file.headerRow}{plan.file.sheet ? ` of “${plan.file.sheet}”` : ''}. Change any that were read wrong.
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {plan.fields.map(f => {
                const col = shown[f.key];
                const missing = plan.missing?.includes(f.key);
                const sample = col != null ? plan.sample.map(r => r[col]).filter(Boolean).slice(0, 2).join(' · ') : '';
                return (
                  <div key={f.key}>
                    <label style={{ ...label, color: missing ? RED : label.color }} htmlFor={`su-col-${f.key}`}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    <select id={`su-col-${f.key}`} style={{ ...input, padding: '7px 9px', fontSize: '0.8rem', borderColor: missing ? RED : undefined }}
                      value={col == null ? '' : String(col)} onChange={e => setColumn(f.key, e.target.value)}>
                      <option value="">{f.required ? '— choose a column —' : '— not in this sheet —'}</option>
                      {plan.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                    <div style={{ ...muted, fontSize: '0.7rem', marginTop: 3, minHeight: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {missing ? <span style={{ color: RED }}>Needed — pick the column that holds it</span> : sample}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {counts && !plan.missing?.length && (
            <>
              {/* 3 — items already held: recount, top up, or keep apart */}
              {needsMode && (
                <fieldset style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '12px 14px', margin: '0 0 14px' }}>
                  <legend style={{ padding: '0 6px', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {counts.matched > 1 ? `${counts.matched} items in this sheet are` : 'One item in this sheet is'} already in {plan.target.name}. What should this sheet do?
                  </legend>
                  {[
                    ['set', 'Update their counts to the sheet', `Use this for a stock take. ${counts.changed} will change, ${counts.unchanged} already match. The difference is recorded against each item.`],
                    ['add', 'Add the sheet’s quantities to them', 'Use this when the sheet lists stock that has just come in.'],
                  ].map(([key, title, help]) => (
                    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', cursor: 'pointer' }}>
                      <input type="radio" name="su-mode" checked={mode === key} onChange={() => setMode(key)} style={{ marginTop: 3 }} />
                      <span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{title}</span>
                        <span style={{ display: 'block', ...muted }}>{help}</span>
                      </span>
                    </label>
                  ))}
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', cursor: 'pointer' }}>
                    <input type="radio" name="su-mode" checked={false} onChange={() => { setTarget('new'); setMode(''); }} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>Keep this sheet as a separate stock list</span>
                      <span style={{ display: 'block', ...muted }}>For stock held somewhere else — a site store, a second godown. {plan.target.name} stays as it is.</span>
                    </span>
                  </label>
                </fieldset>
              )}

              {counts.unlinked > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {counts.unlinked} new item{counts.unlinked > 1 ? 's are' : ' is'} not in your item list yet. Add {counts.unlinked > 1 ? 'them' : 'it'} as:
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {[
                      ['material', 'Raw materials', 'shortfalls and purchase orders use them'],
                      ['product', 'Products', 'what you make or sell'],
                      ['stock', 'Stock only', 'not linked — shortfalls cannot count them'],
                    ].map(([key, title, help]) => (
                      <label key={key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.84rem' }}>
                        <input type="radio" name="su-as" checked={newItemsAs === key} onChange={() => setNewItemsAs(key)} style={{ marginTop: 3 }} />
                        <span><b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</b> <span style={muted}>— {help}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 — row by row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {tab('all', 'All', counts.new + counts.matched + counts.problems)}
                {tab('new', 'New', counts.new)}
                {counts.matched > 0 && tab('changes', 'Will change', counts.changed)}
                {counts.problems > 0 && tab('problems', 'Problems', counts.problems)}
                {counts.skipped > 0 && <span style={{ ...muted, alignSelf: 'center' }}>· {counts.skipped} blank or total row{counts.skipped > 1 ? 's' : ''} ignored</span>}
              </div>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflowX: 'auto', maxHeight: 340 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', position: 'sticky', top: 0 }}>
                      {['Row', 'Item', 'Quantity', 'Now → after', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 300).map(r => {
                      const st = STATUS[r.status];
                      const after = r.status === 'match' ? (mode === 'add' ? r.current + r.quantity : r.quantity) : r.quantity;
                      return (
                        <tr key={r.row} style={{ borderTop: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.row}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-primary)', minWidth: 180 }}>
                            <div style={{ fontWeight: 600 }}>{r.itemName || <span style={{ color: 'var(--text-muted)' }}>(no name)</span>}</div>
                            <div style={{ ...muted, fontSize: '0.7rem' }}>
                              {[r.code, r.link ? `${r.link.kind === 'product' ? 'Product' : 'Material'}: ${r.link.name}` : null].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.quantity)} {r.uom || ''}</td>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            {r.status === 'match' ? (
                              mode ? <>{fmt(r.current)} → <b style={{ color: after === r.current ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{fmt(after)}</b></>
                                : <>{fmt(r.current)} now</>
                            ) : r.status === 'new' ? <>0 → <b style={{ color: 'var(--text-primary)' }}>{fmt(r.quantity)}</b></> : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', minWidth: 160 }}>
                            <span style={pill(st.fg)}>{st.text}</span>
                            {[...(r.problems || []), ...(r.warnings || [])].map((m, i) => (
                              <div key={i} style={{ fontSize: '0.72rem', marginTop: 3, color: i < (r.problems || []).length ? RED : AMBER }}>{m}</div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', ...muted }}>Nothing here.</td></tr>
                    )}
                  </tbody>
                </table>
                {rows.length > 300 && <div style={{ padding: '8px 12px', ...muted }}>Showing the first 300 of {rows.length.toLocaleString('en-IN')}. All of them are saved.</div>}
              </div>
              {counts.problems === 0 && usable > 0 && (
                <div style={{ ...muted, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: GREEN }}>
                  <CheckCircle2 size={14} /> Every row can be saved.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
