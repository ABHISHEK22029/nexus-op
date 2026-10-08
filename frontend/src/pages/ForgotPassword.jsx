/* ══════════════════════════════════════════════════════════
   Forgot password — a code by email, then a new password.

   /forgot-password  asks for the email and sends the code.
   /reset-password   is where the email's button lands: the address is
                     filled in and the code is asked for straight away.

   The server answers "if an account exists, we've sent a code" whatever
   the address, so this screen never says whether someone has an account.
   Where email isn't set up on the server, it says so and explains the
   other way back in, instead of offering a form that sends nothing.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, Building2, MailCheck, Check, X, KeyRound } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SUPPORT = import.meta.env.VITE_SUPPORT_EMAIL || '';
const RESEND_AFTER = 60;   // seconds before another code can be asked for

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

/* The same rules the server applies (PasswordResetController), shown as
   they are met rather than discovered one refusal at a time. */
const rulesFor = (pw, email) => [
  ['At least 8 characters', pw.length >= 8 && new TextEncoder().encode(pw).length <= 72],
  ['A letter and a number', /[A-Za-z]/.test(pw) && /[0-9]/.test(pw)],
  ['Not your email address', !!pw && pw.trim().toLowerCase() !== email.trim().toLowerCase()],
];

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get('email') || '');
  const [step, setStep] = useState(() => (pathname.startsWith('/reset-password') && params.get('email') ? 'code' : 'email'));
  const [available, setAvailable] = useState(null);           // can the server send email?
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({ text: '', field: '' });
  const [sentNote, setSentNote] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    let gone = false;
    fetch(`${API}/auth/reset-available`).then(r => r.json()).then(d => { if (!gone) setAvailable(!!d.email); })
      .catch(() => { if (!gone) setAvailable(true); });   // let the request itself say what is wrong
    return () => { gone = true; };
  }, []);

  /* The resend countdown. */
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const rules = useMemo(() => rulesFor(password, email), [password, email]);
  const rulesMet = rules.every(([, ok]) => ok);
  const matches = confirm.length > 0 && confirm === password;

  const sendCode = async (e) => {
    e?.preventDefault();
    setError({ text: '', field: '' });
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { setError({ text: 'Enter the email address you sign in with.', field: 'email' }); return; }
    setBusy(true);
    try {
      const r = await post('/auth/forgot-password', { email: addr });
      if (r.data.notConfigured) { setAvailable(false); return; }
      if (!r.ok) { setError({ text: r.data.error || 'The code could not be sent. Try again.', field: 'email' }); return; }
      setSentNote(r.data.message);
      setStep('code');
      setCode('');
      setWait(RESEND_AFTER);
    } catch {
      setError({ text: 'Could not reach Maks Ops. Check your connection and try again.', field: '' });
    } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError({ text: '', field: '' });
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { setError({ text: 'Enter the 6-digit code from the email.', field: 'code' }); return; }
    if (!rulesMet) { setError({ text: 'Choose a password that meets all three rules below.', field: 'password' }); return; }
    if (!matches) { setError({ text: 'The two passwords are not the same.', field: 'confirm' }); return; }
    setBusy(true);
    try {
      const r = await post('/auth/reset-password', { email: email.trim(), code: digits, password });
      if (!r.ok) { setError({ text: r.data.error || 'The password could not be changed. Try again.', field: r.data.field || '' }); return; }
      navigate(`/login?reset=1&email=${encodeURIComponent(r.data.email || email.trim())}`, { replace: true });
    } catch {
      setError({ text: 'Could not reach Maks Ops. Check your connection and try again.', field: '' });
    } finally { setBusy(false); }
  };

  const input = (bad) => ({
    width: '100%', boxSizing: 'border-box', padding: '12px 14px',
    background: 'var(--bg-elevated)', border: `1px solid ${bad ? 'var(--accent-red)' : 'var(--border-default)'}`,
    borderRadius: 10, fontSize: '0.9rem', color: 'var(--text-primary)', outline: 'none',
  });
  const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };
  const primary = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    padding: '13px 20px', borderRadius: 10, border: 'none', background: 'var(--brand-amber)', color: 'white',
    fontWeight: 700, fontSize: '0.9rem', cursor: busy ? 'wait' : 'pointer', boxShadow: 'var(--shadow-amber)', opacity: busy ? 0.8 : 1,
  };
  const linkBtn = { background: 'none', border: 0, padding: 0, color: 'var(--brand-amber)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: 'var(--brand-amber-muted)',
            border: '1px solid var(--brand-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-amber)',
          }}>
            <Building2 size={28} style={{ color: 'var(--brand-amber)' }} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Maks<span style={{ color: 'var(--brand-amber)' }}>Ops</span>
          </h1>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 32, boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            <KeyRound size={18} style={{ color: 'var(--brand-amber)' }} /> {step === 'code' ? 'Enter the code' : 'Reset your password'}
          </h2>

          {available === false ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <p style={{ marginTop: 8 }}>Password reset by email is not set up on this Maks Ops yet. Two ways back in:</p>
              <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
                <li style={{ marginBottom: 6 }}><b>On a team:</b> ask your company's owner. They can set a new password for you under <b>Team</b> → your name → <b>Reset password</b>.</li>
                <li><b>The owner:</b> {SUPPORT ? <>write to <a href={`mailto:${SUPPORT}?subject=${encodeURIComponent('Password reset')}`} style={{ color: 'var(--brand-amber)' }}>{SUPPORT}</a> from your registered email address.</> : 'contact the person who set up Maks Ops for your company.'}</li>
              </ul>
            </div>
          ) : step === 'email' ? (
            <form onSubmit={sendCode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Enter the email you sign in with. We will send a 6-digit code to it.
              </p>
              {error.text && <Alert text={error.text} />}
              <div>
                <label htmlFor="fp-email" style={label}>Email address</label>
                <input id="fp-email" type="email" autoComplete="username" autoFocus value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" style={input(error.field === 'email')} aria-invalid={error.field === 'email'} />
              </div>
              <button type="submit" disabled={busy || available === null} style={primary}>
                {busy && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={reset} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
              <div role="status" style={{ display: 'flex', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                <MailCheck size={16} style={{ color: 'var(--accent-emerald)', flex: 'none', marginTop: 1 }} />
                <span>
                  {sentNote || 'If an account exists for that email, we have sent it a 6-digit code. It works for 15 minutes.'}{' '}
                  Sent to <b style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{email}</b>. Check spam if it is not in your inbox.
                </span>
              </div>
              {error.text && <Alert text={error.text} />}
              <div>
                <label htmlFor="fp-code" style={label}>6-digit code</label>
                <input id="fp-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7}
                  value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123 456"
                  style={{ ...input(error.field === 'code'), fontFamily: 'var(--font-mono)', fontSize: '1.3rem', letterSpacing: '0.3em', textAlign: 'center' }}
                  aria-invalid={error.field === 'code'} />
              </div>
              <div>
                <label htmlFor="fp-password" style={label}>New password</label>
                <div style={{ position: 'relative' }}>
                  <input id="fp-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password}
                    onChange={e => setPassword(e.target.value)} style={{ ...input(error.field === 'password'), paddingRight: 44 }}
                    aria-invalid={error.field === 'password'} aria-describedby="fp-rules" />
                  <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <ul id="fp-rules" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 3 }}>
                  {rules.map(([text, ok]) => (
                    <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: ok ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      {ok ? <Check size={13} /> : <X size={13} />} {text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label htmlFor="fp-confirm" style={label}>Type it again</label>
                <input id="fp-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} style={input(error.field === 'confirm' || (confirm && !matches))}
                  aria-invalid={error.field === 'confirm'} />
                {confirm && !matches && <div style={{ fontSize: '0.74rem', color: 'var(--accent-red)', marginTop: 4 }}>Not the same as above yet.</div>}
              </div>
              <button type="submit" disabled={busy} style={primary}>
                {busy && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {busy ? 'Changing…' : 'Change password'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...linkBtn, opacity: wait > 0 ? 0.55 : 1, cursor: wait > 0 || busy ? 'default' : 'pointer' }}
                  disabled={wait > 0 || busy} onClick={() => sendCode()}>
                  {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
                </button>
                <button type="button" style={linkBtn} onClick={() => { setStep('email'); setError({ text: '', field: '' }); setCode(''); }}>
                  Use a different email
                </button>
              </div>
            </form>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 22, marginBottom: 0 }}>
            Remembered it? <Link to={`/login${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`} style={{ color: 'var(--brand-amber)', fontWeight: 700, textDecoration: 'none' }}>Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Alert({ text }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'hsl(0,80%,55%,0.08)',
      border: '1px solid hsl(0,80%,55%,0.3)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--accent-red)',
    }}>
      <AlertCircle size={14} style={{ flex: 'none', marginTop: 2 }} /> <span>{text}</span>
    </div>
  );
}
