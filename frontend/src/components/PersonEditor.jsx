/* ══════════════════════════════════════════════════════════
   PersonEditor — who somebody is, not what they may do.

   Deliberately separate from the role dropdown. Correcting a spelling and
   granting somebody write access to every invoice in the business are
   different kinds of change: one is ordinary editing, the other is audited,
   guarded, and refused if you try it on yourself. They travel through
   different endpoints, so they get different controls.

   "What they do" is the job — Shop floor supervisor, Quality inspector. It
   is not the role, and conflating the two is how people end up on
   Administrator because their job title sounded senior.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { formProblems } from '../lib/validators';

export default function PersonEditor({ person, people, onCancel, onSave }) {
  const [f, setF] = useState({
    id: person.id,
    name: person.name || '',
    employee_code: person.employee_code || '',
    job_title: person.job_title || '',
    department: person.department || '',
    phone: person.phone || '',
    reports_to: person.reports_to || '',
    notes: person.notes || '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  /* A phone that is not a phone is said under the field, once you leave it
     or press Save; the number they already had is not re-checked. */
  const [touched, setTouched] = useState(false);
  const problems = formProblems(f, { phone: 'phone' }, { original: { phone: person.phone || '' } });
  const phoneError = touched ? problems.phone : null;

  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
  };
  const lbl = { display: 'grid', gap: 4, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' };

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 540, background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)', borderRadius: 16, padding: 22,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{person.name || person.email}</h3>
          <button onClick={onCancel} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {person.email} — role and access are changed from the list
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={lbl}>Name
            <input style={input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ravi Kumar" />
          </label>
          <label style={lbl}>Works number
            <input style={input} value={f.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="EMP-0142" />
          </label>
          <label style={lbl}>What they do
            <input style={input} value={f.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Shop floor supervisor" />
          </label>
          <label style={lbl}>Department
            <input style={input} value={f.department} onChange={e => set('department', e.target.value)} placeholder="Fabrication" />
          </label>
          <label style={lbl}>Phone
            <input style={{ ...input, borderColor: phoneError ? '#dc2626' : undefined, boxShadow: phoneError ? 'inset 0 0 0 1px #dc2626' : undefined }} value={f.phone} onChange={e => set('phone', e.target.value)}
              onBlur={() => setTouched(true)} placeholder="98850 00000" type="tel" inputMode="tel" autoComplete="off" aria-invalid={!!phoneError} />
            {phoneError && <span role="alert" style={{ fontSize: '0.72rem', fontWeight: 500, color: '#dc2626' }}>{phoneError}</span>}
          </label>
          <label style={lbl}>Reports to
            <select style={input} value={f.reports_to || ''} onChange={e => set('reports_to', e.target.value)}>
              <option value="">— nobody —</option>
              {people.filter(p => p.id !== person.id).map(p => (
                <option key={p.id} value={p.id}>{p.name || p.email}</option>
              ))}
            </select>
          </label>
          <label style={{ ...lbl, gridColumn: '1 / -1' }}>Notes
            <input style={input} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth knowing about this account" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={() => { setTouched(true); if (!problems.phone) onSave(f); }} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} /> Save
          </button>
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          {phoneError && <span role="alert" style={{ alignSelf: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>Fix the phone number before saving</span>}
        </div>
      </div>
    </div>
  );
}
