import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Boxes, Truck } from 'lucide-react';
import useInView from '../../hooks/useInView';
import './flow/flow.css';

/* ══════════════════════════════════════════════════════════════════════
   PromiseCheck — "smart inventory", sold as the question it answers.

   "We have inventory management" is a sentence every competitor can write.
   What a fabricator is actually asked, on the phone, before anything else,
   is whether they can deliver 120 brackets by the 3rd. That needs more than
   a stock figure: it needs what this order consumes, what is already
   promised to other orders, what is on the shelf and what is on its way.

   That is what the deficiency engine computes, so the claim is real
   (MaterialRequirementsController):

       Required  = Σ over open order lines (ordered − produced) × BOM qty
       Available = stock on hand
       Shortfall = max(0, Required − Available)
       On order  = open purchase-order quantities
       Buildable = the minimum across BOM lines, naming the line that binds

   Because Required sums EVERY open order, material already promised to
   someone else is counted — which is the difference between "you have
   143 kg" and "you can build this".

   The card alternates between the two moments that matter: blocked before
   the purchase, covered after the receipt. It only cycles while on screen,
   and under reduced motion it holds the first, more useful, state.
   ══════════════════════════════════════════════════════════════════════ */

const STEPS = [
  ['What the customer asked for', '120 × SS304 Mounting Bracket'],
  ['What it consumes', '300 kg SS304 sheet, from the bill of materials'],
  ['What is already promised', '23 kg to other open orders'],
  ['What you hold', '143 kg on hand · nothing on order'],
  ['What to buy', '180 kg — and from whom, at what price'],
  ['What you can promise', 'A delivery date you can keep'],
];

const PromiseCheck = () => {
  const [ref, seen, visible] = useInView(0.2);
  const [after, setAfter] = useState(false);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!visible || reduced) return undefined;
    const h = setInterval(() => setAfter((a) => !a), 4200);
    return () => clearInterval(h);
  }, [visible, reduced]);

  const onHand = after ? 323 : 143;

  return (
    <div ref={ref} className="pc-grid">
      <div className={`pc-copy${seen ? ' mk-rise' : ''}`} style={{ opacity: seen ? undefined : 0 }}>
        <span className="pill pill-amber"><Boxes size={12} /> Smart inventory</span>
        <h2 className="pc-h">Know what you can <span className="mk-hero-accent">promise.</span></h2>
        <p className="pc-lede">
          Every system can tell you there are 143 kg on the shelf. The question you get
          asked is whether you can deliver 120 brackets by the 3rd. Maks Ops works that
          out across <em>every</em> open order — not just this one — and names the material
          holding you back.
        </p>
        <ol className="pc-steps">
          {STEPS.map(([k, v], i) => (
            <li key={k} style={{ animationDelay: `${120 + i * 70}ms` }} className={seen ? 'mk-rise' : ''}>
              <span className="pc-n">{i + 1}</span>
              <span><b>{k}</b><small>{v}</small></span>
            </li>
          ))}
        </ol>
      </div>

      <div className={`pc-card${seen ? ' mk-scale-in' : ''}`} style={{ opacity: seen ? undefined : 0 }}>
        <div className="pc-card-h">
          <span>
            <b>SO-{new Date().getFullYear()}-00672</b>
            <small>Acme Engineering · 120 × SS304 Mounting Bracket</small>
          </span>
          <span className={`fl-pill ${after ? 'tone-ok' : 'tone-danger'}`}>
            {after ? <><Check size={11} strokeWidth={3} /> Covered</> : <><AlertTriangle size={11} /> Short</>}
          </span>
        </div>

        <div className="pc-material">SS304 sheet, 2 mm <span>2.5 kg a piece</span></div>

        <div className="pc-rows">
          <div className="pc-row">
            <span>Required by open orders<small>this order 300 · already promised 23</small></span>
            <b>323 kg</b>
          </div>
          <div className="pc-row">
            <span>On hand{after && <small className="pc-plus"><Truck size={10} /> +180 kg received</small>}</span>
            <b key={onHand} className="pc-num">{onHand} kg</b>
          </div>
          <div className="pc-row"><span>On order</span><b>0 kg</b></div>
          <div className={`pc-row ${after ? 'is-ok' : 'is-short'}`}>
            <span>{after ? 'Surplus' : 'Short'}</span>
            <b>{after ? '0 kg' : '180 kg'}</b>
          </div>
        </div>

        <div className="fl-cover pc-cover">
          <span className="fl-cover-have" style={{ transform: `scaleX(${seen ? onHand / 323 : 0})` }} />
          <span className={`fl-cover-gap${after ? '' : ' is-on'}`} />
        </div>

        <div className={`pc-verdict ${after ? 'is-ok' : 'is-short'}`}>
          {after
            ? <><Check size={14} strokeWidth={3} /> 120 of 120 can be built — promise the date.</>
            : <><AlertTriangle size={14} /> Blocked by SS304 sheet, 2 mm. Buy 180 kg to cover it.</>}
        </div>
      </div>
    </div>
  );
};

export default PromiseCheck;
