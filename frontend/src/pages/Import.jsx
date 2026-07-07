import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TARGETS = {
  customers:      { label: 'Customers', cols: ['name', 'gstin', 'state', 'contact_name', 'phone', 'email', 'billing_address', 'opening_balance'] },
  'raw-materials':{ label: 'Raw Materials', cols: ['material_code', 'name', 'grade', 'unit', 'standard_rate', 'hsn'] },
  skus:           { label: 'SKUs', cols: ['sku_code', 'name', 'description', 'unit', 'price', 'hsn'] },
  vendors:        { label: 'Vendors', cols: ['name', 'type', 'gstin', 'pan'] },
};

// Small CSV parser (handles quotes, commas, newlines inside quotes).
function parseCSV(text) {
  const rows = []; let cur = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

export default function Import() {
  const toast = useToast();
  const [target, setTarget] = useState('customers');
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) { toast.error('CSV needs a header row and at least one data row'); return; }
    const hdr = parsed[0].map(h => h.trim());
    const data = parsed.slice(1).map(r => Object.fromEntries(hdr.map((h, i) => [h, (r[i] ?? '').trim()])));
    setHeaders(hdr); setRows(data); setResult(null);
    e.target.value = '';
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true); let ok = 0, fail = 0;
    for (const row of rows) {
      const body = {}; Object.keys(row).forEach(k => { if (row[k] !== '') body[k] = row[k]; });
      try {
        const res = await fetch(`${API}/${target}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setBusy(false); setResult({ ok, fail }); setRows([]); setHeaders([]);
    toast.success(`Imported ${ok} row${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`);
  };

  const t = TARGETS[target];
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 20 };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <FileSpreadsheet size={24} style={{ color: 'var(--brand-amber)' }} /> Import Data
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Bring your masters in from a CSV — no hand-keying. Customers can carry an <b>opening balance</b>.</p>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>What are you importing?</label>
            <select value={target} onChange={e => { setTarget(e.target.value); setRows([]); setHeaders([]); setResult(null); }} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 600 }}>
              {Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <label className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <Upload size={16} /> Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
        </div>
        <div style={{ marginTop: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Expected columns (header row): {t.cols.map(c => <code key={c} style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 5, marginRight: 5, fontSize: '0.78rem', color: 'var(--brand-amber)' }}>{c}</code>)}
          <div style={{ marginTop: 4 }}>Only <b>name</b> is required; extra/unknown columns are ignored.</div>
        </div>
      </div>

      {result && (
        <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, color: result.fail ? 'var(--accent-red)' : '#10b981' }}>
          {result.fail ? <AlertCircle size={18} /> : <Check size={18} />}
          <span style={{ fontWeight: 600 }}>Imported {result.ok} row{result.ok !== 1 ? 's' : ''}{result.fail ? ` · ${result.fail} failed (check required fields / duplicates)` : ''}.</span>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{rows.length} rows ready</span>
            <button onClick={runImport} disabled={busy} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} Import {rows.length} into {t.label}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>{headers.map(h => <th key={h} style={{ padding: '9px 12px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>{headers.map(h => <td key={h} style={{ padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {rows.length > 8 && <div style={{ padding: '10px 18px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>…and {rows.length - 8} more.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
