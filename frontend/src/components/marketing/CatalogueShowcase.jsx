import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Store, Search, Share2, MessageSquareQuote, ImageIcon,
  ArrowRight, Tag, Layers,
} from 'lucide-react';
import useInView from '../../hooks/useInView';

/* ══════════════════════════════════════════════════════════════════════
   CatalogueShowcase — the shopfront, sold as a feature.

   The catalogue was not on the features list at all. It is the only part of
   the product a stranger can use without an account, which makes it the
   shortest path from "who are these people" to a priced quotation — and it
   was the one capability the sales page did not mention.

   What this section argues, in order:
     1. You publish products once, with photographs and specifications.
     2. You share one link. No login for the person browsing.
     3. They enquire against a SPECIFIC product, not "do you make brackets".
     4. That enquiry lands in Marketing → Enquiries, already attached to the
        product, ready to quote.

   The mock is deliberately a mock. It is drawn from CSS, not a screenshot:
   a screenshot goes stale the moment the UI changes, carries whatever data
   happened to be on screen that day, and cannot animate to show the search
   filtering. Nothing here claims to be a photograph of the product.
   ══════════════════════════════════════════════════════════════════════ */

/* Products for the mock. Real fabrication items, because placeholder names
   ("Product A") make a shopfront look empty rather than illustrative. */
const ITEMS = [
  { name: 'V-Type Cross Arm', spec: '75 × 40 × 6 mm · galvanised', cat: 'power', tone: 'var(--brand-amber)' },
  { name: 'Solar Module Clamp', spec: 'Mid clamp · 30–40 mm', cat: 'solar', tone: 'var(--accent-blue)' },
  { name: 'Mounting Rail', spec: '4.2 m · AL 6063 T6', cat: 'solar', tone: 'var(--accent-blue)' },
  { name: 'Terminal Support Bracket', spec: 'MS · hot-dip galvanised', cat: 'power', tone: 'var(--brand-amber)' },
  { name: 'Sheet Metal Enclosure', spec: 'IP 55 · 1.6 mm CRCA', cat: 'press', tone: 'var(--accent-emerald)' },
  { name: 'Reinforcement Plate', spec: '8 mm · laser cut', cat: 'press', tone: 'var(--accent-emerald)' },
];

const FILTERS = [
  { key: 'all', label: 'All products' },
  { key: 'power', label: 'Power infrastructure' },
  { key: 'solar', label: 'Solar structures' },
  { key: 'press', label: 'Precision press' },
];

const STEPS = [
  {
    icon: <ImageIcon size={16} />, title: 'Publish once',
    desc: 'Add a product with photographs, specifications, HSN and a category. It becomes a page with its own address.',
  },
  {
    icon: <Share2 size={16} />, title: 'Share one link',
    desc: 'Send the catalogue to a customer, put it on WhatsApp, print it on a card. Nobody browsing it needs an account.',
  },
  {
    icon: <MessageSquareQuote size={16} />, title: 'Enquiries arrive attached',
    desc: 'An enquiry comes in against a specific product, so whoever quotes it already knows what was asked for.',
  },
  {
    icon: <ArrowRight size={16} />, title: 'Quote it',
    desc: 'The enquiry becomes a quotation with the product line already on it — the engine above takes over from here.',
  },
];

/* A drawn product tile. The "photograph" is a tinted panel with a layers
   glyph — clearly a placeholder, deliberately, so nobody mistakes the mock
   for a real product shot. */
const Tile = ({ item, dim }) => (
  <div style={{
    borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    opacity: dim ? 0.24 : 1,
    transform: dim ? 'scale(0.985)' : 'none',
    transition: 'opacity .32s ease, transform .32s ease',
  }}>
    <div style={{
      height: 54, display: 'grid', placeItems: 'center',
      background: `linear-gradient(135deg, ${item.tone}22, transparent 70%)`,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <Layers size={18} style={{ color: item.tone, opacity: 0.8 }} />
    </div>
    <div style={{ padding: '8px 9px' }}>
      <div style={{
        fontSize: 'var(--t-xs)', fontWeight: 800, color: 'var(--text-primary)',
        lineHeight: 1.3, marginBottom: 3,
      }}>{item.name}</div>
      <div style={{ fontSize: 'var(--t-3xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {item.spec}
      </div>
    </div>
  </div>
);

const CatalogueShowcase = () => {
  const [filter, setFilter] = useState('all');
  const [ref, inView] = useInView(0.1, { once: true });
  /* the glow behind the shopfront drifts only while it can be seen — it was
     the one loop on the page still running with the reader at the footer */
  const [driftRef, , driftVisible] = useInView(0);

  /* Tiles are DIMMED rather than removed. Removing them reflows the grid and
     the reader loses their place; dimming shows the catalogue is being
     filtered, which is the thing being demonstrated. */
  const isDim = (it) => filter !== 'all' && it.cat !== filter;
  const shown = ITEMS.filter((it) => !isDim(it)).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div aria-hidden="true" className="mk-drift" ref={driftRef} style={{
        animationPlayState: driftVisible ? 'running' : 'paused',
        position: 'absolute', top: -50, right: '6%', width: 280, height: 280,
        background: 'radial-gradient(circle, var(--brand-amber-muted), transparent 70%)',
        filter: 'blur(30px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* No gridTemplateColumns here: an inline style beats the stylesheet, so
          declaring it inline meant .mk-cat-layout's two-column rule could
          never win and the section was stacked at every width. The columns
          and their breakpoints live in motion.css. */}
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 28 }}
        className="mk-cat-layout">

        {/* ── the mock shopfront ── */}
        <div className={inView ? 'mk-scale-in' : undefined}
          style={{
            opacity: inView ? undefined : 0,
            background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)', padding: 16, minWidth: 0,
          }}>
          {/* browser chrome, so it reads as a public page rather than a screen
              inside the app — which is the whole distinction being sold */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {['var(--accent-red)', 'var(--accent-yellow)', 'var(--accent-emerald)'].map((c) => (
                <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
            </div>
            <div style={{
              flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 9px', borderRadius: 'var(--r-full)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              fontSize: 'var(--t-2xs)', color: 'var(--text-muted)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
              <Store size={10} style={{ color: 'var(--brand-amber)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                maksops.co.in/c/your-company
              </span>
            </div>
            <span style={{
              fontSize: 'var(--t-3xs)', fontWeight: 800, letterSpacing: '0.05em',
              color: 'var(--accent-emerald)', border: '1px solid var(--accent-emerald)',
              borderRadius: 'var(--r-full)', padding: '2px 7px', flexShrink: 0,
            }}>NO LOGIN</span>
          </div>

          {/* category filters — real, clickable, and they drive the grid */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                    fontSize: 'var(--t-3xs)', fontWeight: 700, fontFamily: 'inherit',
                    border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                    background: on ? 'var(--brand-amber-muted)' : 'transparent',
                    color: on ? 'var(--brand-amber)' : 'var(--text-secondary)',
                    transition: 'all .2s',
                  }}>
                  {f.key !== 'all' && <Tag size={8} />}
                  {f.label}
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9,
          }} className="mk-cat-grid">
            {ITEMS.map((it) => <Tile key={it.name} item={it} dim={isDim(it)} />)}
          </div>

          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 'var(--t-2xs)', color: 'var(--text-muted)',
          }}>
            <Search size={10} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {shown} of {ITEMS.length} products
              {filter !== 'all' && ` in ${FILTERS.find((f) => f.key === filter).label.toLowerCase()}`}
            </span>
            <em style={{ marginLeft: 'auto', opacity: 0.7, fontStyle: 'normal' }}>illustration</em>
          </div>
        </div>

        {/* ── what it does for you ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 2 }}>
            {STEPS.map((s, i) => {
              const last = i === STEPS.length - 1;
              return (
                <div key={s.title}
                  className={inView ? 'mk-rise' : undefined}
                  style={{
                    animationDelay: `${i * 90}ms`,
                    opacity: inView ? undefined : 0,
                    display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12,
                  }}>
                  {/* the rail: a node and the line down to the next step */}
                  <div style={{ display: 'grid', justifyItems: 'center', gridTemplateRows: 'auto 1fr' }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
                      border: '1px solid var(--brand-amber)', background: 'var(--brand-amber-muted)',
                      color: 'var(--brand-amber)',
                    }}>{s.icon}</span>
                    {!last && <span style={{ width: 1, background: 'var(--border-default)', minHeight: 18 }} />}
                  </div>
                  <div style={{ paddingBottom: last ? 0 : 18 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', fontWeight: 800,
                      color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em',
                    }}>{s.title}</div>
                    <p style={{
                      margin: 0, color: 'var(--text-secondary)',
                      fontSize: 'var(--t-base)', lineHeight: 1.7,
                    }}>{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            marginTop: 18, padding: '14px 16px', borderRadius: 'var(--r-md)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--t-base)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong>{' '}
              it is the only part of Maks Ops someone can use without an account — so it is
              the shortest distance between a stranger finding you and a numbered quotation
              leaving your office.
            </p>
          </div>

          {/* maxWidth and normal wrapping: btn-ghost does not wrap by default,
              so this label was 19px wider than a 360px screen and was the last
              thing making the page scroll sideways. */}
          <Link to="/platform" className="btn-ghost" style={{
            marginTop: 16, display: 'inline-flex', maxWidth: '100%',
            whiteSpace: 'normal', textAlign: 'left',
          }}>
            See it in the platform tour <ArrowRight size={15} style={{ flexShrink: 0 }} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CatalogueShowcase;
