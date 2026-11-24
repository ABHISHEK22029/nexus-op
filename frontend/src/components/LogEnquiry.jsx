/* ══════════════════════════════════════════════════════════
   Log an enquiry that came by phone, WhatsApp, email or at the gate.

   Enquiries could only come from the published catalogue, so most of a
   small shop's enquiries — the ones that arrive as a call — were never
   recorded anywhere. This writes one down: who asked, how to reach them,
   and what they want (a product from the list, or typed as they said it).
   It then goes through the same "Convert to quotation" as a catalogue one.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from 'react';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { Shell } from './StockActions';
import UnitSelect from './UnitSelect';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const SOURCE_LABEL = {
  catalogue: 'Catalogue', phone: 'Phone', whatsapp: 'WhatsApp', email: 'Email',
  'walk-in': 'Walk-in', referral: 'Referral', other: 'Other',
};
const SOURCES = ['phone', 'whatsapp', 'email', 'walk-in', 'referral', 'other'];
const blankLine = () => ({ skuId: '', description: '', quantity: '', unit: 'nos' });

export default function LogEnquiry({ onClose, onLogged }) {
  const [head, setHead] = useState({ name: '', company: '', phone: '', email: '', source: 'phone', message: '' });
  const [lines, setLines] = useState([blankLine()]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/skus`).then(r => (r.ok ? r.json() : [])).then(d => setProducts(Array.isArray(d) ? d : (d.items || []))).catch(() => {});
  }, []);

  const setLine = (i, patch) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  /* Picking a product fills its name and unit; the line stays editable. */
  const pickProduct = (i, id) => {
    const p = products.find(x => String(x.id) === String(id));
    setLine(i, p ? { skuId: p.id, description: p.name, unit: p.unit || 'nos' } : { skuId: '' });
  };

  const save = async () => {
    if (!head.name.trim() && !head.company.trim()) { setError('Who is asking? Give a name or a company.'); return; }
    const filled = lines.filter(l => l.description.trim());
    if (!filled.length) { setError('Add at least one thing they asked for.'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`${API}/enquiries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...head, items: filled.map(l => ({ ...l, skuId: l.skuId || null, quantity: l.quantity === '' ? null : Number(l.quantity) })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not log the enquiry');
      onLogged(d);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const lbl = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 };
  const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' };

  return (
    <Shell title="Log an enquiry" subtitle="Someone phoned, messaged or walked in asking for a price."
      icon={<Inbox size={18} />} onClose={onClose} width={640}
      footer={<>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving} data-log-enquiry-save>
          {saving ? 'Saving…' : 'Log enquiry'}
        </button>
      </>}>
      <div data-log-enquiry-form style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div><label style={lbl} htmlFor="le-name">Their name</label><input id="le-name" style={input} autoFocus value={head.name} onChange={e => setHead(h => ({ ...h, name: e.target.value }))} placeholder="Ravi Kumar" /></div>
          <div><label style={lbl} htmlFor="le-company">Company</label><input id="le-company" style={input} value={head.company} onChange={e => setHead(h => ({ ...h, company: e.target.value }))} placeholder="optional" /></div>
          <div><label style={lbl} htmlFor="le-source">Came by</label>
            <select id="le-source" style={input} value={head.source} onChange={e => setHead(h => ({ ...h, source: e.target.value }))}>
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </div>
          <div><label style={lbl} htmlFor="le-phone">Phone</label><input id="le-phone" style={input} value={head.phone} onChange={e => setHead(h => ({ ...h, phone: e.target.value }))} placeholder="to call back" /></div>
          <div><label style={lbl} htmlFor="le-email">Email</label><input id="le-email" style={input} value={head.email} onChange={e => setHead(h => ({ ...h, email: e.target.value }))} placeholder="optional" /></div>
        </div>

        <div>
          <div style={{ ...lbl, marginBottom: 6 }}>What they asked for</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }} data-enquiry-line={i}>
              <select style={{ ...input, flex: '1 1 150px' }} value={l.skuId} onChange={e => pickProduct(i, e.target.value)} aria-label={`Line ${i + 1} product`}>
                <option value="">{products.length ? 'Pick a product, or type below' : 'Type what they want'}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input style={{ ...input, flex: '2 1 180px' }} value={l.description} onChange={e => setLine(i, { description: e.target.value })}
                placeholder="e.g. SS304 bracket, brushed" aria-label={`Line ${i + 1} description`} />
              <input style={{ ...input, flex: '0 0 80px' }} type="number" min="0" step="any" value={l.quantity}
                onChange={e => setLine(i, { quantity: e.target.value })} placeholder="Qty" aria-label={`Line ${i + 1} quantity`} />
              <div style={{ flex: '0 0 92px' }}><UnitSelect style={input} value={l.unit} onChange={v => setLine(i, { unit: v })} ariaLabel={`Line ${i + 1} unit`} /></div>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} aria-label={`Remove line ${i + 1}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setLines(ls => [...ls, blankLine()])}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-amber)', fontWeight: 600, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={13} /> Add a line
          </button>
        </div>

        <div><label style={lbl} htmlFor="le-msg">Notes</label>
          <textarea id="le-msg" style={{ ...input, minHeight: 60, resize: 'vertical' }} value={head.message}
            onChange={e => setHead(h => ({ ...h, message: e.target.value }))} placeholder="Finish, delivery date, drawings promised…" />
        </div>
        {error && <div role="alert" style={{ color: 'var(--accent-red, #dc2626)', fontSize: '0.82rem' }}>{error}</div>}
      </div>
    </Shell>
  );
}
