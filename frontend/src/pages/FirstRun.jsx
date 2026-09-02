/* ══════════════════════════════════════════════════════════
   FirstRun — two questions, then get out of the way.

   There were already four onboarding screens here. Between them they asked
   for organisation name, trade name, industry, GSTIN, CIN, PAN, address,
   state code and bank details before letting anyone through, and one
   promised "takes ~3 minutes" before the user had seen a single screen of
   the product.

   Almost none of that is needed to look around. GSTIN matters the first time
   you print an invoice; bank details matter the first time you expect to be
   paid. Asking for them up front is a wall in front of a stranger, and the
   setup-readiness banner already explains each one — what is missing, what
   it costs you, and where to fix it — at the moment it starts to matter.

   So: what is the business called, and roughly how big is it. Then in.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Check } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Bands, not a number. "How many employees" has no exact answer in a
   business where half the floor is on contract, and the product only uses
   this to know whether to expect one person doing everything or a team with
   separate roles. */
const SIZES = ['Just me', '2–10', '11–50', '51–200', '200+'];

export default function FirstRun() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { setError('Your organisation needs a name to put on documents.'); return; }
    setSaving(true); setError('');
    try {
      const token = getToken();
      const res = await fetch(`${API}/company-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: name.trim(),
          employee_count: size || null,
          setup_completed_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save that — try again.');
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const input = {
    width: '100%', padding: '13px 15px', fontSize: '0.95rem',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <form onSubmit={save} style={{ width: '100%', maxWidth: 460 }}>

        <div style={{
          width: 46, height: 46, borderRadius: 13, marginBottom: 22,
          background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={23} color="#fff" />
        </div>

        <h1 style={{
          fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-primary)',
          letterSpacing: '-0.025em', margin: '0 0 8px',
        }}>
          Set up your workspace
        </h1>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 30px' }}>
          Two questions, then you're in. GST details, bank account and the rest
          can wait until you actually need them — the dashboard will remind you.
        </p>

        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>
          What is your business called?
        </label>
        <input
          autoFocus
          style={input}
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          placeholder="Steelco Fabrication Pvt Ltd"
        />
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '7px 0 26px' }}>
          This is the name printed on your quotations and invoices.
        </p>

        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 9 }}>
          How many people work there?
          <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> — optional</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 30 }}>
          {SIZES.map(s => {
            const on = size === s;
            return (
              <button
                key={s} type="button"
                onClick={() => setSize(on ? '' : s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
                  fontSize: '0.83rem', fontWeight: 600,
                  background: on ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                  color: on ? 'var(--brand-amber)' : 'var(--text-secondary)',
                }}
              >
                {on && <Check size={13} />}{s}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{
            fontSize: '0.84rem', color: 'var(--accent-red, #ef4444)',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 9, padding: '10px 13px', marginBottom: 18,
          }}>{error}</div>
        )}

        <button
          type="submit" disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: 'var(--brand-amber)', color: '#fff',
            fontSize: '0.93rem', fontWeight: 700,
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1,
          }}
        >
          {saving ? 'Setting up…' : <>Start using Maks Ops <ArrowRight size={16} /></>}
        </button>

        {/* An escape hatch, because someone evaluating the product should not
            have to name their company to see a screen. The banner on the
            dashboard will still ask. */}
        <button
          type="button"
          onClick={() => navigate('/dashboard', { replace: true })}
          style={{
            display: 'block', margin: '16px auto 0', background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: '0.83rem', cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}
