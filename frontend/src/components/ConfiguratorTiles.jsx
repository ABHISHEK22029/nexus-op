/* ══════════════════════════════════════════════════════════
   ConfiguratorTiles — what an administrator can configure.

   This was a three-tab strip. Tabs work while there are three of them and
   stop working the moment there are eight, because a tab label has room for
   two words and no room to say what the thing is FOR. A tile has both, and
   can carry a live number — "9 people", "7 roles" — so the administrator
   knows the shape of what is behind it before opening it.

   Tiles that are not built yet are shown greyed rather than hidden. Hiding
   them makes the product look finished and the roadmap invisible; showing
   them says "this is coming, and this is where it will be".
   ══════════════════════════════════════════════════════════ */
import React, { useEffect } from 'react';
import { ChevronRight, Lock } from 'lucide-react';

export default function TileHome({ tiles, counts, setCounts, onOpen, load }) {
  useEffect(() => {
    let alive = true;
    load().then(c => { if (alive) setCounts(c); }).catch(() => {});
    return () => { alive = false; };
  }, [load, setCounts]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))',
      gap: 14,
    }}>
      {tiles.map(t => {
        const ready = t.ready !== false;
        return (
          <button
            key={t.key}
            onClick={() => ready && onOpen(t.key)}
            disabled={!ready}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 8, padding: '18px 18px 16px', textAlign: 'left',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 14,
              cursor: ready ? 'pointer' : 'default',
              opacity: ready ? 1 : 0.55,
              transition: 'border-color 150ms, transform 150ms',
            }}
            onMouseEnter={e => { if (ready) { e.currentTarget.style.borderColor = 'var(--brand-amber)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ready ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
              }}>
                <t.icon size={17} style={{ color: ready ? 'var(--brand-amber)' : 'var(--text-muted)' }} />
              </div>
              <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t.label}
              </span>
              {ready
                ? <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                : <Lock size={14} style={{ color: 'var(--text-muted)' }} />}
            </div>

            <p style={{ margin: 0, fontSize: '0.81rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
              {t.blurb}
            </p>

            <span style={{
              marginTop: 2, fontSize: '0.72rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.05em',
              color: ready ? 'var(--brand-amber)' : 'var(--text-muted)',
            }}>
              {ready ? (t.stat ? t.stat(counts) : 'open') : 'not built yet'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
