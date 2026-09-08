/* ══════════════════════════════════════════════════════════
   Where an invited person lands.

   Unauthenticated, because they have no password yet — that is what they
   are here to choose. The link is the credential.

   It shows who invited them and into which organisation BEFORE asking for
   a password. Somebody following a link from a message should be able to
   tell whether it is the company they expect, and a form that asks for a
   password without saying what it is for is a form people are right to
   distrust.

   Nothing here lets them choose a role or an organisation. Both were
   decided by whoever sent the invite; the server ignores them if sent.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Building2, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [invite, setInvite] = useState(null);
  const [state, setState] = useState('checking');   // checking | ready | invalid
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`${API}/auth/invite/${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setInvite(d); setState('ready'); } else setState('invalid'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) return setErr('Choose a password of at least 8 characters');
    if (password !== confirm) return setErr('The two passwords do not match');
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/accept-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not accept the invitation');
      localStorage.setItem('nexus_token', body.token);
      /* Hard navigation so every context provider starts with the token
         present, the same as after a normal sign-in. */
      window.location.assign('/dashboard');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  const card = {
    width: '100%', maxWidth: 420, background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)', borderRadius: 16, padding: 28,
  };
  const input = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 9,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
  };
  const label = { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg-base)',
    }}>
      <div style={card}>
        {state === 'checking' && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
            <Loader2 size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Checking your invitation…
          </p>
        )}

        {state === 'invalid' && (
          <div style={{ textAlign: 'center' }}>
            <AlertCircle size={26} style={{ color: '#dc2626', marginBottom: 10 }} />
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>
              This invitation is no longer valid
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: '0 0 16px' }}>
              Invitations expire after seven days, and each one can be used once.
              Ask whoever invited you to send a new link.
            </p>
            <Link to="/login" style={{ color: 'var(--brand-amber)', fontWeight: 700, fontSize: '0.86rem' }}>
              Go to sign in
            </Link>
          </div>
        )}

        {state === 'ready' && invite && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Building2 size={22} style={{ color: 'var(--brand-amber)' }} />
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Join {invite.organisation || 'the team'}
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: '0 0 20px' }}>
              You've been invited as <strong style={{ color: 'var(--text-secondary)' }}>{invite.role}</strong>.
              Choose a password and you're in — nobody else will know it.
            </p>

            <div style={{
              padding: '10px 12px', borderRadius: 9, marginBottom: 18,
              background: 'var(--bg-elevated)', fontSize: '0.84rem', color: 'var(--text-secondary)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{invite.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{invite.email}</div>
            </div>

            <form onSubmit={submit}>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>Choose a password</label>
                <div style={{ position: 'relative' }}>
                  <input type={show ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters" style={{ ...input, paddingRight: 40 }} />
                  <button type="button" onClick={() => setShow(s => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0,
                    }}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={label}>Type it again</label>
                <input type={show ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)} style={input} />
              </div>

              {err && (
                <div style={{
                  display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 14,
                  padding: '9px 11px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.10)', color: '#dc2626', fontSize: '0.82rem',
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary"
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px' }}>
                {busy
                  ? <><Loader2 size={15} /> Setting up…</>
                  : <><CheckCircle2 size={15} /> Set my password and sign in</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
