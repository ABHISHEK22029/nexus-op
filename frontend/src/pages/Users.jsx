import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, ShieldCheck, ShieldOff, Lock } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ROLES = ['Admin', 'Manager', 'Staff', 'User', 'Viewer'];
const DEPTS = ['—', 'Management', 'Procurement', 'Finance', 'Production', 'Sales', 'Site / Field', 'Stores'];
const roleHint = { Admin: 'Full access + team management', Manager: 'Full operational access', Staff: 'Create & edit', User: 'Create & edit', Viewer: 'Read-only' };

export default function Users() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    const res = await fetch(`${API}/users`);
    if (res.status === 403) { setForbidden(true); return; }
    if (res.ok) setRows(await res.json());
  };
  useEffect(() => { load(); }, []);

  const patch = async (id, body, msg) => {
    const res = await fetch(`${API}/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
    toast.success(msg || 'Updated'); load();
  };

  if (forbidden) return (
    <div style={{ maxWidth: 560, margin: '60px auto 0', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Lock size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
      <h2 style={{ color: 'var(--text-primary)' }}>Team management is Admin-only</h2>
      <p style={{ marginTop: 8 }}>Only an Admin can view and manage users, roles and departments.</p>
    </div>
  );

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const sel = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600 };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <UsersIcon size={24} style={{ color: 'var(--brand-amber)' }} /> Team &amp; Access
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Assign roles and departments. <b>Viewer</b> is read-only (enforced on the server); everyone else can create &amp; edit.</p>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
            {['User', 'Role', 'Access', 'Department', 'Status', ''].map(h => <th key={h} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.name || '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</div>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <select style={sel} value={u.role} onChange={e => patch(u.id, { role: e.target.value }, `${u.name || u.email} is now ${e.target.value}`)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '11px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{roleHint[u.role] || ''}</td>
                <td style={{ padding: '11px 14px' }}>
                  <select style={sel} value={u.department || '—'} onChange={e => patch(u.id, { department: e.target.value === '—' ? null : e.target.value }, 'Department updated')}>
                    {DEPTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                  </select>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 700, color: u.is_active ? '#10b981' : 'var(--text-muted)' }}>
                    {u.is_active ? <ShieldCheck size={14} /> : <ShieldOff size={14} />} {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  <button onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? 'User disabled' : 'User enabled')} className="btn-secondary" style={{ fontSize: '0.76rem', padding: '5px 11px' }}>
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
