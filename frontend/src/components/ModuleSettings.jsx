/* ══════════════════════════════════════════════════════════
   Which parts of the product this business uses.

   Four screens are civil-contracting: Bill of Quantities, the Measurement
   Book, Indents (which carry a `chainage` field — distance along a road)
   and RA bills, which bill a running account against measured work. Good
   features for a contractor, meaningless to a furniture maker, and every
   organisation saw all of them.

   A switch rather than a deletion, because the alternative throws away
   working software some customer wants.

   Deliberately a PREFERENCE, and it says so on screen: turning something
   off hides its screens and menu entries and touches no data. That
   distinction matters — a person who thinks this deletes their measurement
   book will never touch it, and a person who thinks it secures something
   will rely on it wrongly.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { HardHat, Check, Info } from 'lucide-react';

/* Adding one is a row here plus `module: 'key'` on its nav entries. */
const OPTIONAL = [
  {
    key: 'contracting',
    icon: HardHat,
    label: 'Contracting',
    blurb: 'Bill of quantities, measurement book, indents and RA bills — for businesses that bill against measured site work.',
    screens: ['Bill of quantities', 'Measurement book', 'Indents', 'RA bills'],
  },
];

export default function ModuleSettings({ api, toast, modules, onSaved }) {
  const [state, setState] = useState({});
  const [busy, setBusy] = useState(null);

  useEffect(() => { setState(modules || {}); }, [modules]);

  /* Absent means on. An organisation created before this existed has no
     settings at all and must keep seeing everything it saw yesterday. */
  const isOn = (key) => state[key] !== false;

  const toggle = async (key) => {
    const next = { ...state, [key]: !isOn(key) };
    setBusy(key);
    try {
      await api('/company-profile', { method: 'PUT', body: JSON.stringify({ modules: next }) });
      setState(next);
      toast.success(next[key] ? 'Switched on' : 'Switched off — nothing was deleted');
      /* The menu is drawn from /auth/me, so it has to be re-read before the
         change is visible anywhere but here. */
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const card = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 14, padding: 18,
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        display: 'flex', gap: 9, alignItems: 'flex-start',
        padding: '10px 12px', borderRadius: 9,
        background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.82rem',
      }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-amber)' }} />
        <span>
          Switching something off hides its screens and menu entries for everyone here.
          It does not delete anything — switch it back on and your records are exactly
          where you left them.
        </span>
      </div>

      {OPTIONAL.map(m => {
        const on = isOn(m.key);
        const Icon = m.icon;
        return (
          <div key={m.key} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: on ? 'hsl(28,100%,54%,0.14)' : 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
            }}>
              <Icon size={18} style={{ color: on ? 'var(--brand-amber)' : 'var(--text-muted)' }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {m.label}
              </div>
              <p style={{ margin: '3px 0 8px', fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {m.blurb}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {m.screens.map(s => (
                  <span key={s} style={{
                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999,
                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  }}>{s}</span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggle(m.key)}
              disabled={busy === m.key}
              aria-pressed={on}
              style={{
                flexShrink: 0, minWidth: 96,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 700,
                background: on ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
                border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                color: on ? 'var(--brand-amber)' : 'var(--text-muted)',
              }}
            >
              {busy === m.key ? '…' : on ? <><Check size={13} /> On</> : 'Off'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
