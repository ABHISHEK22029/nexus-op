/* ══════════════════════════════════════════════════════════
   Vendor quotations that arrived as files.

   Three vendors quote the same enquiry: one sends a spreadsheet, one a PDF,
   one a Word document. Comparing them used to mean opening all three and
   retyping the numbers into a spreadsheet — and the retyping is where the
   comparison went wrong.

   Three things this screen refuses to do:

   · It never hides where a number came from. Every row carries the
     vendor's own file behind an eye icon, and anything read out of prose
     rather than a table cell says so. A figure nobody can trace is not
     evidence, and this decides who gets the order.

   · It never leaves a misread file wrong. "Review" opens what was read,
     line by line, for a person to correct against the original; what they
     save is marked checked.

   · It never presents the smallest total as the winner. The cheapest
     bottom line is very often just the shortest scope, so the comparison
     leads with what everybody quoted — at the same quantity, in the same
     unit — and says plainly which items a vendor left out.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Eye, Trash2, Scale, AlertTriangle, Loader2, FileSpreadsheet,
  FileText, FileType, CheckCircle2, X, Pencil, Plus, Download, Printer, ShieldCheck,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const token = () => localStorage.getItem('nexus_token');
const auth = () => (token() ? { Authorization: `Bearer ${token()}` } : {});
const rup = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qtyFmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));

const KIND_ICON = { excel: FileSpreadsheet, csv: FileSpreadsheet, pdf: FileText, word: FileType };
const TRUSTED = new Set(['high', 'checked']);
const ACCEPT = '.xlsx,.csv,.pdf,.docx,.xls,.doc,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const S = {
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 },
  th: { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' },
  td: { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%', fontFamily: 'inherit' },
  label: { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' },
  icon: { border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 },
};
S.num = { ...S.td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

const StatusChip = ({ status, note }) => {
  if (status === 'reviewed') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}><ShieldCheck size={13} /> Checked</span>;
  if (status === 'parsed') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}><CheckCircle2 size={13} /> Read</span>;
  return <span title={note || 'Only partly read'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#b45309', fontSize: '0.75rem', fontWeight: 700 }}><AlertTriangle size={13} /> {status === 'failed' ? 'Not read' : 'Check it'}</span>;
};

export default function VendorQuotations() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [picked, setPicked] = useState([]);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rfq, setRfq] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendors, setVendors] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [dragging, setDragging] = useState(false);
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
  useEffect(() => {
    fetch(`${API}/vendors?limit=500`, { headers: auth() }).then(r => (r.ok ? r.json() : [])).then(d => {
      setVendors(Array.isArray(d) ? d : (d.items || d.rows || []));
    }).catch(() => {});
  }, []);

  /* One file or several. With several, the vendor box is left for the
     review step — one name cannot belong to three vendors' files. */
  const upload = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is over 10 MB`); continue; }
        const fd = new FormData();
        fd.append('file', file);
        if (files.length === 1 && vendorName.trim()) {
          const match = vendors.find(v => v.name?.toLowerCase() === vendorName.trim().toLowerCase());
          if (match) fd.append('vendorId', match.id);
          fd.append('vendorName', vendorName.trim());
        }
        if (rfq) fd.append('rfqRef', rfq);
        const r = await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: auth(), body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast.error(`${file.name}: ${d.error || 'could not read it'}`); continue; }
        /* Say what was read, not just "uploaded" — the line count is the
           number somebody needs to sanity-check against the file. */
        if (d.parse_status === 'parsed') toast.success(`Read ${d.lineCount} item lines from ${d.filename}`);
        else toast.error(`Read ${d.lineCount} lines from ${d.filename} — review it against the original`);
      }
      setVendorName('');
      await load();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this quotation and its file?')) return;
    await fetch(`${API}/vendor-quotations/${id}`, { method: 'DELETE', headers: auth() });
    setPicked(p => p.filter(x => x !== id));
    setCmp(null);
    if (reviewing === id) setReviewing(null);
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
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(e.message); }
  };

  const compare = async (ids = picked) => {
    if (ids.length < 2) { toast.error('Pick at least two quotations'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/vendor-quotations/compare?ids=${ids.join(',')}`, { headers: auth() });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Could not compare'); return; }
      setCmp(d);
      setTimeout(() => document.getElementById('vq-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } finally { setBusy(false); }
  };

  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-6)));

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="no-print" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>Vendor quotations</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4, maxWidth: '72ch' }}>
          Upload the file each vendor sent — Excel, CSV, PDF or Word. The items are read out of it, you can check and correct
          every line, and the original stays attached so any figure can be traced to the page it came from.
        </p>
      </div>

      {/* ── upload ── */}
      <div className="no-print"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        style={{ ...S.card, padding: 16, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
          borderStyle: dragging ? 'dashed' : 'solid', borderColor: dragging ? 'var(--brand-amber)' : 'var(--border-subtle)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
          <span style={S.label}>Vendor</span>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Pick or type who sent it"
            aria-label="Vendor name" list="vq-vendors" style={S.input} />
          <datalist id="vq-vendors">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <span style={S.label}>Against</span>
          <input value={rfq} onChange={e => setRfq(e.target.value)} placeholder="RFQ / enquiry reference" aria-label="RFQ reference" style={S.input} />
        </label>
        <button className="btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={15} /> : <Upload size={15} />} Upload quotation
        </button>
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>or drop files here · several at once is fine</span>
        <input ref={fileRef} type="file" hidden multiple aria-label="Vendor quotation file" accept={ACCEPT}
          onChange={e => upload(e.target.files)} />
        <button className="btn-secondary btn-sm" onClick={() => compare()} disabled={busy || picked.length < 2}
          title={picked.length < 2 ? 'Tick two or more quotations below' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <Scale size={15} /> Compare {picked.length >= 2 ? picked.length : ''}
        </button>
      </div>

      {summary?.needs_review > 0 && (
        <div className="no-print" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.84rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} />
          {summary.needs_review} quotation{summary.needs_review > 1 ? 's were' : ' was'} not fully read or not yet checked — open “Review” to correct the lines against the original.
        </div>
      )}

      {/* ── the list ── */}
      <div className="no-print" style={{ ...S.card, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 34 }}><span className="sr-only">Compare</span></th>
              <th style={S.th}>Vendor</th>
              <th style={S.th}>File</th>
              <th style={S.th}>Against</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Items</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
              <th style={S.th}>Read</th>
              <th style={{ ...S.th, width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td style={{ ...S.td, color: 'var(--text-muted)' }} colSpan={8}>
                Nothing uploaded yet. Add the files your vendors sent and they can be compared side by side.
              </td></tr>
            )}
            {rows.map(r => {
              const Icon = KIND_ICON[r.source_kind] || FileText;
              return (
                <tr key={r.id} style={reviewing === r.id ? { background: 'var(--bg-elevated)' } : undefined}>
                  <td style={S.td}>
                    <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)}
                      aria-label={`Compare ${r.vendor_name || r.filename}`} />
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.vendor_name || r.vendor_record_name || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not named</span>}</td>
                  <td style={S.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.8rem' }}>{r.filename}</span>
                    </span>
                  </td>
                  <td style={{ ...S.td, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.rfq_ref || '—'}</td>
                  <td style={S.num}>{r.line_count}</td>
                  {/* The total the file states, with tax; failing that, the
                      sum of the lines read. The title says which. */}
                  <td style={S.num} title={r.grand_total != null ? 'Total stated in the file, with tax' : 'Sum of the lines read, before tax'}>
                    {rup(r.grand_total ?? r.subtotal)}
                    {r.grand_total == null && r.subtotal != null && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> *</span>}
                  </td>
                  <td style={S.td}><StatusChip status={r.parse_status} note={r.parse_note} /></td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setReviewing(reviewing === r.id ? null : r.id)} title="Review and correct the lines read"
                      aria-label={`Review ${r.vendor_name || r.filename}`} style={S.icon}><Pencil size={15} /></button>
                    {/* The eye: the vendor's own document, exactly as sent. */}
                    <button onClick={() => openOriginal(r)} title="Open the original file the vendor sent"
                      aria-label={`Open the original file for ${r.vendor_name || r.filename}`} style={S.icon}><Eye size={16} /></button>
                    <button onClick={() => remove(r.id)} title="Remove"
                      aria-label={`Remove ${r.vendor_name || r.filename}`} style={S.icon}><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <Review key={reviewing} id={reviewing} vendors={vendors} onClose={() => setReviewing(null)}
          onOpen={openOriginal} onSaved={async () => { await load(); if (cmp) compare(cmp.quotations.map(q => q.id)); }} />
      )}

      {cmp && <Comparison cmp={cmp} onClose={() => setCmp(null)} onOpen={openOriginal} />}
    </div>
  );
}

/* ── review: what was read, line by line, editable ─────────────────── */
function Review({ id, vendors, onClose, onOpen, onSaved }) {
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [lines, setLines] = useState([]);
  const [head, setHead] = useState({ vendorName: '', rfqRef: '', quoteRef: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/vendor-quotations/${id}`, { headers: auth() }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return;
      setQ(d);
      setHead({ vendorName: d.vendor_name || '', rfqRef: d.rfq_ref || '', quoteRef: d.quote_ref || '' });
      /* NUMERIC columns arrive as "180.000"; show 180. */
      const n = (v) => (v == null ? '' : Number(v));
      setLines(d.lines.map(l => ({ description: l.description || '', hsn: l.hsn || '', uom: l.uom || '', quantity: n(l.quantity), rate: n(l.rate), confidence: l.confidence })));
    });
  }, [id]);

  const setLine = (i, patch) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch, confidence: 'checked' } : l)));
  const amount = (l) => (l.quantity !== '' && l.rate !== '' ? Math.round(Number(l.quantity) * Number(l.rate) * 100) / 100 : null);
  const total = lines.reduce((s, l) => s + (amount(l) || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      const match = vendors.find(v => v.name?.toLowerCase() === head.vendorName.trim().toLowerCase());
      const r = await fetch(`${API}/vendor-quotations/${id}`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: head.vendorName, rfqRef: head.rfqRef, quoteRef: head.quoteRef,
          ...(match ? { vendorId: match.id } : {}),
          lines: lines.map(l => ({ description: l.description, hsn: l.hsn, uom: l.uom, quantity: l.quantity, rate: l.rate })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || 'Could not save'); return; }
      toast.success(`Saved — ${d.lines.length} lines checked`);
      await onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  if (!q) return <div style={{ ...S.card, padding: 18, marginBottom: 20, color: 'var(--text-muted)' }}>Loading…</div>;
  return (
    <div className="no-print" style={{ ...S.card, padding: 18, marginBottom: 20, borderColor: 'var(--brand-amber)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0 }}>Review: {q.filename}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn-sm" onClick={() => onOpen(q)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Eye size={14} /> Original</button>
          <button onClick={onClose} aria-label="Close review" style={S.icon}><X size={17} /></button>
        </div>
      </div>
      {q.parse_note && (
        <div style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: 12, display: 'flex', gap: 6 }}><AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} /> {q.parse_note}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 4 }}><span style={S.label}>Vendor</span>
          <input style={S.input} list="vq-vendors" value={head.vendorName} onChange={e => setHead(h => ({ ...h, vendorName: e.target.value }))} aria-label="Review vendor name" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={S.label}>Against</span>
          <input style={S.input} value={head.rfqRef} onChange={e => setHead(h => ({ ...h, rfqRef: e.target.value }))} aria-label="Review RFQ reference" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={S.label}>Vendor's quote no.</span>
          <input style={S.input} value={head.quoteRef} onChange={e => setHead(h => ({ ...h, quoteRef: e.target.value }))} aria-label="Vendor quote number" /></label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr>
            <th style={{ ...S.th, width: '40%' }}>Item</th><th style={S.th}>HSN</th><th style={S.th}>Qty</th><th style={S.th}>Unit</th>
            <th style={S.th}>Rate</th><th style={{ ...S.th, textAlign: 'right' }}>Amount</th><th style={S.th}></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...S.td, padding: '5px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!TRUSTED.has(l.confidence) && <span title="Read from text, not a table cell — check it" style={{ color: '#b45309' }}>*</span>}
                    <input style={S.input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} aria-label={`Review line ${i + 1} item`} />
                  </div>
                </td>
                <td style={{ ...S.td, padding: '5px 4px', width: 90 }}><input style={{ ...S.input, fontFamily: 'var(--font-mono)' }} value={l.hsn} onChange={e => setLine(i, { hsn: e.target.value })} aria-label={`Review line ${i + 1} HSN`} /></td>
                <td style={{ ...S.td, padding: '5px 4px', width: 90 }}><input style={S.input} type="number" step="any" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Review line ${i + 1} quantity`} /></td>
                <td style={{ ...S.td, padding: '5px 4px', width: 76 }}><input style={S.input} value={l.uom} onChange={e => setLine(i, { uom: e.target.value })} aria-label={`Review line ${i + 1} unit`} /></td>
                <td style={{ ...S.td, padding: '5px 4px', width: 104 }}><input style={S.input} type="number" step="any" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} aria-label={`Review line ${i + 1} rate`} /></td>
                <td style={S.num}>{rup(amount(l))}</td>
                <td style={{ ...S.td, padding: '5px 4px' }}>
                  <button onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} aria-label={`Remove review line ${i + 1}`} style={S.icon}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn-secondary btn-sm" onClick={() => setLines(ls => [...ls, { description: '', hsn: '', uom: '', quantity: '', rate: '', confidence: 'checked' }])}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Add line</button>
        <span style={{ marginLeft: 'auto', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          Lines total, before tax: <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{rup(total)}</b>
          {q.grand_total != null && <> · the file states {rup(q.grand_total)} with tax</>}
        </span>
        <button className="btn-primary btn-sm" disabled={saving} onClick={save} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} /> {saving ? 'Saving…' : 'Save as checked'}
        </button>
      </div>
    </div>
  );
}

/* ── the comparison ─────────────────────────────────────────────────── */
function csvOf(cmp) {
  const qs = cmp.quotations;
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Item', 'Qty', ...qs.flatMap(q => [`${q.vendor} rate`, `${q.vendor} amount`]), 'Lowest'];
  const body = cmp.rows.map(r => [r.description, r.quantity ?? '',
    ...qs.flatMap(q => [r.by[q.id]?.rate ?? '', r.by[q.id]?.comparable ?? '']),
    qs.filter(q => r.bestQuotationIds.includes(q.id)).map(q => q.vendor).join(' / ')]);
  const foot = ['Like-for-like total', '', ...qs.flatMap(q => ['', q.comparableTotal]), ''];
  return [head, ...body, foot].map(r => r.map(esc).join(',')).join('\n');
}

function Comparison({ cmp, onClose, onOpen }) {
  const qs = cmp.quotations;
  const cheapest = qs.find(q => q.id === cmp.cheapestOnLikeForLike);
  const download = () => {
    const blob = new Blob(['﻿' + csvOf(cmp)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vendor-comparison.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div id="vq-compare" className="doc-sheet" style={{ ...S.card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Side by side</h2>
        <div className="no-print" style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn-sm" onClick={download} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> CSV</button>
          <button className="btn-secondary btn-sm" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> Print</button>
          <button onClick={onClose} aria-label="Close comparison" style={S.icon}><X size={17} /></button>
        </div>
      </div>

      {cheapest && (
        <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.88rem' }}>
          <b>{cheapest.vendor}</b> is lowest like for like at <b style={{ fontFamily: 'var(--font-mono)' }}>{rup(cheapest.comparableTotal)}</b> before tax
          {cmp.savingsVsHighest > 0 && <> — {rup(cmp.savingsVsHighest)} less than the highest</>}
          , across the {cmp.comparableRowCount} item{cmp.comparableRowCount === 1 ? '' : 's'} every vendor quoted.
        </div>
      )}

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
              <th style={S.th}>Vendor</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Like for like</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Their stated total</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Items quoted</th>
              <th className="no-print" style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {qs.map(q => {
              const best = q.id === cmp.cheapestOnLikeForLike;
              return (
                <tr key={q.id} style={best ? { background: 'rgba(22,163,74,0.08)' } : undefined}>
                  <td style={{ ...S.td, fontWeight: 700 }}>
                    {q.vendor}
                    {best && <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>Lowest like for like</span>}
                    {!['parsed', 'reviewed'].includes(q.parseStatus) && (
                      <div title={q.parseNote || ''} style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, marginTop: 2 }}>
                        Only partly read — review it against the original
                      </div>
                    )}
                  </td>
                  <td style={{ ...S.num, fontWeight: 800 }}>{rup(q.comparableTotal)}</td>
                  <td style={S.num} title="As stated in the vendor's file, usually with tax">{rup(q.statedTotal)}</td>
                  <td style={S.num}>
                    {q.linesQuoted}
                    {q.linesMissing > 0 && <span style={{ color: '#b45309' }}> · {q.linesMissing} not quoted</span>}
                  </td>
                  <td className="no-print" style={{ ...S.td, textAlign: 'right' }}>
                    <button onClick={() => onOpen({ id: q.id })} title="Open the original file" aria-label={`Open the original file for ${q.vendor}`} style={S.icon}><Eye size={16} /></button>
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
              <th style={S.th}>Item</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Qty</th>
              {qs.map(q => <th key={q.id} style={{ ...S.th, textAlign: 'right' }}>{q.vendor}<div style={{ fontWeight: 500, textTransform: 'none' }}>rate</div></th>)}
              <th style={{ ...S.th, textAlign: 'right' }}>Spread</th>
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map(row => (
              <tr key={row.key}>
                <td style={S.td}>
                  {row.description}
                  {row.quotedBy < qs.length && (
                    <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>quoted by {row.quotedBy} of {qs.length}</div>
                  )}
                  {row.unitsDiffer && <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>quoted in different units — compare by hand</div>}
                  {row.qtyDiffers && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>vendors quoted different quantities</div>}
                </td>
                <td style={S.num}>{qtyFmt(row.quantity)} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{row.uom || ''}</span></td>
                {qs.map(q => {
                  const cell = row.by[q.id];
                  const best = cell && row.bestQuotationIds.includes(q.id);
                  return (
                    <td key={q.id} style={{ ...S.num, color: cell ? (best ? '#16a34a' : 'var(--text-primary)') : 'var(--text-disabled)', fontWeight: best ? 800 : 500 }}>
                      {cell ? rup(cell.rate ?? cell.amount) : 'not quoted'}
                      {cell && !TRUSTED.has(cell.confidence) && (
                        <span title="Read from text rather than a table cell — check the original" style={{ marginLeft: 4, color: '#b45309' }}>*</span>
                      )}
                      {cell && cell.quantity != null && cell.quantity !== row.quantity && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>for {qtyFmt(cell.quantity)} {cell.uom || ''}</div>
                      )}
                    </td>
                  );
                })}
                <td style={S.num}>{row.spreadPct == null ? '—' : `${row.spreadPct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 10 }}>
        Like for like = each vendor's rate × the same quantity, over the items every vendor quoted in the same unit, before tax.
        * read from text rather than a table cell, and not yet checked — open the original before acting on it.
      </p>
    </div>
  );
}
