import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, Building2, UserPlus } from 'lucide-react';

export default function Signup() {
  const { register, loading, error, token } = useAuth();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    if (!name || !email || !password) { setLocalErr('Fill in all fields'); return; }
    if (password.length < 6)          { setLocalErr('Password must be at least 6 characters'); return; }
    if (password !== confirm)         { setLocalErr('Passwords do not match'); return; }
    try {
      await register(name, email, password);
      // Fresh account → guided setup + tour, then dashboard.
      localStorage.setItem('nexus_tour_pending', '1');
      window.location.assign('/beta-welcome');
    } catch (err) {
      setLocalErr(err.message || 'Sign up failed');
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
  const focusOn  = e => { e.target.style.borderColor = 'var(--brand-amber)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-amber-muted)'; };
  const focusOff = e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; };

  // Already signed in → skip signup.
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, var(--brand-amber-muted) 0%, transparent 70%)', animation: 'float-blob 12s ease-in-out infinite' }}/>
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, hsl(213,94%,68%,0.06) 0%, transparent 70%)', animation: 'float-blob-2 15s ease-in-out infinite' }}/>
      </div>

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: 'var(--brand-amber-muted)', border: '1px solid var(--brand-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-amber)' }}>
            <Building2 size={28} style={{ color: 'var(--brand-amber)' }}/>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Nexus<span style={{ color: 'var(--brand-amber)' }}>OP</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6 }}>Create your own workspace in minutes</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 32, boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, marginTop: 0 }}>Create your account</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 24 }}>Start fresh — you'll set up your first project next.</p>

          {(localErr || error) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(0,80%,55%,0.08)', border: '1px solid hsl(0,80%,55%,0.3)', borderRadius: 8, marginBottom: 20, fontSize: '0.82rem', color: 'var(--accent-red)' }}>
              <AlertCircle size={14}/> {localErr || error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Full Name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusOn} onBlur={focusOff}/>
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Confirm Password</label>
              <input type={showPass ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>

            <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderRadius: 10, border: 'none', background: 'var(--brand-amber)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'wait' : 'pointer', boxShadow: 'var(--shadow-amber)', marginTop: 4, opacity: loading ? 0.8 : 1 }}>
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> : <UserPlus size={16}/>}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 20, marginBottom: 0 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--brand-amber)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
