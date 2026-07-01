import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Files, Plus, Trash2, X, ChevronDown, ChevronRight, Trophy, FileCheck2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useProject } from '../context/ProjectContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Quotations() {
  const toast = useToast();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const [quotes, setQuotes] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [head, setHead] = useState({ partDescription: '', quantity: '', unit: 'kg' });
  const [ql, setQl] = useState({ vendorId: '', unitPrice: '', leadTimeDays: '', terms: '' });

  const load = async () => {
    const [q, v] = await Promise.all([
      fetch(`${API}/quotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/vendors`).then(r => r.ok ? r.json() : []),
    ]);
    setQuotes(Array.isArray(q) ? q : []); setVendors(v);
  };
  useEffect(() => { load(); }, []);

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
    if (!activeProject) { toast.error('Select an active project (top bar) to raise the PO against'); return; }
    const res = await fetch(`${API}/quotations/${qid}/generate-po`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: activeProject.id }) });
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

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}><label style={lbl}>Part / material to quote *</label><input style={input} placeholder="MS Angle 50x50x6" value={head.partDescription} onChange={e => setHead({ ...head, partDescription: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={lbl}>Qty</label><input style={input} type="number" placeholder="1000" value={head.quantity} onChange={e => setHead({ ...head, quantity: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 80 }}><label style={lbl}>Unit</label><input style={input} value={head.unit} onChange={e => setHead({ ...head, unit: e.target.value })} /></div>
          <button type="submit" className="btn-primary btn-sm">Create</button>
        </form>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {quotes.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Files size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No quotations yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Create one to start comparing vendor quotes.</div>
          </div>
        ) : quotes.map(q => {
          const low = cheapest(q.lines);
          return (
            <div key={q.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
                <span style={{ color: 'var(--text-muted)' }}>{expanded === q.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{q.part_description}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{q.quantity ? `${q.quantity} ${q.unit} · ` : ''}{q.lines.length}/3 quotes</div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                  background: q.status === 'PO Raised' ? 'hsl(160,60%,45%,0.12)' : q.status === 'Selected' ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
                  color: q.status === 'PO Raised' ? '#10b981' : q.status === 'Selected' ? 'var(--brand-amber)' : 'var(--text-muted)' }}>{q.status}</span>
                <button onClick={e => { e.stopPropagation(); del(q.id); }} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
              </div>

              {expanded === q.id && (
                <div style={{ padding: '0 16px 16px', background: 'var(--bg-elevated)' }}>
                  {/* compare table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <thead><tr style={{ textAlign: 'left' }}>
                      {['', 'Vendor', 'Unit Price', 'Lead time', 'Terms', ''].map((h, i) => <th key={i} style={{ padding: '7px 8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {q.lines.map(l => {
                        const isSel = q.selected_quote_id === l.id;
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
                                : <button onClick={() => select(q.id, l.id)} className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px' }} disabled={q.status === 'PO Raised'}>Select</button>}
                              <button onClick={() => delLine(l.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 4 }}><X size={14} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* add quote (Q1/Q2/Q3) */}
                  {q.lines.length < 3 && q.status !== 'PO Raised' && (
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
                      <button type="button" onClick={() => addQuote(q.id, q.lines)} className="btn-primary btn-sm" style={{ padding: '9px 12px' }}><Plus size={15} /> Q{q.lines.length + 1}</button>
                    </div>
                  )}
                  {vendors.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)', marginTop: 8 }}>Add vendors first (Vendors page) to quote them.</div>}

                  {/* generate PO */}
                  {q.selected_quote_id && q.status !== 'PO Raised' && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Winner selected. Raise the Vendor PO {activeProject ? <>against <b>{activeProject.name}</b></> : <span style={{ color: 'var(--accent-red)' }}>(select an active project first)</span>}.</div>
                      <button onClick={() => genPO(q.id)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileCheck2 size={15} /> Generate Vendor PO</button>
                    </div>
                  )}
                  {q.status === 'PO Raised' && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-default)', fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>✓ Vendor PO raised — see it under Purchase Orders.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
