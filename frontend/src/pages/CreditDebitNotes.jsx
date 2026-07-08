import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileMinus, Plus, Trash2, X, Eye } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function CreditDebitNotes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [head, setHead] = useState({ noteType: 'credit', partyType: 'customer', partyId: '', noteDate: '', refNumber: '', gstRate: '18', reason: '' });
  const [lines, setLines] = useState([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);

  const load = async () => {
    const [n, c, v] = await Promise.all([
      fetch(`${API}/credit-debit-notes`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/vendors`).then(r => r.ok ? r.json() : []),
    ]);
    setNotes(Array.isArray(n) ? n : []); setCustomers(c); setVendors(Array.isArray(v) ? v : []);
  };
  useEffect(() => { load(); }, []);

  // A credit note usually goes to a customer, a debit note to a vendor — default sensibly but stay flexible.
  const onType = (noteType) => setHead(h => ({ ...h, noteType, partyType: noteType === 'credit' ? 'customer' : 'vendor', partyId: '' }));
  const parties = head.partyType === 'vendor' ? vendors : customers;
  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const sub = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const total = sub + sub * (Number(head.gstRate) || 0) / 100;

  const create = async (e) => {
    e.preventDefault();
    if (!head.partyId) { toast.error(`Pick a ${head.partyType}`); return; }
    const items = lines.filter(l => l.description.trim());
    if (!items.length) { toast.error('Add at least one line'); return; }
    try {
      const res = await fetch(`${API}/credit-debit-notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...head, items }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`${d.noteNumber} created`);
      setShowForm(false); setHead({ noteType: 'credit', partyType: 'customer', partyId: '', noteDate: '', refNumber: '', gstRate: '18', reason: '' });
      setLines([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]); load();
    } catch (err) { toast.error(err.message); }
  };
  const del = async (n) => { if (!window.confirm(`Delete ${n.note_number}?`)) return; await fetch(`${API}/credit-debit-notes/${n.id}`, { method: 'DELETE' }); load(); };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const typeBadge = (t) => ({ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', padding: '3px 9px', borderRadius: 6, color: t === 'credit' ? '#10b981' : '#f59e0b', background: (t === 'credit' ? '#10b981' : '#f59e0b') + '1f' });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <FileMinus size={24} style={{ color: 'var(--brand-amber)' }} /> Credit &amp; Debit Notes
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Adjustments for returns, short-supply and rate corrections — credit note to a customer, debit note to a vendor.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Note</button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {[{ v: 'credit', l: 'Credit Note', s: 'to a customer' }, { v: 'debit', l: 'Debit Note', s: 'to a vendor' }].map(t => (
              <button type="button" key={t.v} onClick={() => onType(t.v)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid ' + (head.noteType === t.v ? 'var(--brand-amber)' : 'var(--border-default)'),
                  background: head.noteType === t.v ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-surface)' }}>
                <div style={{ fontWeight: 800, color: head.noteType === t.v ? 'var(--brand-amber)' : 'var(--text-primary)' }}>{t.l}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.s}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>{head.partyType === 'vendor' ? 'Vendor' : 'Customer'} *</label>
              <select style={input} value={head.partyId} onChange={e => setHead({ ...head, partyId: e.target.value })}>
                <option value="">— Select —</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Against (invoice/bill)</label><input style={input} value={head.refNumber} onChange={e => setHead({ ...head, refNumber: e.target.value })} placeholder="INV-0007 / GB-0003" /></div>
            <div><label style={lbl}>Date</label><input style={input} type="date" value={head.noteDate} onChange={e => setHead({ ...head, noteDate: e.target.value })} /></div>
            <div><label style={lbl}>GST %</label><input style={input} type="number" value={head.gstRate} onChange={e => setHead({ ...head, gstRate: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Reason</label><input style={input} value={head.reason} onChange={e => setHead({ ...head, reason: e.target.value })} placeholder="e.g. 1 unit returned — damaged in transit" /></div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Lines</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 2.5 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>HSN</label><input style={input} value={l.hsn} onChange={e => setLine(i, { hsn: e.target.value })} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Qty</label><input style={input} type="number" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Rate ₹</label><input style={input} type="number" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button type="button" onClick={() => setLines([...lines, { description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem' }}><Plus size={14} /> Add line</button>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total (incl. GST): <b style={{ color: 'var(--brand-amber)' }}>{rupee(total)}</b></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm">Create Note</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {notes.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileMinus size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No credit/debit notes yet</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['Note', 'Type', 'Party', 'Against', 'Total', 'Reason', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {notes.map(n => (
                <tr key={n.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(`/credit-debit-notes/${n.id}`)}>{n.note_number}</td>
                  <td style={{ padding: '11px 14px' }}><span style={typeBadge(n.note_type)}>{n.note_type}</span></td>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.party_name || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>{n.ref_number || '—'}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{rupee(n.total)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.reason || '—'}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/credit-debit-notes/${n.id}`)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 6 }}><Eye size={15} /></button>
                    <button onClick={() => del(n)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
