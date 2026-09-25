/* ══════════════════════════════════════════════════════════
   Vendor quotations that arrived as files.

   Three vendors quote the same enquiry: one sends a spreadsheet, one a PDF,
   one a Word document. Comparing them used to mean opening all three and
   retyping the numbers into a spreadsheet — and the retyping is where the
   comparison went wrong.

   Two things this screen refuses to do:

   · It never hides where a number came from. Every row carries the
     vendor's own file behind an eye icon, and anything read out of prose
     rather than a spreadsheet cell says so. A figure nobody can trace is
     not evidence, and this decides who gets the order.

   · It never presents the smallest total as the winner. The cheapest
     bottom line is very often just the shortest scope, so the comparison
     leads with what everybody quoted and says plainly which items a vendor
     left out.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Eye, Trash2, Scale, AlertTriangle, Loader2, FileSpreadsheet,
  FileText, FileType, CheckCircle2, X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const token = () => localStorage.getItem('nexus_token');
const auth = () => (token() ? { Authorization: `Bearer ${token()}` } : {});
const rup = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const KIND_ICON = { excel: FileSpreadsheet, pdf: FileText, word: FileType };

export default function VendorQuotations() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [picked, setPicked] = useState([]);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rfq, setRfq] = useState('');
  const [vendorName, setVendorName] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/vendor-quotations?limit=100`, { headers: auth() });
      const d = await r.json();
      /* runList answers in two shapes: a bare array when no paging is asked
         for, and { items, total, summary } when it is. Reading only one of
         them is how a list renders empty while the data is right there. */
      setRows(Array.isArray(d) ? d : (d.items || d.rows || d.data || []));
      setSummary(Array.isArray(d) ? null : (d.summary || null));
    } catch { /* an empty list is the honest fallback */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (vendorName) fd.append('vendorName', vendorName);
      if (rfq) fd.append('rfqRef', rfq);
      const r = await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: auth(), body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || 'Could not read that file'); return; }
      /* Say what was read, not just "uploaded" — the line count is the
         number somebody needs to sanity-check against the file. */
      toast.success(d.parse_status === 'parsed'
        ? `Read ${d.lineCount} item lines from ${d.filename}`
        : `Read ${d.lineCount} lines from ${d.filename} — worth checking against the original`);
      setVendorName('');
      await load();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this quotation and its file?')) return;
    await fetch(`${API}/vendor-quotations/${id}`, { method: 'DELETE', headers: auth() });
    setPicked(p => p.filter(x => x !== id));
    setCmp(null);
    load();
  };

  /* The file opens in a new tab. It needs the bearer token, so it is
     fetched and handed over as a blob rather than linked directly. */
  const openOriginal = async (row) => {
    try {
      const r = await fetch(`${API}/vendor-quotations/${row.id}/file`, { headers: auth() });
      if (!r.ok) { toast.error('Could not open the file'); return; }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank', 'noopener');
      /* Long enough for the new tab to take it; the browser keeps its own
         reference once it has loaded. */
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(e.message); }
  };

  const compare = async () => {
    if (picked.length < 2) { toast.error('Pick at least two quotations'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/vendor-quotations/compare?ids=${picked.join(',')}`, { headers: auth() });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Could not compare'); return; }
      setCmp(d);
    } finally { setBusy(false); }
  };

  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' };
  const numTd = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>Vendor quotations</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4, maxWidth: '70ch' }}>
          Upload the file each vendor sent — Excel, PDF or Word. The items are read out of it,
          and the original stays attached so every figure can be checked against the page it came from.
        </p>
      </div>

      {/* ── upload ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Vendor</span>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Who sent it"
            aria-label="Vendor name"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 190 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Against</span>
          <input value={rfq} onChange={e => setRfq(e.target.value)} placeholder="RFQ / enquiry reference"
            aria-label="RFQ reference"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 190 }} />
        </label>
        <button className="btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={15} /> : <Upload size={15} />} Upload quotation
        </button>
        <input ref={fileRef} type="file" hidden aria-label="Vendor quotation file"
          accept=".xlsx,.xls,.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={e => upload(e.target.files?.[0])} />
        {picked.length > 0 && (
          <button className="btn-secondary btn-sm" onClick={compare} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <Scale size={15} /> Compare {picked.length}
          </button>
        )}
      </div>

      {summary?.needs_review > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.84rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} />
          {summary.needs_review} quotation{summary.needs_review > 1 ? 's were' : ' was'} only partly read — open the original before relying on the figures.
        </div>
      )}

      {/* ── the list ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 34 }}><span className="sr-only">Compare</span></th>
              <th style={th}>Vendor</th>
              <th style={th}>File</th>
              <th style={th}>Against</th>
              <th style={{ ...th, textAlign: 'right' }}>Items</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={th}>Read</th>
              <th style={{ ...th, width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={8}>
                Nothing uploaded yet. Add the files your vendors sent and they can be compared side by side.
              </td></tr>
            )}
            {rows.map(r => {
              const Icon = KIND_ICON[r.source_kind] || FileText;
              const partial = r.parse_status !== 'parsed';
              return (
                <tr key={r.id}>
                  <td style={td}>
                    <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)}
                      aria-label={`Compare ${r.vendor_name || r.filename}`} />
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.vendor_name || r.vendor_record_name || <span style={{ color: 'var(--text-muted)' }}>Not named</span>}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.8rem' }}>{r.filename}</span>
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.rfq_ref || '—'}</td>
                  <td style={numTd}>{r.line_count}</td>
                  {/* Plenty of vendor files have no "Grand Total" row at all —
                      showing a dash there is unhelpful when the lines add up
                      perfectly well. The title says which one is on screen. */}
                  <td style={numTd} title={r.grand_total != null ? 'Total stated in the file' : 'Sum of the lines read — the file states no total'}>
                    {rup(r.grand_total ?? r.subtotal)}
                    {r.grand_total == null && r.subtotal != null &&
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> *</span>}
                  </td>
                  <td style={td}>
                    {partial
                      ? <span title={r.parse_note || 'Only partly read'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#b45309', fontSize: '0.75rem', fontWeight: 700 }}>
                          <AlertTriangle size={13} /> Check it
                        </span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}>
                          <CheckCircle2 size={13} /> Read
                        </span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* The eye: the vendor's own document, exactly as sent. */}
                    <button onClick={() => openOriginal(r)} title="Open the original file the vendor sent"
                      aria-label={`Open the original file for ${r.vendor_name || r.filename}`}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                      <Eye size={16} />
                    </button>
                    <button onClick={() => remove(r.id)} title="Remove"
                      aria-label={`Remove ${r.vendor_name || r.filename}`}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cmp && <Comparison cmp={cmp} onClose={() => setCmp(null)} onOpen={openOriginal} rup={rup} th={th} td={td} numTd={numTd} />}
    </div>
  );
}

/* ── the comparison ─────────────────────────────────────────────────── */
function Comparison({ cmp, onClose, onOpen, rup, th, td, numTd }) {
  const qs = cmp.quotations;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Side by side</h2>
        <button onClick={onClose} aria-label="Close comparison"
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={17} /></button>
      </div>

      {/* The caveat leads. A smaller total on a shorter scope is not a
          better price, and that is the mistake this screen exists to stop. */}
      {cmp.caveat && (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.84rem', color: '#b45309', display: 'flex', gap: 8 }}>
          <AlertTriangle size={15} style={{ flex: '0 0 auto', marginTop: 2 }} /> {cmp.caveat}
        </div>
      )}

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              <th style={th}>Vendor</th>
              <th style={{ ...th, textAlign: 'right' }}>Their stated total</th>
              <th style={{ ...th, textAlign: 'right' }}>Like for like</th>
              <th style={{ ...th, textAlign: 'right' }}>Items quoted</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {qs.map(q => {
              const best = q.id === cmp.cheapestOnLikeForLike;
              return (
                <tr key={q.id} style={best ? { background: 'rgba(22,163,74,0.08)' } : undefined}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {q.vendor}
                    {best && <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>Lowest like for like</span>}
                    {q.parseStatus !== 'parsed' && (
                      <div title={q.parseNote || ''} style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, marginTop: 2 }}>
                        Only partly read — check the original
                      </div>
                    )}
                  </td>
                  <td style={numTd}>{rup(q.statedTotal)}</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{rup(q.comparableTotal)}</td>
                  <td style={numTd}>
                    {q.linesQuoted}
                    {q.linesMissing > 0 && <span style={{ color: '#b45309' }}> · {q.linesMissing} not quoted</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => onOpen({ id: q.id, vendor_name: q.vendor, filename: q.filename })}
                      title="Open the original file" aria-label={`Open the original file for ${q.vendor}`}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              {qs.map(q => <th key={q.id} style={{ ...th, textAlign: 'right' }}>{q.vendor}</th>)}
              <th style={{ ...th, textAlign: 'right' }}>Spread</th>
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map(row => (
              <tr key={row.key}>
                <td style={td}>
                  {row.description}
                  {row.quotedBy < qs.length && (
                    <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
                      quoted by {row.quotedBy} of {qs.length}
                    </div>
                  )}
                </td>
                {qs.map(q => {
                  const cell = row.by[q.id];
                  const best = cell && row.bestQuotationIds.includes(q.id);
                  return (
                    <td key={q.id} style={{
                      ...numTd,
                      color: cell ? (best ? '#16a34a' : 'var(--text-primary)') : 'var(--text-disabled)',
                      fontWeight: best ? 800 : 500,
                    }}>
                      {cell ? rup(cell.rate ?? cell.amount) : 'not quoted'}
                      {cell && cell.confidence !== 'high' && (
                        <span title="Read from text rather than a spreadsheet cell — check the original"
                          style={{ marginLeft: 4, color: '#b45309' }}>*</span>
                      )}
                    </td>
                  );
                })}
                <td style={numTd}>{row.spreadPct == null ? '—' : `${row.spreadPct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 10 }}>
        * read from text rather than a spreadsheet cell. Open the original before acting on it.
      </p>
    </div>
  );
}
