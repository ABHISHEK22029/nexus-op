/* ══════════════════════════════════════════════════════════
   Import products, raw materials or recipes from a sheet.

   1. Choose an Excel (.xlsx) or CSV file — or download the template first.
   2. See what was understood: which column is which (changeable), the
      problems listed by row before anything else, then row by row what
      will happen — new, an update (with what changes), unchanged, left out.
   3. Import. The server reads the file again and does exactly what this
      showed; rows with a problem are left out and stay listed.

   Server: controllers/ItemImportController.js.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Shell } from './StockActions';
import { fmtINR } from '../lib/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const KINDS = {
  products: {
    title: 'Import products', path: 'skus/import', one: 'product', many: 'products',
    file: 'maksops-products-template.xlsx',
    needs: 'A name for each new product. Code, unit, price, HSN and description if you have them.',
  },
  materials: {
    title: 'Import raw materials', path: 'raw-materials/import', one: 'raw material', many: 'raw materials',
    file: 'maksops-raw-materials-template.xlsx',
    needs: 'A name and a unit for each new material. Code, grade, category, rate, HSN, minimum order and lead time if you have them.',
  },
  recipes: {
    title: 'Import recipes', path: 'skus/recipes/import', one: 'recipe', many: 'recipes',
    file: 'maksops-recipes-template.xlsx',
    needs: 'One row per material: the product (code or name), the raw material (code or name), how much one unit takes, and its unit.',
  },
};

const label = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};
const muted = { fontSize: '0.76rem', color: 'var(--text-muted)' };
const RED = '#dc2626';
const GREEN = '#059669';
const AMBER = '#b45309';
const BLUE = '#2563eb';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 6 }));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const STATUS = {
  new: { text: 'New', fg: GREEN },
  update: { text: 'Will update', fg: BLUE },
  unchanged: { text: 'Unchanged', fg: 'var(--text-muted)' },
  error: { text: 'Left out', fg: RED },
  replace: { text: 'Replaces recipe', fg: BLUE },
};

const pill = (fg) => ({
  display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, color: fg,
  padding: '2px 8px', borderRadius: 999, border: '1px solid currentColor', whiteSpace: 'nowrap',
});
const th = { padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', textAlign: 'left' };
const td = { padding: '7px 10px', verticalAlign: 'top' };

const changeText = (c) => {
  const v = (x) => (x == null || x === '' ? 'blank' : c.money ? fmtINR(x) : String(x));
  return `${c.label}: ${v(c.from)} → ${v(c.to)}`;
};

export default function ItemImport({ kind, onClose, onDone }) {
  const K = KINDS[kind];
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [plan, setPlan] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState('update');
  const [show, setShow] = useState('all');
  const [downloading, setDownloading] = useState(false);

  const form = (extra = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  };

  /* Read again whenever the file or a column choice changes. Import is
     offered only while the preview on screen is for those choices. */
  const currentKey = JSON.stringify([file?.name, file?.size, file?.lastModified, mapping]);
  useEffect(() => {
    if (!file) return undefined;
    const key = currentKey;
    let gone = false;
    (async () => {
      setReading(true); setError('');
      try {
        const res = await fetch(`${API}/${K.path}/plan`, { method: 'POST', body: form() });
        const body = await res.json().catch(() => ({}));
        if (gone) return;
        if (!res.ok) { setPlan(null); setError(body.error || 'The sheet could not be read'); return; }
        setPlan({ ...body, key });
      } catch (e) { if (!gone) setError(e.message || 'The sheet could not be read'); }
      finally { if (!gone) setReading(false); }
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  const fresh = !!plan && plan.key === currentKey;

  const chooseFile = (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB. Split the sheet and import it in parts.'); return; }
    setFile(f); setMapping(null); setPlan(null); setError(''); setShow('all');
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/${K.path}/template`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The template could not be downloaded');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = K.file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(e.message); }
    finally { setDownloading(false); }
  };

  const shownMap = mapping || plan?.mapping || {};
  const setColumn = (field, col) => setMapping(m => {
    const next = { ...(m || plan?.mapping || {}) };
    /* A column can serve one field: choosing it here clears it elsewhere. */
    Object.keys(next).forEach(k => { if (String(next[k]) === String(col)) delete next[k]; });
    if (col === '') delete next[field]; else next[field] = Number(col);
    return next;
  });

  const counts = plan?.counts;
  const isRecipes = kind === 'recipes';
  const usable = !counts ? 0 : isRecipes
    ? counts.new + counts.replace
    : counts.new + (existing === 'update' ? counts.update : 0);
  const missing = plan?.missing?.length > 0;

  /* Rows (or, for recipes, products) under the chosen tab. */
  const items = useMemo(() => {
    const all = isRecipes ? (plan?.groups || []) : (plan?.rows || []);
    if (show === 'all') return all;
    if (show === 'changes') return all.filter(x => x.status === 'update' || x.status === 'replace');
    if (show === 'problems') return all.filter(x => x.status === 'error');
    return all.filter(x => x.status === show);
  }, [plan, show, isRecipes]);

  const commit = async () => {
    if (!plan || !usable) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/${K.path}/commit`, { method: 'POST', body: form(isRecipes ? {} : { existing }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The import could not be saved');
      const parts = [];
      if (isRecipes) {
        if (body.created) parts.push(`${plural(body.created, 'recipe', 'recipes')} added`);
        if (body.replaced) parts.push(`${body.replaced} replaced`);
      } else {
        if (body.created) parts.push(`${plural(body.created, K.one, K.many)} added`);
        if (body.updated) parts.push(`${body.updated} updated`);
      }
      if (body.leftOut) parts.push(`${body.leftOut} left out`);
      toast.success(parts.join(' · ') || 'Nothing to change');
      onDone?.(body);
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const tab = (key, text, n) => (
    <button type="button" key={key} onClick={() => setShow(key)} aria-pressed={show === key}
      style={{
        border: '1px solid var(--border-default)', borderRadius: 999, padding: '4px 11px', cursor: 'pointer',
        fontSize: '0.76rem', fontWeight: 600,
        background: show === key ? 'var(--text-primary)' : 'transparent',
        color: show === key ? 'var(--bg-surface)' : 'var(--text-secondary)',
      }}>{text} <span style={{ opacity: 0.75 }}>{n}</span></button>
  );

  const notes = (x) => (
    <>
      {(x.changes || []).map((c, i) => <div key={`c${i}`} style={{ fontSize: '0.72rem', marginTop: 3, color: 'var(--text-secondary)' }}>{changeText(c)}</div>)}
      {(x.problems || []).map((m, i) => <div key={`p${i}`} style={{ fontSize: '0.72rem', marginTop: 3, color: RED }}>{m}</div>)}
      {(x.warnings || []).map((m, i) => <div key={`w${i}`} style={{ fontSize: '0.72rem', marginTop: 3, color: AMBER }}>{m}</div>)}
    </>
  );

  const blocked = saving || reading || !fresh || !usable || missing;
  const buttonText = saving ? 'Importing…'
    : !usable ? (counts && (counts.unchanged || counts.update) ? 'Nothing to change' : 'Import')
      : isRecipes ? `Save ${plural(usable, 'recipe', 'recipes')}`
        : `Import ${plural(usable, K.one, K.many)}`;

  return (
    <Shell
      width={900}
      title={K.title}
      subtitle="Excel (.xlsx) or CSV, in your own column names. Nothing is saved until you import."
      icon={<FileSpreadsheet size={17} style={{ color: 'var(--brand-amber)' }} />}
      onClose={onClose}
      footer={<>
        {plan && counts && !missing && (
          <span style={{ ...muted, marginRight: 'auto', flex: '1 1 220px' }} data-import-summary>
            {isRecipes
              ? `${usable} of ${plural(counts.products, 'product', 'products')} will get a recipe`
              : `${usable} of ${plural(counts.rows, 'row', 'rows')} will be saved`}
            {counts.problems ? ` · ${counts.problems} left out` : ''}
          </span>
        )}
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={commit} className="btn-primary btn-sm" data-import-commit
          disabled={blocked}
          /* A primary button looks the same disabled; dimmed, it doesn't
             invite a click that does nothing. */
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: blocked && !saving ? 0.5 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          {buttonText}
        </button>
      </>}
    >
      {/* 1 — the file, and the template */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={label}>Sheet</label>
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
            <input ref={fileRef} type="file" hidden data-import-file
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div>
          <label style={label}>What the sheet needs</label>
          <p style={{ ...muted, margin: '0 0 8px', lineHeight: 1.45 }}>{K.needs}</p>
          <button type="button" onClick={downloadTemplate} disabled={downloading} data-import-template
            className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {downloading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
            Download template
          </button>
          {isRecipes && <div style={{ ...muted, marginTop: 6 }}>It lists your products and raw materials to copy codes from.</div>}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${RED}55`, background: `${RED}10`, color: RED, fontSize: '0.84rem', marginBottom: 14, display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} /> <span>{error}</span>
        </div>
      )}
      {reading && !plan && (
        <div style={{ ...muted, padding: 18, textAlign: 'center' }}>
          <Loader2 size={15} style={{ verticalAlign: '-3px', animation: 'spin 1s linear infinite' }} /> Reading the sheet…
        </div>
      )}

      {plan && (
        <div style={{ opacity: fresh ? 1 : 0.55, transition: 'opacity 120ms' }} aria-busy={!fresh}>
          {/* 2 — which column is which */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Columns</h3>
              <span style={muted}>
                Headings found on row {plan.file.headerRow}{plan.file.sheet ? ` of “${plan.file.sheet}”` : ''}. Change any that were read wrong.
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              {plan.fields.map(f => {
                const col = shownMap[f.key];
                const isMissing = plan.missing?.includes(f.key);
                const sample = col != null ? plan.sample.map(r => r[col]).filter(Boolean).slice(0, 2).join(' · ') : '';
                return (
                  <div key={f.key}>
                    <label style={{ ...label, color: isMissing ? RED : label.color }} htmlFor={`ii-col-${f.key}`}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    <select id={`ii-col-${f.key}`} style={{ ...input, borderColor: isMissing ? RED : undefined }}
                      value={col == null ? '' : String(col)} onChange={e => setColumn(f.key, e.target.value)}>
                      <option value="">{f.required ? '— choose a column —' : '— not in this sheet —'}</option>
                      {plan.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                    <div style={{ ...muted, fontSize: '0.7rem', marginTop: 3, minHeight: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isMissing ? <span style={{ color: RED }}>Needed — pick the column that holds it</span> : sample}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {counts && !missing && (
            <>
              {/* 3 — problems first, so nothing is a surprise after importing */}
              {plan.problems?.length > 0 && (
                <div data-import-problems style={{ border: `1px solid ${RED}40`, background: `${RED}0d`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: RED, fontWeight: 700, fontSize: '0.84rem' }}>
                    <AlertTriangle size={15} />
                    {isRecipes
                      ? `${plural(counts.problems, 'product is', 'products are')} left out — fix ${plan.problems.length === 1 ? 'this row' : 'these rows'} in the sheet and choose it again:`
                      : `${plural(counts.problems, 'row', 'rows')} can't be imported as ${counts.problems === 1 ? 'it is' : 'they are'} — fix ${counts.problems === 1 ? 'it' : 'them'} in the sheet and choose it again, or import the rest:`}
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 22, fontSize: '0.8rem', color: 'var(--text-secondary)', maxHeight: 150, overflowY: 'auto' }}>
                    {plan.problems.slice(0, 40).map((p, i) => (
                      <li key={i} style={{ marginTop: 2 }}>
                        <b style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>Row {p.row}</b>
                        {p.name ? <> · {p.name}</> : null} — {p.message}
                      </li>
                    ))}
                    {plan.problems.length > 40 && <li>…and {plan.problems.length - 40} more, in the table below.</li>}
                  </ul>
                </div>
              )}

              {/* 4 — items already on file: update them, or leave them */}
              {!isRecipes && counts.update > 0 && (
                <fieldset style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', margin: '0 0 14px' }}>
                  <legend style={{ padding: '0 6px', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {plural(counts.update, `${K.one} in this sheet is`, `${K.many} in this sheet are`)} already on file, with different values
                  </legend>
                  {[
                    ['update', 'Update them with the sheet’s values', 'Filled cells replace what is on file; blank cells leave it as it is. Each change is shown below.'],
                    ['skip', 'Leave them as they are', `Only new ${K.many} are added.`],
                  ].map(([key, title, help]) => (
                    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', cursor: 'pointer' }}>
                      <input type="radio" name="ii-existing" checked={existing === key} onChange={() => setExisting(key)} style={{ marginTop: 3 }} />
                      <span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{title}</span>
                        <span style={{ display: 'block', ...muted }}>{help}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {isRecipes && (counts.replace > 0 || counts.new > 0) && (
                <p style={{ ...muted, margin: '0 0 12px' }}>
                  Each product in this sheet gets exactly the recipe in the sheet. Products not in the sheet keep theirs.
                </p>
              )}

              {/* 5 — row by row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {isRecipes ? <>
                  {tab('all', 'All', counts.products)}
                  {tab('new', 'New', counts.new)}
                  {counts.replace > 0 && tab('changes', 'Replaces', counts.replace)}
                  {counts.unchanged > 0 && tab('unchanged', 'Unchanged', counts.unchanged)}
                  {counts.problems > 0 && tab('problems', 'Left out', counts.problems)}
                </> : <>
                  {tab('all', 'All', counts.rows)}
                  {tab('new', 'New', counts.new)}
                  {counts.update > 0 && tab('changes', 'Will update', counts.update)}
                  {counts.unchanged > 0 && tab('unchanged', 'Unchanged', counts.unchanged)}
                  {counts.problems > 0 && tab('problems', 'Left out', counts.problems)}
                </>}
                {counts.skipped > 0 && <span style={{ ...muted, alignSelf: 'center' }}>· {plural(counts.skipped, 'example row', 'example rows')} skipped</span>}
              </div>

              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflowX: 'auto', maxHeight: 340 }}>
                {isRecipes ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: '0.8rem' }} data-import-table>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', position: 'sticky', top: 0 }}>
                        {['Row', 'Material', 'Qty per unit', 'Notes'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 200).map(g => {
                        const st = g.status === 'replace' ? STATUS.replace : STATUS[g.status];
                        return (
                          <React.Fragment key={g.key}>
                            <tr style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
                              <td colSpan={4} style={{ ...td, paddingTop: 9 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <b style={{ color: 'var(--text-primary)' }}>{g.name || '(no product)'}</b>
                                  {g.code && <span style={muted}>{g.code}</span>}
                                  <span style={pill(st.fg)}>{st.text}</span>
                                  {g.status === 'replace' && <span style={muted}>now {plural(g.current.length, 'line', 'lines')}: {g.current.map(c => `${c.material} ${fmt(c.qty)} ${c.unit || ''}`).join(', ')}</span>}
                                </div>
                                {g.problems.map((m, i) => <div key={i} style={{ fontSize: '0.72rem', marginTop: 3, color: RED }}>{m}</div>)}
                              </td>
                            </tr>
                            {g.lines.map(l => (
                              <tr key={l.row} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                                <td style={{ ...td, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{l.row}</td>
                                <td style={{ ...td, color: 'var(--text-primary)', minWidth: 180 }}>
                                  {l.material || <span style={muted}>(no material)</span>}
                                  {l.materialCode && <span style={{ ...muted, fontSize: '0.7rem', whiteSpace: 'nowrap' }}> · {l.materialCode}</span>}
                                </td>
                                <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.qty)} {l.unit || ''}</td>
                                <td style={{ ...td, minWidth: 200 }}>{notes(l)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {!items.length && <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', ...muted }}>Nothing here.</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: '0.8rem' }} data-import-table>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', position: 'sticky', top: 0 }}>
                        {['Row', K.one === 'product' ? 'Product' : 'Material', 'Unit', kind === 'products' ? 'Price' : 'Rate', 'What happens'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 300).map(r => {
                        const st = r.status === 'update' && existing === 'skip' ? { text: 'Kept as it is', fg: 'var(--text-muted)' } : STATUS[r.status];
                        const money = kind === 'products' ? r.values.price : r.values.rate;
                        return (
                          <tr key={r.row} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                            <td style={{ ...td, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.row}</td>
                            <td style={{ ...td, color: 'var(--text-primary)', minWidth: 180 }}>
                              <div style={{ fontWeight: 600 }}>{r.name || <span style={muted}>(no name)</span>}</div>
                              {r.code && <div style={{ ...muted, fontSize: '0.7rem' }}>{r.code}</div>}
                            </td>
                            <td style={td}>{r.values.unit || '—'}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money != null ? fmtINR(money) : '—'}</td>
                            <td style={{ ...td, minWidth: 220 }}>
                              <span style={pill(st.fg)}>{st.text}</span>
                              {notes(r)}
                            </td>
                          </tr>
                        );
                      })}
                      {!items.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', ...muted }}>Nothing here.</td></tr>}
                    </tbody>
                  </table>
                )}
                {items.length > (isRecipes ? 200 : 300) && <div style={{ padding: '8px 12px', ...muted }}>Showing the first {isRecipes ? 200 : 300} of {items.length.toLocaleString('en-IN')}. All of them are imported.</div>}
              </div>
              {counts.problems === 0 && usable > 0 && (
                <div style={{ ...muted, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: GREEN }}>
                  <CheckCircle2 size={14} /> Every row can be imported.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
