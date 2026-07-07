import React, { useState, useEffect } from 'react';
import { Workflow, ShieldCheck, Bell, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Automation() {
  const toast = useToast();
  const [threshold, setThreshold] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API}/automation-settings`).then(r => r.ok ? r.json() : {}).then(d => {
      setThreshold(d.po_approval_threshold ? String(d.po_approval_threshold) : '');
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    const res = await fetch(`${API}/automation-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ po_approval_threshold: Number(threshold) || 0 }) });
    if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
    toast.success('Automation settings saved');
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 22 };
  const input = { width: 220, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700, outline: 'none' };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Workflow size={24} style={{ color: 'var(--brand-amber)' }} /> Automation
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Rules that run themselves — no scripting. More coming (recurring invoices, workflow rules).</p>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          <ShieldCheck size={18} style={{ color: 'var(--brand-amber)' }} /> Purchase Order approval
        </div>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          Any PO whose value is <b>above this limit</b> is held for sign-off before it can be approved — and your admins get a notification. Set to <b>0</b> to require no approval.
        </p>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>PO approval threshold (₹)</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input style={input} type="number" min="0" placeholder="e.g. 50000" value={threshold} onChange={e => setThreshold(e.target.value)} disabled={!loaded} />
          <button onClick={save} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> Save</button>
        </div>
        {Number(threshold) > 0 && <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-muted)' }}>POs over <b>₹{Number(threshold).toLocaleString('en-IN')}</b> will need sign-off.</div>}
      </div>

      <div style={{ ...card, opacity: 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          <Bell size={18} style={{ color: 'var(--text-muted)' }} /> Coming next in Automation
        </div>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.9 }}>
          <li>Recurring invoices &amp; POs (schedules)</li>
          <li>Workflow rules — “when X happens, do Y” (notify / update / email)</li>
          <li>Licence-expiry &amp; overdue-bill reminders</li>
        </ul>
      </div>
    </div>
  );
}
