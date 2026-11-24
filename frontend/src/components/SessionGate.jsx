/* ══════════════════════════════════════════════════════════
   SessionGate — sign in again without losing the page.

   When the session ends (12 hours, a password change, an account switched
   off), lib/apiAuth.js holds every request and this box opens over the
   screen. The screen underneath is left exactly as it was: what was typed
   stays typed, and the request that was refused goes through once the
   person is back in.

   Mounted by ProtectedRoute, so it covers every signed-in screen. The page
   behind is blurred and made inert while the box is open: the session has
   ended, so nobody walking up to the computer can carry on working in it.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { onSessionGate, resumeSession, endSession } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* The server's own words when they say something a person can act on
   ("Your password was changed"); a plain sentence for the generic ones. */
const GENERIC = /^(authentication required|invalid or expired session|not signed in|session no longer valid|sign in again)\.?$/i;

export default function SessionGate() {
  const [state, setState] = useState(null);
  useEffect(() => onSessionGate(setState), []);
  if (!state) return null;
  return createPortal(<Box state={state} />, document.body);
}

function Box({ state }) {
  const known = state.user?.email || '';
  const [email, setEmail] = useState(known);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const passRef = useRef(null);
  const emailRef = useRef(null);
  const panelRef = useRef(null);

  /* The page behind can't be clicked or tabbed into while signed out, and
     the cursor goes back where it was once the person is in again. */
  useEffect(() => {
    const before = document.activeElement;
    const root = document.getElementById('root');
    if (root) root.inert = true;
    (known ? passRef.current : emailRef.current)?.focus();
    return () => {
      if (root) root.inert = false;
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr(known ? 'Enter your password to carry on.' : 'Enter your email and password.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(data.error || 'That did not work. Try again.');
      resumeSession(data);       // the same person carries on; anyone else goes to their own dashboard
    } catch (ex) {
      setErr(ex.message || 'That did not work. Try again.');
      setPassword('');
      setBusy(false);
      passRef.current?.focus();
    }
  };

  const reason = state.reason && !GENERIC.test(state.reason.trim()) ? state.reason : '';

  return (
    <div className="sg-overlay" data-session-gate>
      <div className="sg-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sg-title" aria-describedby="sg-msg">
        <div className="sg-head">
          <span className="sg-icon" aria-hidden="true"><Lock size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 id="sg-title" className="sg-title">Sign in again to carry on</h2>
            <p id="sg-msg" className="sg-msg">
              {reason || 'Your session has ended.'}{' '}
              Everything on this page is kept as you left it, and anything you were saving goes through once you are signed in.
            </p>
          </div>
        </div>

        <form className="sg-form" onSubmit={submit} noValidate>
          {known ? (
            <div className="sg-who" data-session-gate-who>
              <span className="sg-label">Signed in as</span>
              <span className="sg-email">{known}</span>
            </div>
          ) : (
            <label className="sg-field">
              <span className="sg-label">Email</span>
              <input ref={emailRef} type="email" autoComplete="username" value={email}
                onChange={e => { setEmail(e.target.value); setErr(''); }} data-session-gate-email />
            </label>
          )}
          {/* For the browser's password manager: the account the password belongs to. */}
          {known && <input type="email" autoComplete="username" value={known} readOnly hidden />}
          <label className="sg-field">
            <span className="sg-label">Password</span>
            <span className="sg-pass">
              <input ref={passRef} type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={e => { setPassword(e.target.value); setErr(''); }} data-session-gate-password />
              <button type="button" className="sg-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
          {err && <div role="alert" className="sg-err" data-session-gate-error>{err}</div>}

          <div className="sg-actions">
            <a className="sg-link" href="/forgot-password" target="_blank" rel="noopener noreferrer">Forgot password?</a>
            <span className="sg-spacer" />
            <button type="button" className="cd-btn" onClick={endSession} data-session-gate-signout>
              {known ? 'Not you? Sign out' : 'Sign out'}
            </button>
            <button type="submit" className="cd-btn cd-btn-ok" disabled={busy} data-session-gate-submit>
              {busy ? <><Loader2 size={14} style={{ verticalAlign: '-2px', marginRight: 6, animation: 'spin 1s linear infinite' }} />Signing in…</> : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
