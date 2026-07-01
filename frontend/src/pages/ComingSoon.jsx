import React from 'react';
import { Sparkles, Check } from 'lucide-react';

/* Placeholder for features that are designed & slotted into the flow but not
   yet built. Keeps the sidebar/flow complete with no broken links. */
export default function ComingSoon({ title, tagline, steps = [], step }) {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto 0', padding: '0 8px' }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 18, padding: '36px 34px', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px',
          borderRadius: 99, background: 'var(--brand-amber-muted)', color: 'var(--brand-amber)',
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          <Sparkles size={13} /> Coming soon
        </div>

        {step && (
          <div style={{ marginTop: 16, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {step}
          </div>
        )}
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <p style={{ fontSize: '0.98rem', lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
          {tagline}
        </p>

        {steps.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
              What this screen will do
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: 6, marginTop: 1,
                    background: 'var(--brand-amber-muted)', color: 'var(--brand-amber)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          This step is part of the customer-order → procurement flow. It's placed here so the whole journey is visible; the working screen is being built next.
        </div>
      </div>
    </div>
  );
}
