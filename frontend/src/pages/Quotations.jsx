/* ══════════════════════════════════════════════════════════
   Quotations (Q1/Q2/Q3) — searchable, filterable, paginated.

   The tiles read `q.summary`, which the API aggregates over the whole
   filtered set rather than the page on screen. `awaiting_quotes` is the one
   that earns its place: this screen exists to enforce three quotes per part,
   so the number that needs action is the count still short of three.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Files, Plus, Trash2, X, ChevronDown, ChevronRight, Trophy, FileCheck2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
// The only three the table ever holds (migration 008_sales_procurement.sql).
const STATUSES = ['Open', 'Selected', 'PO Raised'];

export default function Quotations() {
  const toast = useToast();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { can } = usePermissions();
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [head, setHead] = useState({ partDescription: '', quantity: '', unit: 'kg' });
  const [ql, setQl] = useState({ vendorId: '', unitPrice: '', leadTimeDays: '', terms: '' });

  // The quotation list is the hook's job now — searched and paged server-side.
  const q = useListQuery('quotations', { pageSize: 25 });
  const quotes = q.rows;

  /* Vendors still load whole: that dropdown is a picker, not a list, and a
     form control that paginates is a form control nobody can use. */
  const loadVendors = async () => {
    const v = await fetch(`${API}/vendors`).then(r => r.ok ? r.json() : []);
    setVendors(Array.isArray(v) ? v : (v.items || []));
  };
  const load = () => { loadVendors(); q.reload(); };
  useEffect(() => { loadVendors(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!head.partDescription.trim()) { toast.error('Enter the part / material to quote'); return; }
    const res = await fetch(`${API}/quotations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(head) });
    if (!res.ok) { toast.error('Failed'); return; }
    toast.success('Quotation created — now add up to 3 vendor quotes');
    setShowForm(false); setHead({ partDescription: '', quantity: '', unit: 'kg' }); load();
  };

  const addQuote = async (qid, lines) => {
    if (lines.length >= 3) { toast.error('Max 3 quotes (Q1/Q2/Q3)'); return; }
    if (!ql.vendorId) { toast.error('Pick a vendor for this quote'); return; }
    if (ql.unitPrice === '') { toast.error('Enter the quoted unit price'); return; }
    const vendor = vendors.find(v => String(v.id) === String(ql.vendorId));
    const res = await fetch(`${API}/quotations/${qid}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ql, vendorName: vendor?.name }) });
    if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
    setQl({ vendorId: '', unitPrice: '', leadTimeDays: '', terms: '' }); load();
  };
  const delLine = async (lineId) => { await fetch(`${API}/quotations/quote/${lineId}`, { method: 'DELETE' }); load(); };
  const select = async (qid, lineId) => { await fetch(`${API}/quotations/${qid}/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteLineId: lineId }) }); toast.success('Vendor selected'); load(); };
  const del = async (qid) => { if (!window.confirm('Delete this quotation?')) return; await fetch(`${API}/quotations/${qid}`, { method: 'DELETE' }); load(); };

  const genPO = async (qid) => {

    const res = await fetch(`${API}/quotations/${qid}/generate-po`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: activeProject?.id ?? null }) });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Failed'); return; }
    toast.success(`Vendor PO ${d.poNumber} raised`);
    load();
    setTimeout(() => navigate('/purchase-orders'), 900);
  };

  const cheapest = (lines) => lines.length ? Math.min(...lines.map(l => l.unit_price ?? Infinity)) : null;
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const s = q.summary || {};
  const canWrite = can('quotations', 'write');
  const canDelete = can('quotations', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <Files size={24} style={{ color: 'var(--brand-amber)' }} /> Quotations (Q1 / Q2 / Q3)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>For each part, capture up to 3 vendor quotes, compare, pick the best → raise the Vendor PO.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Quotation</button>
      </div>

      {/* Server-side aggregates over the whole filtered set — counting the
          rows on screen would only ever count page 1. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Quotations (filtered)' : 'Quotations'} value={s.count ?? q.total} />
        {/* Short of the three quotes this screen exists to collect. */}
        <Kpi card={card} label="Awaiting quotes" value={s.awaiting_quotes ?? 0} tone={Number(s.awaiting_quotes) > 0 ? 'var(--brand-amber)' : 'var(--text-muted)'} />
        <Kpi card={card} label="Vendor selected" value={s.selected ?? 0} tone="#2563eb" />
        <Kpi card={card} label="PO raised" value={s.po_raised ?? 0} tone="#10b981" />
        <Kpi card={card} label="Vendor quotes" value={s.quote_lines ?? 0} />
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}><label style={lbl}>Part / material to quote *</label><input style={input} placeholder="MS Angle 50x50x6" value={head.partDescription} onChange={e => setHead({ ...head, partDescription: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={lbl}>Qty</label><input style={input} type="number" placeholder="1000" value={head.quantity} onChange={e => setHead({ ...head, quantity: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 80 }}><label style={lbl}>Unit</label><input style={input} value={head.unit} onChange={e => setHead({ ...head, unit: e.target.value })} /></div>
          <button type="submit" className="btn-primary btn-sm">Create</button>
        </form>
      )}

      <ListToolbar
        q={q}
        placeholder="Search part, vendor, unit…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: STATUSES.map(st => ({ value: st, label: st })),
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {quotes.length === 0 ? (
          /* "None yet" and "none matched" are different situations — showing
             the first when the second is true is how people conclude their
             records have vanished. */
          <EmptyState q={q} icon={Files} noun="quotations"
            hint="Create one to start comparing vendor quotes." />
        ) : quotes.map(qt => {
          const low = cheapest(qt.lines);
          return (
            <div key={qt.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === qt.id ? null : qt.id)}>
                <span style={{ color: 'var(--text-muted)' }}>{expanded === qt.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{qt.part_description}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{qt.quantity ? `${qt.quantity} ${qt.unit} · ` : ''}{qt.lines.length}/3 quotes</div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                  background: qt.status === 'PO Raised' ? 'hsl(160,60%,45%,0.12)' : qt.status === 'Selected' ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
                  color: qt.status === 'PO Raised' ? '#10b981' : qt.status === 'Selected' ? 'var(--brand-amber)' : 'var(--text-muted)' }}>{qt.status}</span>
                {/* Hidden when the API would refuse it anyway. */}
                {canDelete && (
                  <button onClick={e => { e.stopPropagation(); del(qt.id); }} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                )}
              </div>

              {expanded === qt.id && (
                <div style={{ padding: '0 16px 16px', background: 'var(--bg-elevated)' }}>
                  {/* compare table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <thead><tr style={{ textAlign: 'left' }}>
                      {['', 'Vendor', 'Unit Price', 'Lead time', 'Terms', ''].map((h, i) => <th key={i} style={{ padding: '7px 8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {qt.lines.map(l => {
                        const isSel = qt.selected_quote_id === l.id;
                        const isLow = l.unit_price === low;
                        return (
                          <tr key={l.id} style={{ borderTop: '1px solid var(--border-subtle)', background: isSel ? 'hsl(28,100%,54%,0.06)' : 'transparent' }}>
                            <td style={{ padding: '8px', fontWeight: 800, color: 'var(--brand-amber)', fontSize: '0.78rem' }}>Q{l.slot}</td>
                            <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{l.vendor_name || `Vendor #${l.vendor_id}`}</td>
                            <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.83rem', color: isLow ? '#10b981' : 'var(--text-primary)', fontWeight: isLow ? 800 : 500 }}>
                              ₹{Number(l.unit_price ?? 0).toLocaleString('en-IN')}{isLow && <span style={{ fontSize: '0.62rem', marginLeft: 5 }}>lowest</span>}
                            </td>
                            <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{l.lead_time_days != null ? `${l.lead_time_days} days` : '—'}</td>
                            <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{l.terms || '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {isSel
                                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-amber)', fontWeight: 800, fontSize: '0.76rem' }}><Trophy size={13} /> Selected</span>
                                : canWrite && <button onClick={() => select(qt.id, l.id)} className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px' }} disabled={qt.status === 'PO Raised'}>Select</button>}
                              {canDelete && (
                                <button onClick={() => delLine(l.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 4 }}><X size={14} /></button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* add quote (Q1/Q2/Q3) */}
                  {canWrite && qt.lines.length < 3 && qt.status !== 'PO Raised' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1.5, minWidth: 150 }}><label style={lbl}>Vendor</label>
                        <select style={input} value={ql.vendorId} onChange={e => setQl({ ...ql, vendorId: e.target.value })}>
                          <option value="">— pick vendor —</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 0.9, minWidth: 90 }}><label style={lbl}>Unit price ₹</label><input style={input} type="number" value={ql.unitPrice} onChange={e => setQl({ ...ql, unitPrice: e.target.value })} /></div>
                      <div style={{ flex: 0.8, minWidth: 80 }}><label style={lbl}>Lead (days)</label><input style={input} type="number" value={ql.leadTimeDays} onChange={e => setQl({ ...ql, leadTimeDays: e.target.value })} /></div>
                      <div style={{ flex: 1, minWidth: 100 }}><label style={lbl}>Terms</label><input style={input} value={ql.terms} onChange={e => setQl({ ...ql, terms: e.target.value })} placeholder="Net 30" /></div>
                      <button type="button" onClick={() => addQuote(qt.id, qt.lines)} className="btn-primary btn-sm" style={{ padding: '9px 12px' }}><Plus size={15} /> Q{qt.lines.length + 1}</button>
                    </div>
                  )}
                  {vendors.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)', marginTop: 8 }}>Add vendors first (Vendors page) to quote them.</div>}

                  {/* generate PO */}
                  {canWrite && qt.selected_quote_id && qt.status !== 'PO Raised' && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Winner selected. Raise the Vendor PO {activeProject ? <>against <b>{activeProject.name}</b></> : <span style={{ color: 'var(--accent-red)' }}>(select an active project first)</span>}.</div>
                      <button onClick={() => genPO(qt.id)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileCheck2 size={15} /> Generate Vendor PO</button>
                    </div>
                  )}
                  {qt.status === 'PO Raised' && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-default)', fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>✓ Vendor PO raised — see it under Purchase Orders.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Pagination q={q} />
    </div>
  );
}

const Kpi = ({ card, label, value, tone }) => (
  <div style={{ ...card, padding: 18 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);
