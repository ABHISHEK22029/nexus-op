import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, Building2, Sparkles } from 'lucide-react';

const DEMO_EMAIL = 'admin@nexusop.com';
const DEMO_PASSWORD = 'admin123';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localErr, setLocalErr] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  // Reveal + prefill the demo login only when the user asks for it —
  // credentials are never forced onto the screen.
  const revealDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setShowPass(true);
    setShowDemo(true);
    setLocalErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    if (!email || !password) { setLocalErr('Enter email and password'); return; }
    try {
      await login(email, password);
      // Hard navigation so all context providers re-init WITH the token
      // present (ProjectProvider fetches /projects once on mount).
      window.location.assign('/dashboard');
    } catch (err) {
      setLocalErr(err.message || 'Login failed');
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10, fontSize: '0.9rem',
    color: 'var(--text-primary)', outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', padding: 24,
    }}>
      {/* Ambient background blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--brand-amber-muted) 0%, transparent 70%)',
          animation: 'float-blob 12s ease-in-out infinite',
        }}/>
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(213,94%,68%,0.06) 0%, transparent 70%)',
          animation: 'float-blob-2 15s ease-in-out infinite',
        }}/>
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo + Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'var(--brand-amber-muted)', border: '1px solid var(--brand-amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-amber)',
          }}>
            <Building2 size={28} style={{ color: 'var(--brand-amber)' }}/>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Nexus<span style={{ color: 'var(--brand-amber)' }}>OP</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Construction Operations Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 20, padding: 32, boxShadow: 'var(--shadow-md)',
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, marginTop: 0 }}>
            Sign in to your account
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 24 }}>
            Enter your credentials to continue
          </p>

          {(localErr || error) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'hsl(0,80%,55%,0.08)', border: '1px solid hsl(0,80%,55%,0.3)',
              borderRadius: 8, marginBottom: 20, fontSize: '0.82rem', color: 'var(--accent-red)',
            }}>
              <AlertCircle size={14}/> {localErr || error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--brand-amber)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-amber-muted)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => { e.target.style.borderColor = 'var(--brand-amber)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-amber-muted)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
                }}>
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 20px', borderRadius: 10, border: 'none',
              background: 'var(--brand-amber)', color: 'white', fontWeight: 700,
              fontSize: '0.9rem', cursor: loading ? 'wait' : 'pointer',
              boxShadow: 'var(--shadow-amber)', marginTop: 4,
              opacity: loading ? 0.8 : 1, transition: 'opacity 150ms ease',
            }}>
              {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}/>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}/>
          </div>

          {/* Continue with Google — coming soon */}
          <button
            type="button" disabled
            title="Google sign-in is coming soon"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 10, cursor: 'not-allowed',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, opacity: 0.85,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 16 3 9.1 7.6 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.3 16 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.9 35.7 45 30.4 45 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
            Continue with Google
            <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em', background: 'var(--brand-amber-muted)', color: 'var(--brand-amber)', padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase' }}>Soon</span>
          </button>

          {/* Try the demo — reveals the test login only on click */}
          <button
            type="button" onClick={revealDemo}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 16px', borderRadius: 10, marginTop: 10, cursor: 'pointer',
              background: 'transparent', border: '1px dashed var(--brand-amber)',
              color: 'var(--brand-amber)', fontSize: '0.82rem', fontWeight: 700,
            }}
          >
            <Sparkles size={14}/> {showDemo ? 'Demo login filled — press Sign In' : 'Try the demo account'}
          </button>

          {/* Sign up */}
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 20, marginBottom: 0 }}>
            New to Nexus-OP?{' '}
            <Link to="/signup" style={{ color: 'var(--brand-amber)', fontWeight: 700, textDecoration: 'none' }}>
              Create an account
            </Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-disabled)', marginTop: 16 }}>
          Nexus-OP v2.0 · Secured with JWT · Roles: Admin, PM, Finance, Site Engineer
        </p>
      </div>
    </div>
  );
}
