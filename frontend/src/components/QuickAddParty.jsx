/* ══════════════════════════════════════════════════════════
   Add a customer or vendor without leaving the form.

   A new company opened "New order" and found the customer list empty, with
   no way to add one there. Leaving for the Customers page threw away what
   had been typed. This box asks only what the document needs — the name,
   the state (it decides CGST+SGST or IGST) and, if they have one, the
   GSTIN — saves it, and hands the new record back so the form can select
   it. The full record can be filled in later on the Customers or Vendors
   page.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { UserPlus, Building2 } from 'lucide-react';
import { Shell } from './StockActions';
import { useToast } from '../context/ToastContext';
import { GST_STATES, stateCode } from '../lib/gstStates';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const nameOf = (code) => (GST_STATES.find(([c]) => c === code) || [])[1] || '';

/* The value a <select> uses for "+ New customer…". */
export const ADD_NEW = '__add_new__';

/* One <option> at the end of a customer or vendor <select>. */
export function AddNewOption({ kind = 'customer' }) {
  return <option value={ADD_NEW}>+ New {kind}…</option>;
}

/* A customer or vendor <select> that can add one on the spot. `onChange`
   gets the chosen id as a string; a party added here is put into the list
   (through setParties) and chosen. */
export function PartySelect({ kind = 'customer', parties = [], setParties, value, onChange, style, placeholder, ariaLabel, disabled, labelOf }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <select style={style} value={value ?? ''} disabled={disabled} aria-label={ariaLabel || (kind === 'vendor' ? 'Vendor' : 'Customer')}
        data-party-select={kind}
        onChange={e => (e.target.value === ADD_NEW ? setAdding(true) : onChange(e.target.value))}>
        <option value="">{placeholder || `— Select ${kind} —`}</option>
        {parties.map(p => <option key={p.id} value={p.id}>{labelOf ? labelOf(p) : p.name}</option>)}
        <AddNewOption kind={kind} />
      </select>
      {parties.length === 0 && !disabled && (
        <button type="button" onClick={() => setAdding(true)} data-party-first={kind}
          style={{ marginTop: 4, padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary, var(--accent))', fontSize: '0.76rem', fontWeight: 600 }}>
          + Add your first {kind}
        </button>
      )}
      {adding && (
        <QuickAddParty kind={kind} onClose={() => setAdding(false)}
          onAdded={(p) => {
            setAdding(false);
            setParties?.(prev => [...(prev || []), p].sort((a, b) => String(a.name).localeCompare(String(b.name))));
            onChange(String(p.id), p);
          }} />
      )}
    </>
  );
}

export default function QuickAddParty({ kind = 'customer', initialName = '', onClose, onAdded }) {
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [gstin, setGstin] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isVendor = kind === 'vendor';

  /* A GSTIN's first two digits are the state, so typing one fills it in. */
  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s+/g, '');
    setGstin(g);
    const code = g.length >= 2 ? stateCode(g.slice(0, 2)) : null;
    if (code) setState(code);
  };

  const save = async (e) => {
    e?.preventDefault();
    const n = name.trim();
    if (!n) { setError(`Give the ${kind} a name.`); return; }
    if (gstin && gstin.length !== 15) { setError(`A GSTIN is 15 characters; this has ${gstin.length}. Leave it empty if they don't have one.`); return; }
    setSaving(true); setError('');
    const stateName = nameOf(state) || null;
    const body = isVendor
      ? { name: n, type: 'Supplier', gstin: gstin || null, state: stateName, contactPhone: phone || null }
      : { name: n, gstin: gstin || null, state: stateName, shipping_state: stateName, phone: phone || null };
    try {
      const r = await fetch(`${API}/${isVendor ? 'vendors' : 'customers'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error || `Could not add the ${kind}`);
      toast.success(`${n} added`);
      onAdded({ id: d.id, ...body });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.86rem', boxSizing: 'border-box', outline: 'none' };

  return (
    <Shell
      title={isVendor ? 'New vendor' : 'New customer'}
      subtitle={`Just what this document needs. Add the rest later on the ${isVendor ? 'Vendors' : 'Customers'} page.`}
      icon={isVendor ? <Building2 size={18} /> : <UserPlus size={18} />}
      onClose={onClose}
      width={460}
      footer={<>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" data-quick-add-save onClick={save} disabled={saving}>
          {saving ? 'Saving…' : `Add ${kind}`}
        </button>
      </>}
    >
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }} data-quick-add={kind}>
        <div>
          <label style={label} htmlFor="qa-name">Name *</label>
          <input id="qa-name" style={input} value={name} autoFocus onChange={e => setName(e.target.value)}
            placeholder={isVendor ? 'e.g. Deccan Metals' : 'e.g. Apollo Engineering'} />
        </div>
        <div>
          <label style={label} htmlFor="qa-gstin">GSTIN <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(if they have one)</span></label>
          <input id="qa-gstin" style={input} value={gstin} maxLength={15} onChange={e => onGstin(e.target.value)} placeholder="15 characters" />
        </div>
        <div>
          <label style={label} htmlFor="qa-state">State</label>
          <select id="qa-state" style={input} value={state} onChange={e => setState(e.target.value)}>
            <option value="">— Pick the state —</option>
            {GST_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {isVendor ? 'Decides whether their bills carry IGST or CGST + SGST.' : 'Decides whether GST is IGST or CGST + SGST.'}
          </div>
        </div>
        <div>
          <label style={label} htmlFor="qa-phone">Phone</label>
          <input id="qa-phone" style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="optional" />
        </div>
        {error && <div role="alert" style={{ color: 'var(--danger, #dc2626)', fontSize: '0.82rem' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Shell>
  );
}
