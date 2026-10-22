import React from 'react';
import {
  ShoppingBag, Files, ShoppingCart, Truck, ReceiptText, Factory,
  FolderGit2, Receipt, Users, Brain, BookOpen, Store, FileSpreadsheet,
} from 'lucide-react';
import useInView from '../../hooks/useInView';

/* ══════════════════════════════════════════════════════════════════════
   FeatureDiagrams — a small animated picture for each feature.

   The grid this replaces was eleven identical cards: an icon, a title, and
   a paragraph. Every card looked the same, so the page asked the reader to
   absorb eleven paragraphs to find the one thing they care about — and the
   genuinely unusual capabilities (reading a vendor's PDF, yield including
   scrap, place of supply picked from the ship-to) read exactly like the
   ordinary ones.

   Each diagram shows the MECHANISM rather than decorating the card. They
   are deliberately small, built from a handful of reusable primitives
   rather than twelve bespoke drawings, because twelve drawings is twelve
   things to keep consistent.

   Animation starts only when the card is in view and runs on CSS keyframes
   shared from motion.css. Under prefers-reduced-motion each diagram settles
   in its finished, readable state — see the bottom of that file.
   ══════════════════════════════════════════════════════════════════════ */

const CYCLE = '6s';

/* Longhand, never the `animation` shorthand.

   The shorthand resets animation-delay to its initial 0s, and React patches
   only the style properties that CHANGED between renders. Each diagram starts
   with on=false (`animation: none`) plus a staggered delay; when it scrolls
   into view and on flips, React rewrites the shorthand alone and every delay
   is silently wiped — so the rows of a diagram animate in unison instead of
   cascading. It looks like a design choice rather than a bug, which is why it
   survived a screenshot review and only showed up when opacity was sampled
   across a whole cycle. */
export const anim = (name, on, delay = 0, easing = 'ease-in-out') => (on ? {
  animationName: name,
  animationDuration: CYCLE,
  animationTimingFunction: easing,
  animationIterationCount: 'infinite',
  animationDelay: typeof delay === 'number' ? `${delay}s` : delay,
} : { animationName: 'none' });

/* Shared chrome for a diagram: a fixed-height stage so cards in a row line
   up regardless of how tall their drawing is. */
export const Stage = ({ children, label }) => (
  <div style={{
    height: 92, borderRadius: 'var(--r-sm)', marginBottom: 14, padding: 10,
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    position: 'relative', overflow: 'hidden',
    display: 'grid', placeItems: 'center',
  }}>
    {children}
    {label && (
      <span style={{
        position: 'absolute', top: 6, right: 8, fontSize: 'var(--t-3xs)',
        fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-disabled)',
      }}>{label}</span>
    )}
  </div>
);

/* ── 1. lines read out of a file ──────────────────────────────────────
   For vendor quotation upload: the point is that the rows come OUT of the
   file, so a file icon sits on the left and rows arrive on the right. */
export const ParseLines = ({ on }) => (
  <Stage label="parsed">
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '0 4px' }}>
      <FileSpreadsheet size={26} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: 5, flex: 1, minWidth: 0 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mk-row" style={{
            ...anim('mk-row-in', on, `${i * 0.28}s`, 'ease-in-out'),
             opacity: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              height: 6, flex: 1, borderRadius: 'var(--r-xs)',
              background: 'var(--border-emphasis)',
            }} />
            <div style={{
              height: 6, width: 26, borderRadius: 'var(--r-xs)',
              background: 'var(--brand-amber)',
            }} />
          </div>
        ))}
      </div>
    </div>
  </Stage>
);

/* ── 2. comparing vendor prices ───────────────────────────────────────
   Three bars, the cheapest marked. The mark arrives AFTER the bars settle,
   because the claim is that the system picks the winner, not that it draws
   bars. */
export const CompareBars = ({ on }) => {
  const bars = [
    { w: '86%', c: 'var(--border-emphasis)', best: false },
    { w: '58%', c: 'var(--accent-emerald)', best: true },
    { w: '72%', c: 'var(--border-emphasis)', best: false },
  ];
  return (
    <Stage label="compare">
      <div style={{ display: 'grid', gap: 9, width: '100%', padding: '0 6px' }}>
        {bars.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              fontSize: 'var(--t-3xs)', fontWeight: 800, width: 16,
              color: 'var(--text-disabled)',
            }}>Q{i + 1}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 'var(--r-xs)', background: 'var(--bg-overlay)' }}>
              <div className="mk-bar" style={{
                ...anim('mk-bar-grow', on, `${i * 0.16}s`, 'ease-in-out'),
                
                width: b.w, height: '100%', borderRadius: 'var(--r-xs)',
                background: b.c, transformOrigin: 'left center', transform: 'scaleX(0)',
              }} />
            </div>
            <span className="mk-best" style={{
              animation: on && b.best ? `mk-best-mark ${CYCLE} ease-in-out infinite` : 'none',
              opacity: 0, fontSize: 'var(--t-3xs)', fontWeight: 800, width: 30,
              color: 'var(--accent-emerald)',
            }}>
              {b.best ? 'BEST' : ''}
            </span>
          </div>
        ))}
      </div>
    </Stage>
  );
};

/* ── 3. yield, including the scrap ────────────────────────────────────
   A ring that fills to 94.2% with the scrap slice shown in red. The scrap
   is the whole reason this diagram exists: it is the number most systems
   drop, and it is where the margin goes. */
export const YieldRing = ({ on }) => {
  const R = 26, C = 2 * Math.PI * R;
  const good = 0.942;
  return (
    <Stage label="yield">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true">
          <circle cx="35" cy="35" r={R} fill="none" stroke="var(--bg-overlay)" strokeWidth="7" />
          {/* scrap sits underneath, so the good arc draws over it */}
          <circle cx="35" cy="35" r={R} fill="none" stroke="var(--accent-red)" strokeWidth="7"
            strokeDasharray={C} strokeDashoffset="0" transform="rotate(-90 35 35)" opacity="0.8" />
          {/* pathLength="1" makes the dash numbers fractions of the circle
              rather than pixels, so the arc is exactly `good` of it at any
              radius. The offset therefore has to travel from `good` to 0 —
              not from 1, which with a 0.942+1 dash pattern would leave part
              of the arc visible at the start. Hence its own keyframe. */}
          <circle className="mk-draw-path" cx="35" cy="35" r={R} fill="none"
            stroke="var(--accent-emerald)" strokeWidth="7" strokeLinecap="round"
            pathLength="1" strokeDasharray={`${good} 1`}
            transform="rotate(-90 35 35)"
            style={{
              strokeDashoffset: good,
              ...anim('mk-arc-draw', on, 0, 'ease-in-out'),
            }} />
        </svg>
        <div style={{ display: 'grid', gap: 3 }}>
          <span style={{
            fontSize: 'var(--t-md)', fontWeight: 800, color: 'var(--accent-emerald)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>94.2%</span>
          <span style={{ fontSize: 'var(--t-3xs)', fontWeight: 700, color: 'var(--text-disabled)' }}>FINISHED</span>
          <span style={{
            fontSize: 'var(--t-2xs)', fontWeight: 700, color: 'var(--accent-red)',
            fontVariantNumeric: 'tabular-nums', marginTop: 2,
          }}>5.8% scrap</span>
        </div>
      </div>
    </Stage>
  );
};

/* ── 4. place of supply decides the tax ───────────────────────────────
   The single most misunderstood thing in Indian GST, and a genuine
   differentiator: the split is chosen from the ship-to state, not typed. */
export const TaxSplit = ({ on }) => (
  <Stage label="GST">
    {/* line-height 1.2: at the body's 1.5 the two rows were taller than the
        stage, and the IGST row was cut off at the bottom */}
    <div style={{ display: 'grid', gap: 7, width: '100%', padding: '0 6px', lineHeight: 1.2 }}>
      {[
        { k: 'Within state', a: 'CGST 9%', b: 'SGST 9%', c: 'var(--accent-blue)' },
        { k: 'Interstate', a: 'IGST 18%', b: null, c: 'var(--brand-amber)' },
      ].map((r, i) => (
        <div key={r.k} className="mk-row" style={{
          ...anim('mk-row-in', on, `${i * 0.5}s`, 'ease-in-out'),
           opacity: 0,
        }}>
          <div style={{
            fontSize: 'var(--t-3xs)', fontWeight: 800, color: 'var(--text-disabled)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
          }}>{r.k}</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[r.a, r.b].filter(Boolean).map((t) => (
              <span key={t} style={{
                flex: 1, textAlign: 'center', padding: '3px 0', borderRadius: 'var(--r-sm)',
                fontSize: 'var(--t-3xs)', fontWeight: 800, color: r.c,
                border: `1px solid ${r.c}`, background: 'var(--bg-surface)',
                fontVariantNumeric: 'tabular-nums',
              }}>{t}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Stage>
);

/* ── 5. one document becoming the next ────────────────────────────────
   Quotation → order, GRN → bill. The arrow is the product. */
export const DocMorph = ({ on, from = 'QT', to = 'SO', tone = 'var(--brand-amber)' }) => (
  <Stage label="one click">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {[from, null, to].map((t, i) =>
        t === null ? (
          /* The dot rides a full-width RAIL that translates 100% — i.e. the
             line's own width. It used to animate the 8px dot directly with the
             engine's seven-stop keyframes, so translateX(100%) meant eight
             pixels: across a 38px line it shuffled a fifth of the way in seven
             jerks. clip on X keeps the rail inside the line; visible on Y lets
             the dot sit above and below a 2px stroke. */
          <div key="arrow" style={{
            position: 'relative', width: 38, height: 2, background: 'var(--border-emphasis)',
            overflowX: 'clip', overflowY: 'visible',
          }}>
            <div className="mk-pulse" style={{
              ...anim('mk-rail-travel', on, 0, 'cubic-bezier(.65,0,.35,1)'),
              position: 'absolute', left: 0, top: 0, width: '100%', height: 0, opacity: 0,
            }}>
              <span style={{
                position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%',
                background: tone, boxShadow: `0 0 8px 2px ${tone}`,
              }} />
            </div>
          </div>
        ) : (
          <div key={t} style={{
            width: 42, height: 52, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
            border: `1px solid ${i === 2 ? tone : 'var(--border-emphasis)'}`,
            background: 'var(--bg-surface)',
            color: i === 2 ? tone : 'var(--text-muted)',
            fontSize: 'var(--t-2xs)', fontWeight: 800,
          }}>{t}</div>
        ),
      )}
    </div>
  </Stage>
);

/* ── 6. stock responding to a receipt ─────────────────────────────────── */
export const StockLevel = ({ on }) => (
  <Stage label="live stock">
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 56 }}>
      {[30, 38, 34, 46, 42, 58, 54, 70].map((h, i) => (
        <div key={i} className="mk-bar-v" style={{
          width: 10, height: h, borderRadius: '3px 3px 0 0',
          transformOrigin: 'bottom center',
          background: i === 7 ? 'var(--accent-emerald)' : 'var(--border-emphasis)',
          /* mk-bar-rise, not mk-bar-grow: these bars grow UPWARDS, and
             mk-bar-grow scales on X. */
          ...anim('mk-bar-rise', on, `${i * 0.08}s`, 'ease-in-out'),
          
          transform: 'scaleY(0)',
        }} />
      ))}
    </div>
  </Stage>
);

/* Two keyframes used by exactly one diagram each, kept here beside their
   only caller rather than in the shared stylesheet.

   Both are switched off under prefers-reduced-motion by the rules on
   .mk-bar / .mk-draw-path in motion.css, which pin them to their finished
   state — so the ring still reads 94.2% and the bars still stand up. */
export const localKeyframes = `
@keyframes mk-bar-rise {
  0%, 6%   { transform: scaleY(0); }
  26%, 88% { transform: scaleY(1); }
  100%     { transform: scaleY(0); }
}
@keyframes mk-arc-draw {
  0%, 8%   { stroke-dashoffset: 0.942; }
  40%, 88% { stroke-dashoffset: 0; }
  100%     { stroke-dashoffset: 0.942; }
}`;

/* ── the catalogue, searched ──────────────────────────────────────────── */
export const SearchGrid = ({ on }) => (
  <Stage label="catalogue">
    <div style={{ width: '100%', padding: '0 6px', display: 'grid', gap: 7 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px',
        borderRadius: 'var(--r-sm)', border: '1px solid var(--border-emphasis)',
        background: 'var(--bg-surface)', fontSize: 'var(--t-3xs)', color: 'var(--text-secondary)',
      }}>
        <Store size={10} style={{ color: 'var(--brand-amber)' }} />
        <span>cross arm</span>
        <span className="mk-caret" style={{
          ...(on ? { animationName: 'mk-caret', animationDuration: '1.1s', animationTimingFunction: 'step-end', animationIterationCount: 'infinite' } : { animationName: 'none' }),
          width: 1, height: 9, background: 'var(--brand-amber)',
        }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mk-row" style={{
            ...anim('mk-row-in', on, `${i * 0.12}s`, 'ease-in-out'),
             opacity: 0,
            height: 26, borderRadius: 'var(--r-sm)',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-subtle)',
          }} />
        ))}
      </div>
    </div>
  </Stage>
);

/* ══════════════════════════════════════════════════════════════════════
   The features themselves.

   Copy rule followed throughout: say what the system DOES and what comes
   out of it, in the words a fabricator uses. "Eight modules" is not a
   benefit; "upload what the vendor emailed and the lines come out of it"
   is. Where something is genuinely unusual, the card says so plainly
   rather than leaving it to be inferred.
   ══════════════════════════════════════════════════════════════════════ */
const FEATURES = [
  {
    icon: <Files size={18} />, title: 'Vendor quotations, read from the file',
    diagram: ParseLines,
    desc: 'Upload the Excel, PDF or Word file a vendor sent. Description, HSN, quantity and rate are read out of it, not retyped.',
    note: 'The original file stays attached, so any number can be checked against it.',
  },
  {
    icon: <ShoppingCart size={18} />, title: 'Comparison that is like-for-like',
    diagram: CompareBars,
    desc: 'Quotations side by side: the best price on every row, who skipped a row, and totals that compare like with like.',
    note: null,
  },
  {
    icon: <Factory size={18} />, title: 'Production yield, scrap included',
    diagram: YieldRing,
    desc: 'Consume against the bill of materials, record output and scrap, and see live yield and the true cost per piece.',
    note: 'Scrap is where the margin goes.',
  },
  {
    icon: <ReceiptText size={18} />, title: 'GST that follows place of supply',
    diagram: TaxSplit,
    desc: 'CGST and SGST within the state, IGST across it, picked from the ship-to address. Invoice numbers run in sequence, as GST requires.',
    note: null,
  },
  {
    icon: <ShoppingBag size={18} />, title: 'Quotation to order, in one click',
    diagram: (p) => <DocMorph {...p} from="QT" to="CO" />,
    desc: 'Accept a quotation and the customer order is made with its lines intact. The quotation then locks, so what was agreed stays agreed.',
    note: null,
  },
  {
    icon: <Truck size={18} />, title: 'Goods receipt moves the stock',
    diagram: StockLevel,
    desc: 'Receive against the purchase order, with vehicle and batch. Stock moves on the receipt itself, not when someone remembers.',
    note: 'Stock on the screen is stock on the floor.',
  },
  {
    icon: <Store size={18} />, title: 'A catalogue your customers can browse',
    diagram: SearchGrid,
    desc: 'Publish products with photos and specifications, and share one link. Enquiries arrive tied to the exact product.',
    note: null,
  },
  {
    icon: <Receipt size={18} />, title: 'Documents that survive printing',
    diagram: (p) => <DocMorph {...p} from="GRN" to="INV" tone="var(--accent-blue)" />,
    desc: 'Clean A4 on your own letterhead. Table headers repeat on every page; totals and signatures never split across a page break.',
    note: null,
  },
  {
    icon: <FolderGit2 size={18} />, title: 'Projects and BOQ',
    diagram: (p) => <DocMorph {...p} from="BOQ" to="RA" />,
    desc: 'Optional, for contract work: a bill of quantities, site measurements, and running-account bills worked out with GST, TDS and retention.',
    note: null,
  },
  {
    icon: <Users size={18} />, title: 'Customers, vendors and roles',
    diagram: (p) => <DocMorph {...p} from="GSTIN" to="OK" tone="var(--accent-emerald)" />,
    desc: 'Everyone you buy from and sell to, with GSTIN, contacts and bank details, entered once and used everywhere. Each person sees only what their role allows.',
    note: null,
  },
  {
    icon: <Brain size={18} />, title: 'Ask AI, about your own data',
    diagram: (p) => <DocMorph {...p} from="?" to="₹" tone="var(--accent-blue)" />,
    desc: 'Ask on any screen what is overdue, what is waiting for approval, or how to do something. It answers from your own records.',
    note: 'Read-only: it shows you where to act, and never acts for you.',
  },
  {
    icon: <BookOpen size={18} />, title: 'Smart Knowledge',
    diagram: (p) => <DocMorph {...p} from="DOC" to="AI" />,
    desc: 'Searchable guides for the whole platform, with a one-click follow-up question from any article.',
    note: null,
  },
];

const FeatureCard = ({ f, i }) => {
  /* seen drives the one-time entrance; visible gates the looping diagram,
     so twelve of them are not animating while the reader is at the footer. */
  const [ref, seen, visible] = useInView(0.18);
  const Diagram = f.diagram;
  return (
    <div
      ref={ref}
      className={seen ? 'mk-rise' : undefined}
      style={{
        animationDelay: `${Math.min(i, 5) * 70}ms`,
        opacity: seen ? undefined : 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)', padding: 18,
        display: 'flex', flexDirection: 'column',
        transition: 'border-color .25s, transform .25s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--brand-amber)';
        e.currentTarget.style.transform = 'translateY(-3px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <Diagram on={visible} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: 'var(--brand-amber)', display: 'grid', placeItems: 'center' }}>{f.icon}</span>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', fontWeight: 800,
          margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3,
        }}>{f.title}</h3>
      </div>
      <p style={{
        margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--t-base)', lineHeight: 1.7,
      }}>{f.desc}</p>
      {f.note && (
        <p style={{
          margin: '10px 0 0', paddingTop: 10, borderTop: '1px dashed var(--border-subtle)',
          color: 'var(--text-muted)', fontSize: 'var(--t-sm)', lineHeight: 1.6,
        }}>{f.note}</p>
      )}
    </div>
  );
};

export const FeatureGrid = () => (
  <>
    <style>{localKeyframes}</style>
    <div className="mk-feature-grid">
      {FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} i={i} />)}
    </div>
  </>
);

export default FeatureGrid;
