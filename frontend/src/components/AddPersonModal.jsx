/* ══════════════════════════════════════════════════════════
   Adding somebody to the team.

   POST /admin/users has been routed and working the whole time. Nothing in
   the interface called it, so the only ways a second person could get a
   login were the public /auth/register form or an INSERT run by hand.

   That is the same shape of hole as Stock on hand: a finished endpoint
   with no door. It matters more here, because an ERP nobody but the
   founder can sign into is not multi-user software.

   The role list is fetched rather than hardcoded — the backend rejects any
   role missing from role_definitions, and a dropdown offering a role the
   server will refuse is worse than no dropdown.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AddPersonModal({ roles = [], onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: '', department: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  /* Default to the least access, not the most. Somebody being added in a
     hurry should not silently arrive as an Administrator. */
  useEffect(() => {
    if (!f.role && roles.length) {
      const viewer = roles.find(r => /viewer/i.test(r.role || r.name || r));
      set('role', viewer ? (viewer.role || viewer.name || viewer) : (roles[0].role || roles[0].name || roles[0]));
    }
  }, [roles]);

  const submit = async () => {
    if (!f.name.trim()) return toast.error('Enter their name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return toast.error('Enter a valid email address');
    /* Mirrors the server's rule so the failure is caught before a round
       trip, not after. */
    if (f.password.length < 8) return toast.error('Password must be at least 8 characters');

    setSaving(true);
    try {
      const t = getToken();
      const res = await fetch(`${API}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({
          name: f.name.trim(), email: f.email.trim(),
          password: f.password, role: f.role || undefined,
          department: f.department.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create the account');
      toast.success(`${f.name.trim()} can now sign in`);
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
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              display: 'flex', alignItems: 'center', gap: 8, margin: 0,
              fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)',
            }}>
              <UserPlus size={17} style={{ color: 'var(--brand-amber)' }} /> Add someone to the team
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              They will be able to sign in straight away. Ask them to change the password afterwards.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={field}>
            <label style={label}>Name</label>
            <input value={f.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Ramesh Kumar" style={input} />
          </div>
          <div style={field}>
            <label style={label}>Email</label>
            <input type="email" value={f.email} onChange={e => set('email', e.target.value)}
              placeholder="they sign in with this" style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={field}>
              <label style={label}>Temporary password</label>
              <input type="text" value={f.password} onChange={e => set('password', e.target.value)}
                placeholder="at least 8 characters" style={input} />
            </div>
            <div style={field}>
              <label style={label}>Role</label>
              <select value={f.role} onChange={e => set('role', e.target.value)} style={input}>
                {roles.map(r => {
                  const v = r.role || r.name || r;
                  return <option key={v} value={v}>{r.label || v}</option>;
                })}
              </select>
            </div>
          </div>
          <div style={field}>
            <label style={label}>
              What they do <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span>
            </label>
            <input value={f.department} onChange={e => set('department', e.target.value)}
              placeholder="e.g. Purchase, Stores, Accounts" style={input} />
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '13px 18px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} />{saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}
