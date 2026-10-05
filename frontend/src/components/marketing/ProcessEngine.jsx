import React, { useState } from 'react';
import {
  MessageSquareQuote, FileText, ClipboardCheck, ShoppingCart,
  Truck, Factory, ReceiptText, ChevronRight,
} from 'lucide-react';
import useInView from '../../hooks/useInView';

/* ══════════════════════════════════════════════════════════════════════
   ProcessEngine — what the product actually does, as one machine.

   The page previously showed a seven-step flow for CONTRACTORS (BOQ →
   Indent → Measurement Book → RA Bill) while every feature paragraph below
   it described FABRICATION (customer order → vendor quotes → production →
   GST invoice). A prospect reading both was being shown two different
   products. This is the fabrication track, which is the positioning, and
   the contractor track is offered as a second selectable lane rather than
   being the only one on display.

   Why it is built the way it is:

   · Each stage names the DOCUMENT it emits and the NUMBER it moves. "Eight
     modules" means nothing to a fabricator; "a GST invoice comes out, and
     your stock goes down" is the thing they are buying.
   · The sequence runs on CSS keyframes sharing one duration, offset per
     stage (see motion.css). No timers, so nothing drifts, nothing leaks,
     and it keeps running while React is busy.
   · Hovering or focusing a stage pins it and shows the detail. The loop is
     for a passer-by; the detail is for someone who has decided to read.
   · Under prefers-reduced-motion every stage shows lit and the detail panel
     still works — the diagram explains the product, so it has to survive
     the animation being switched off.
   ══════════════════════════════════════════════════════════════════════ */

/* Height of the artefact chip row. Fixed, because the pipe behind the
   chambers is positioned from it — a chip that grows with its text would
   drag the pipe off the chamber centre line. */
const ARTIFACT_H = 22;

/* The chambers' grid gap. Named because the pipe's end-points are computed
   from it — if the two drift apart the track stops landing on the chambers. */
const GRID_GAP = 6;

const TRACKS = {
  fabrication: {
    label: 'Fabrication & manufacturing',
    blurb: 'A customer asks for a part. This is everything between that question and the money arriving.',
    stages: [
      {
        key: 'enquiry', icon: <MessageSquareQuote size={20} />, title: 'Enquiry',
        emits: 'Enquiry logged',
        short: 'The question arrives and stops being a WhatsApp message.',
        detail: 'Capture what the customer asked for before there is a customer record. Drawings and specs attach to the enquiry, so the person who quotes it is not working from memory.',
        moves: 'Nothing financial yet — but nothing is lost either.',
      },
      {
        key: 'quotation', icon: <FileText size={20} />, title: 'Quotation',
        emits: 'QT-0041',
        short: 'Priced on your letterhead, with your GST treatment.',
        detail: 'Build the quotation from the enquiry, with HSN codes, your own GST rate and place-of-supply handling. Edit the number, date or validity in place. Print or share as a PDF that holds its alignment.',
        moves: 'A numbered document your customer can sign.',
      },
      {
        key: 'order', icon: <ClipboardCheck size={20} />, title: 'Order',
        emits: 'SO-0019',
        short: 'They accept. One click, no retyping.',
        detail: 'Converting a quotation creates the customer order with its lines intact. The quotation locks, because a document someone accepted should not keep changing underneath them.',
        moves: 'Committed demand you can now buy against.',
      },
      {
        key: 'purchase', icon: <ShoppingCart size={20} />, title: 'Purchase',
        emits: 'PO-0112',
        short: 'Vendor quotes compared like-for-like, then a PO.',
        detail: 'Upload what vendors sent — Excel, PDF or Word — and the lines are read out of the file instead of retyped. Compare on a like-for-like total, see who missed which line, then raise the PO on the winner.',
        moves: 'A purchase commitment, and a price you can defend.',
      },
      {
        key: 'receive', icon: <Truck size={20} />, title: 'Goods receipt',
        emits: 'GRN-0087',
        short: 'Material lands. Stock rises by itself.',
        detail: 'Record the receipt against the PO with vehicle and batch. Inventory moves on the receipt, not on somebody remembering to adjust it later, so stock on screen is stock on the floor.',
        moves: 'Inventory up. Payable created.',
      },
      {
        key: 'production', icon: <Factory size={20} />, title: 'Production',
        emits: 'Yield 94.2%',
        short: 'Raw material in, finished parts and scrap out.',
        detail: 'Consume against the bill of materials, record finished output and scrap, and get live yield, material balance and cost per piece. The scrap line is the one most systems quietly drop — it is where the margin goes.',
        moves: 'Raw stock down, finished stock up, true cost known.',
      },
      {
        key: 'invoice', icon: <ReceiptText size={20} />, title: 'Tax invoice',
        emits: 'INV-0203',
        short: 'A compliant invoice, and the ledger closes.',
        detail: 'CGST and SGST within the state, IGST across it, chosen from the ship-to address rather than typed. Sequential numbering per Rule 46(b). Once issued, corrections go through a credit or debit note — which is the lawful way, not a bug.',
        moves: 'Receivable created. Returns tie back to the document.',
      },
    ],
  },
  contracting: {
    label: 'Projects & contracting',
    blurb: 'Running work against a BOQ, where the bill is computed from what was measured on site.',
    stages: [
      {
        key: 'project', icon: <ClipboardCheck size={20} />, title: 'Project',
        emits: 'Project opened',
        short: 'Client, scope and timeline in one place.',
        detail: 'The project is the context everything else hangs off — work orders, milestones, indents and bills all reference it, so a site engineer and the finance desk are looking at the same job.',
        moves: 'A container every later number belongs to.',
      },
      {
        key: 'boq', icon: <FileText size={20} />, title: 'BOQ',
        emits: 'Rates fixed',
        short: 'Itemised quantities and rates, agreed up front.',
        detail: 'Item code, unit, estimated quantity and rate. Every downstream bill is computed from these, so the rate is agreed once rather than argued per bill.',
        moves: 'The basis of all billing on the job.',
      },
      {
        key: 'indent', icon: <ShoppingCart size={20} />, title: 'Indent',
        emits: 'IND-0054',
        short: 'Site asks for material against a BOQ line.',
        detail: 'Requests are raised against a specific BOQ item and work order, so what was asked for can be reconciled with what the line allows.',
        moves: 'A traceable request, not a phone call.',
      },
      {
        key: 'po', icon: <Truck size={20} />, title: 'PO & receipt',
        emits: 'PO + GRN',
        short: 'Buy it, receive it at site, stock updates.',
        detail: 'Purchase orders track Pending through Approved, Dispatched and Delivered. The goods receipt at site updates inventory and creates the payable.',
        moves: 'Inventory up. Payable created.',
      },
      {
        key: 'mb', icon: <Factory size={20} />, title: 'Measurement book',
        emits: 'MB entries',
        short: 'What was actually built, measured and recorded.',
        detail: 'Physical measurements recorded at chainages. Cumulative quantities are what the running-account bill is computed from, so the bill follows the site rather than an estimate.',
        moves: 'Certified quantities.',
      },
      {
        key: 'rabill', icon: <ReceiptText size={20} />, title: 'RA bill',
        emits: 'RA-0007',
        short: 'Measured quantity times BOQ rate, less deductions.',
        detail: 'Running-account bills computed from cumulative measurements, with GST, TDS and retention applied as deductions — a proper tax invoice, print-ready, with the arithmetic shown.',
        moves: 'Receivable created, deductions accounted.',
      },
      {
        key: 'close', icon: <ClipboardCheck size={20} />, title: 'Reconcile',
        emits: 'Balance clear',
        short: 'Billed against measured, against ordered.',
        detail: 'See what was ordered, what was received, what was measured and what has been billed, side by side — which is where over-billing and leakage actually get caught.',
        moves: 'A job you can close with confidence.',
      },
    ],
  },
};

/* One gear, drawn with teeth rather than faked with a dashed circle — the
   mechanical read is the whole point of the metaphor. */
const Gear = ({ size = 44, teeth = 9, className = '', style, opacity = 0.16 }) => {
  const r = 50, tooth = 13, inner = 20;
  const paths = Array.from({ length: teeth }, (_, i) => {
    const a = (i * 360) / teeth;
    return (
      <rect key={i} x={r - 5.5} y={r - 50} width="11" height={tooth} rx="2"
        transform={`rotate(${a} ${r} ${r})`} />
    );
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}
      style={{ opacity, ...style }} aria-hidden="true" focusable="false">
      <g fill="var(--brand-amber)">
        {paths}
        <circle cx={r} cy={r} r="33" />
      </g>
      <circle cx={r} cy={r} r={inner} fill="var(--bg-base)" />
    </svg>
  );
};

const ProcessEngine = () => {
  const [trackKey, setTrackKey] = useState('fabrication');
  const [pinned, setPinned] = useState(null);
  /* seen for the entrance, inView for the running engine — it should not
     keep cycling while the reader is three sections further down. */
  const [ref, , inView] = useInView(0.08);

  const track = TRACKS[trackKey];
  const stages = track.stages;
  const n = stages.length;
  /* The detail panel shows the pinned stage, or the first one as a resting
     state — never nothing, because an empty panel below a lit diagram looks
     like something failed to load. */
  const shown = stages.find((s) => s.key === pinned) || stages[0];

  const switchTrack = (k) => { setTrackKey(k); setPinned(null); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* ── two ambient glows, drifting. Decoration only, kept low contrast
             so it cannot compete with the diagram it sits behind. ── */}
      <div aria-hidden="true" className="mk-drift" style={{
        position: 'absolute', top: -70, left: '12%', width: 300, height: 300,
        background: 'radial-gradient(circle, var(--brand-amber-muted), transparent 68%)',
        filter: 'blur(26px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div aria-hidden="true" className="mk-drift" style={{
        position: 'absolute', bottom: -60, right: '10%', width: 260, height: 260,
        background: 'radial-gradient(circle, hsl(213,94%,68%,0.10), transparent 68%)',
        filter: 'blur(30px)', animationDelay: '-9s', pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── track picker ── */}
        <div role="tablist" aria-label="Which kind of business"
          style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {Object.entries(TRACKS).map(([k, t]) => {
            const on = k === trackKey;
            return (
              <button key={k} role="tab" aria-selected={on} type="button"
                onClick={() => switchTrack(k)}
                style={{
                  padding: '7px 16px', borderRadius: 999, cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
                  border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                  background: on ? 'var(--brand-amber-muted)' : 'transparent',
                  color: on ? 'var(--brand-amber)' : 'var(--text-secondary)',
                  transition: 'all .2s',
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <p style={{
          textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem',
          maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.7,
        }}>
          {track.blurb}
        </p>

        {/* ── the engine ──
            The casing was a flat --bg-base rectangle with a hairline border,
            which on the light theme is near-white on near-white: the diagram
            had no ground to sit on and read as floating bits. It now has a
            soft vertical gradient, a warmer border and a real shadow, so the
            chambers sit ON something. */}
        <div style={{
          position: 'relative',
          background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base) 70%)',
          border: '1px solid var(--border-default)', borderRadius: 22,
          padding: '38px 26px 30px', overflow: 'hidden',
          boxShadow: '0 24px 60px -34px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.05) inset',
        }}>
          {/* The gears are gone.

              They sat at the casing's corners, which has overflow:hidden — so
              each one was sliced in half and read as a rendering fault rather
              than decoration, and the bottom-left one landed directly on the
              "Enquiry" label. A mechanical flourish that collides with the
              text it decorates and gets clipped by its own container is worse
              than no flourish: the engine metaphor is already carried by the
              pipe, the travelling pulse and the chambers igniting in turn. */}

          {/* Seven 52px chambers plus labels cannot fit a phone, and wrapping
              them would break the pipe into pieces and with it the whole
              "one machine" idea. So the diagram scrolls sideways inside its
              own casing — the page itself never scrolls — and the row stays
              intact at every width. */}
          <div className="mk-engine-scroll" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
            <div style={{ position: 'relative', minWidth: 620 }}>

              {/* The pipe the pulse travels, behind the chambers.
                  ARTIFACT_H and the 10px gap below are fixed so this offset is
                  arithmetic rather than a guess: artefact row + gap + half a
                  52px chamber = the chamber centre line. */}
              {/* The pipe spans the FIRST chamber's centre to the LAST one's,
                  not edge to edge.

                  With n equal columns, column i's centre is at (i + 0.5)/n of
                  the width — so the first is at 1/(2n) and the last at
                  1 - 1/(2n). Previously this was a flat 26px inset, which
                  meant two things were wrong at once: the track overshot the
                  end chambers with a stub hanging off each side, and the
                  pulse's seven stops (0, 1/6, 2/6 … 6/6 of the pipe) did not
                  land on the chambers they were supposed to be arriving at.
                  Now they do, exactly. */}
              <div aria-hidden="true" style={{
                position: 'absolute',
                /* The gap has to come out of the span before dividing. With n
                   columns and gap g, a column is (W - (n-1)g)/n wide, so the
                   first centre is at half of that — not W/2n, which ignores
                   the gaps entirely and left the track 3px short at each end. */
                left: `calc((100% - ${(n - 1) * GRID_GAP}px) / ${n * 2})`,
                right: `calc((100% - ${(n - 1) * GRID_GAP}px) / ${n * 2})`,
                top: ARTIFACT_H + 10 + 29 - 1, height: 3,
                /* An inset groove rather than a flat grey bar: a hairline of
                   light along the top edge is what makes a track read as
                   machined instead of drawn. */
                background: 'linear-gradient(180deg, var(--border-emphasis), var(--border-default))',
                borderRadius: 3,
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,.14), 0 1px 0 rgba(255,255,255,.04)',
                /* The pulse rides a full-width rail that translates 100%, so
                   at the end of each cycle the rail's box extends a whole
                   track-width past the right edge. That was 134px of phantom
                   overflow, and it put a horizontal SCROLLBAR across the
                   middle of the diagram at 1440px — where nothing should
                   scroll at all.

                   clip on X, visible on Y: the rail is cut off at the track's
                   end, while the 12px dot is still free to bleed above and
                   below a 3px pipe. `hidden` cannot do this — it forces both
                   axes — which is why this is `clip`. */
                overflowX: 'clip',
                overflowY: 'visible',
              }}>
                <div className="mk-pipe-fill" style={{
                  position: 'absolute', inset: 0, borderRadius: 3, transformOrigin: 'left center',
                  background: 'linear-gradient(90deg, var(--brand-amber-dark), var(--brand-amber))',
                  boxShadow: '0 0 10px hsl(28,100%,54%,.5)',
                  animationName: inView ? 'mk-pipe-fill' : 'none',
                  animationDuration: 'var(--engine-cycle)',
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  transform: 'scaleX(0)',
                }} />
                {/* A full-width RAIL carries the dot. translateX(100%) on the
                    rail therefore means "the width of the track", which is
                    what lets the pulse move on a transform instead of `left`
                    — the property that was forcing a layout pass per frame. */}
                <div className="mk-engine-pulse" style={{
                  position: 'absolute', left: 0, top: 0, width: '100%', height: 0,
                  animationName: inView ? 'mk-pulse-travel' : 'none',
                  animationDuration: 'var(--engine-cycle)',
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  opacity: 0, willChange: 'transform, opacity',
                }}>
                  <div className="mk-pulse-dot" style={{
                    position: 'absolute', left: -6, top: -5.5, width: 12, height: 12,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #fff 0%, var(--brand-amber) 48%, var(--brand-amber-dark) 100%)',
                    boxShadow: '0 0 10px 2px hsl(28,100%,54%,.85), 0 0 26px 8px hsl(28,100%,54%,.3)',
                    animationName: inView ? 'mk-pulse-breathe' : 'none',
                    animationDuration: '2.2s',
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite',
                  }} />
                </div>
              </div>

              {/* chambers */}
              <div style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
                gap: GRID_GAP,
              }}>
            {stages.map((s, i) => {
              /* Every chamber runs the same keyframes for the same duration,
                 offset by its position. One clock for the whole engine.

                 LONGHAND, deliberately. Using the `animation` shorthand here
                 alongside a separate animationDelay looked fine and was not:
                 the shorthand resets animation-delay to 0s, and React only
                 re-applies the properties that CHANGED. On first paint
                 inView is false, so each chamber had `animation: none` plus
                 its delay; when inView flipped, React patched the shorthand
                 alone — wiping all seven delays. The result was every stage
                 firing together once per cycle instead of a sequence, which
                 a screenshot cannot show you and which only turned up by
                 sampling opacity over a full 15.4s cycle. */
              const delay = `calc(var(--engine-cycle) / ${n} * ${i})`;
              const anim = (name) => (inView ? {
                animationName: name,
                animationDuration: 'var(--engine-cycle)',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: delay,
              } : { animationName: 'none' });
              const isPinned = pinned === s.key;
              return (
                <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                  {/* the artefact this stage emits */}
                  {/* Fixed height, so the pipe offset above stays exact. */}
                  <div className="mk-artifact" style={{
                    ...anim('mk-artifact'),
                    opacity: 0, marginBottom: 10, padding: '0 8px',
                    height: ARTIFACT_H, display: 'grid', placeItems: 'center',
                    borderRadius: 6, whiteSpace: 'nowrap',
                    border: '1px solid var(--brand-amber)',
                    background: 'var(--bg-surface)', color: 'var(--brand-amber)',
                    fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {s.emits}
                  </div>

                  {/* The chamber is three stacked layers, so that igniting it
                      costs nothing but opacity:
                        · the resting shell (never animates)
                        · a glow overlay carrying the lit border, fill and
                          shadow — only its opacity and scale animate
                        · a halo that blooms outward and dissipates
                      The previous version animated background-color,
                      border-color and box-shadow on the button itself: four
                      paint properties, on seven elements, forever. */}
                  <button type="button"
                    aria-label={`${s.title}: ${s.short}`}
                    aria-pressed={isPinned}
                    onMouseEnter={() => setPinned(s.key)}
                    onFocus={() => setPinned(s.key)}
                    onClick={() => setPinned(isPinned ? null : s.key)}
                    className="mk-chamber"
                    style={{
                      position: 'relative', width: 58, height: 58, borderRadius: 18,
                      cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                      border: '1px solid var(--border-default)',
                      /* A top-lit face rather than a flat fill: the chamber
                         should look like a machined part catching light. */
                      background: 'linear-gradient(160deg, var(--bg-elevated), var(--bg-surface) 62%)',
                      boxShadow: '0 1px 0 rgba(255,255,255,.6) inset, 0 2px 4px rgba(0,0,0,.06), 0 8px 18px -10px rgba(0,0,0,.25)',
                      outline: isPinned ? '2px solid var(--brand-amber)' : 'none',
                      outlineOffset: 3,
                      transition: 'transform .28s var(--mk-ease-settle)',
                      transform: isPinned ? 'translateY(-2px)' : 'none',
                    }}>
                    <span aria-hidden="true" className="mk-chamber-glow" style={{
                      ...anim('mk-chamber-glow'),
                      position: 'absolute', inset: -1, borderRadius: 16,
                      border: '1px solid var(--brand-amber)',
                      background: 'linear-gradient(160deg, hsl(28,100%,54%,.22), hsl(28,100%,54%,.07))',
                      boxShadow: 'var(--shadow-amber)',
                      opacity: 0, pointerEvents: 'none', willChange: 'transform, opacity',
                    }} />
                    {/* Two icons cross-fading, because animating `color`
                        repaints every frame while opacity composites. */}
                    <span className="mk-chamber-icon" style={{
                      ...anim('mk-chamber-icon'),
                      position: 'relative', display: 'grid', placeItems: 'center',
                    }}>
                      <span className="mk-icon-off" style={{
                        ...anim('mk-icon-off'),
                        color: 'var(--text-muted)', display: 'grid', placeItems: 'center',
                      }}>{s.icon}</span>
                      <span className="mk-icon-on" style={{
                        ...anim('mk-icon-on'),
                        position: 'absolute', inset: 0, opacity: 0,
                        color: 'var(--brand-amber)', display: 'grid', placeItems: 'center',
                      }}>{s.icon}</span>
                    </span>
                  </button>

                  <div style={{
                    marginTop: 10, textAlign: 'center', fontSize: '0.72rem',
                    fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.3,
                  }}>
                    {s.title}
                  </div>
                </div>
              );
            })}
              </div>
            </div>
          </div>
        </div>

        {/* ── detail for the pinned (or resting) stage ── */}
        <div
          /* keyed so the panel re-animates when the stage changes, which is
             what makes a hover feel like it did something */
          key={`${trackKey}-${shown.key}`}
          className="mk-fade"
          style={{
            marginTop: 18, padding: '20px 22px', borderRadius: 16,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            display: 'grid', gap: 10,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--brand-amber)', display: 'grid', placeItems: 'center' }}>{shown.icon}</span>
            <strong style={{
              fontFamily: 'var(--font-display)', fontSize: '1.08rem',
              color: 'var(--text-primary)', letterSpacing: '-0.01em',
            }}>{shown.title}</strong>
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.7rem', fontWeight: 800, color: 'var(--brand-amber)',
              border: '1px solid var(--brand-amber)', background: 'var(--brand-amber-muted)',
              borderRadius: 999, padding: '3px 10px', fontVariantNumeric: 'tabular-nums',
            }}>
              <ChevronRight size={12} /> {shown.emits}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: '0.92rem' }}>
            {shown.detail}
          </p>
          <p style={{
            margin: 0, paddingTop: 10, borderTop: '1px dashed var(--border-subtle)',
            color: 'var(--text-muted)', fontSize: '0.82rem',
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>What moves:</strong> {shown.moves}
          </p>
        </div>

        <p style={{
          marginTop: 12, textAlign: 'center', color: 'var(--text-muted)',
          fontSize: '0.76rem',
        }}>
          Hover or tap any stage to read it. Every document above is produced by the system, numbered and printable.
        </p>
      </div>
    </div>
  );
};

export default ProcessEngine;
