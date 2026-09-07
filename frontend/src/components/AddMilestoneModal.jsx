/* ══════════════════════════════════════════════════════════
   Adding a milestone.

   The Milestones screen offered four status filters over a list that could
   only ever contain rows the seeder had put there — the table had GET and
   PATCH and no POST, so nothing in the product could create one. The
   endpoint is new; this is its form.

   A milestone belongs to a work order and inherits its ownership from it,
   so the work order is the one thing that must be chosen.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { X, Flag, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AddMilestoneModal({ onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [f, setF] = useState({
    workOrderId: '', name: '', plannedPercent: '', actualPercent: '', remarks: '',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    const t = getToken();
    fetch(`${API}/work-orders?limit=200`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(r => (r.ok ? r.json() : []))
      .then(d => setWorkOrders(Array.isArray(d) ? d : d.items || []))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!f.workOrderId) return toast.error('Choose the work order this milestone belongs to');
    if (!f.name.trim()) return toast.error('Give the milestone a name');

    setSaving(true);
    try {
      const t = getToken();
      const res = await fetch(`${API}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({
          workOrderId: Number(f.workOrderId),
          name: f.name.trim(),
          plannedPercent: f.plannedPercent === '' ? undefined : Number(f.plannedPercent),
          actualPercent: f.actualPercent === '' ? undefined : Number(f.actualPercent),
          remarks: f.remarks.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not add the milestone');
      toast.success(`${f.name.trim()} added`);
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none',
  };
  const field = { marginBottom: 13 };

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 470,
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.3))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <Flag size={17} style={{ color: 'var(--brand-amber)' }} /> Add a milestone
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              A stage of a work order, with the progress you expect against it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={field}>
            <label style={label}>Work order</label>
            <select value={f.workOrderId} onChange={e => set('workOrderId', e.target.value)} style={input}>
              <option value="">— choose —</option>
              {workOrders.map(w => (
                <option key={w.id} value={w.id}>{w.name || `Work order #${w.id}`}</option>
              ))}
            </select>
            {workOrders.length === 0 && (
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>
                No work orders yet — a milestone hangs off one, so raise a work order first.
              </p>
            )}
          </div>

          <div style={field}>
            <label style={label}>Milestone</label>
            <input value={f.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Fabrication complete, ready for coating" style={input} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={field}>
              <label style={label}>
                Planned % <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span>
              </label>
              <input type="number" min="0" max="100" value={f.plannedPercent}
                onChange={e => set('plannedPercent', e.target.value)} placeholder="0–100" style={input} />
            </div>
            <div style={field}>
              <label style={label}>
                Actual % <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span>
              </label>
              <input type="number" min="0" max="100" value={f.actualPercent}
                onChange={e => set('actualPercent', e.target.value)} placeholder="0–100" style={input} />
            </div>
          </div>

          <div style={field}>
            <label style={label}>
              Remarks <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span>
            </label>
            <input value={f.remarks} onChange={e => set('remarks', e.target.value)}
              placeholder="Anything worth knowing about this stage" style={input} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '13px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} />{saving ? 'Adding…' : 'Add milestone'}
          </button>
        </div>
      </div>
    </div>
  );
}
