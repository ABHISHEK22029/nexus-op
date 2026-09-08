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
import { X, UserPlus, Save, Link as LinkIcon, Copy } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AddPersonModal({ roles = [], onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: '', department: '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  /* Invite by default. Setting a password for somebody means it is known to
     two people from the moment it exists, and in practice never changed —
     so the alternative is offered, not led with. */
  const [mode, setMode] = useState('invite');       // 'invite' | 'password'
  const [invite, setInvite] = useState(null);       // the link, shown once
  const [copied, setCopied] = useState(false);

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
    if (mode === 'password' && f.password.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }

    setSaving(true);
    try {
      const t = getToken();
      const res = await fetch(`${API}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({
          name: f.name.trim(), email: f.email.trim(),
          /* Omitting the password IS the invite — the server reads it that
             way and answers with a one-time link. */
          ...(mode === 'password' ? { password: f.password } : {}),
          role: f.role || undefined,
          department: f.department.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create the account');

      onSaved?.();
      if (body.invite?.path) {
        /* Shown once and never recoverable — the server stores only a hash.
           So the dialog stays open holding it rather than closing and
           leaving the owner with nothing to send. */
        setInvite(`${window.location.origin}${body.invite.path}`);
        toast.success(`${f.name.trim()} invited — send them the link`);
      } else {
        toast.success(`${f.name.trim()} can now sign in`);
        onClose();
      }
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { toast.error('Could not copy — select the link and copy it manually'); }
  };

  /* Their own mailbox, the same reasoning as emailing an invoice: it arrives
     from a person the recipient knows rather than from a server. */
  const mailLink = () => {
    const su = encodeURIComponent(`You've been added to ${f.name ? '' : ''}our Maks Ops workspace`.replace('  ', ' '));
    const body = encodeURIComponent(
      `Hello ${f.name.trim()},\n\n` +
      `I've added you to our workspace. Open this link to choose your password and sign in:\n\n` +
      `${invite}\n\n` +
      `The link works once and expires in seven days.\n`);
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(f.email.trim())}&su=${su}&body=${body}`,
      '_blank', 'noopener');
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
              They join this organisation with the role you choose, and see the company's work.
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
          <div style={{ display: 'grid', gridTemplateColumns: mode === 'password' ? '1fr 1fr' : '1fr', gap: 12 }}>
            {mode === 'password' && (
              <div style={field}>
                <label style={label}>Temporary password</label>
                <input type="text" value={f.password} onChange={e => set('password', e.target.value)}
                  placeholder="at least 8 characters" style={input} />
                <button type="button" onClick={() => setMode('invite')}
                  style={{
                    background: 'none', border: 'none', padding: 0, marginTop: 5, cursor: 'pointer',
                    fontSize: '0.73rem', color: 'var(--brand-amber)', fontWeight: 600,
                  }}>
                  Send them a link instead
                </button>
              </div>
            )}
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

          {mode === 'invite' && !invite && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '9px 11px', borderRadius: 8,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.78rem',
            }}>
              <LinkIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                They'll get a one-time link to choose their own password — you never see it.
                {' '}
                <button type="button" onClick={() => setMode('password')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-amber)', fontWeight: 600, fontSize: '0.78rem' }}>
                  Set a password for them instead
                </button>
              </span>
            </div>
          )}

          {/* The link, shown once. The server keeps only a hash of it, so if
              this dialog closes without it being copied the invite has to be
              reissued rather than looked up. */}
          {invite && (
            <div style={{
              padding: '12px 13px', borderRadius: 9,
              background: 'hsl(28,100%,54%,0.10)', border: '1px solid var(--brand-amber)',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: 6 }}>
                Send {f.name.trim()} this link
              </div>
              <div style={{
                padding: '8px 10px', borderRadius: 7, marginBottom: 9,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                fontSize: '0.74rem', color: 'var(--text-secondary)', wordBreak: 'break-all',
                fontFamily: 'var(--font-mono, monospace)',
              }}>{invite}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={copyLink} className="btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Copy size={13} /> {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={mailLink} className="btn-secondary btn-sm">
                  Open Gmail
                </button>
              </div>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '9px 0 0' }}>
                Works once, expires in seven days. It is not stored anywhere you can read it
                back — if it's lost, invite them again.
              </p>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '13px 18px', borderTop: '1px solid var(--border-subtle)',
        }}>
          {invite ? (
            <button onClick={onClose} className="btn-primary btn-sm">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={submit} disabled={saving} className="btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Save size={14} />
                {saving ? 'Working…' : mode === 'invite' ? 'Send invitation' : 'Create account'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
