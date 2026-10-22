import React from 'react';
import { PackageCheck, Check } from 'lucide-react';
import { MATERIAL, STOCK, VENDORS } from '../../data/transaction';
import { In, Lines, Thread, Rider } from '../parts';
import { OrderCard } from '../screens';
import { IDS, count, inr } from '../util';

/* ══════════════════════════════════════════════════════════════════════
   Act 5 — goods in, stock up. (49.5–55 s)

   The goods receipt slides in, and the 180 kg pours across into the
   stock — a tank filling from 143 to 323 kg as the drops arrive. The
   order on the right was blocked by this sheet; its ring comes round to
   green: all 120 can be built with stock on hand.
   ══════════════════════════════════════════════════════════════════════ */

const POUR = 700;           // the material starts arriving
const FULL = 2700;          // all of it in
const READY = 3000;         // the order turns ready
const CAP = 400;            // the tank's scale, kg

const FLOW = 'M 400 330 C 470 250, 560 120, 640 196';
const TO_ORDER = 'M 736 372 C 790 372, 812 338, 860 338';

export default function Stock({ t }) {
  const level = t >= POUR ? STOCK.after : STOCK.onHand;
  const kg = Math.round(count(t, POUR, FULL - POUR, STOCK.onHand, STOCK.after));
  return (
    <div className="ad-act ad-stock">
      <In on fx="left" at={[70, 230, 330, 210]} className="ad-card ad-grn">
        <span className="ad-grn-ico"><PackageCheck size={22} /></span>
        <span className="ad-eyebrow">Goods receipt</span>
        <b className="ad-id is-big">{IDS.grn}</b>
        <span className="ad-grn-what">{MATERIAL.name}</span>
        <span className="ad-muted">{STOCK.short} kg · from {VENDORS[1].name}</span>
        <span className="ad-chip tone-green"><Check size={12} /> Received</span>
      </In>

      {Array.from({ length: 11 }, (_, i) => {
        const at = POUR + i * 170;
        return <Rider key={i} d={FLOW} on={t >= at} dur={850} className={`ad-drip${t >= at + 850 ? ' is-landed' : ''}`} />;
      })}

      <In on={t >= 150} fx="rise" at={[545, 150, 190, 440]} className="ad-tank">
        <span className="ad-tank-h">{MATERIAL.name.split(',')[0]}</span>
        <span className="ad-tank-glass">
          <i className="ad-tank-fill" style={{ transform: `scaleY(${level / CAP})` }} />
          <i className="ad-tank-mark" style={{ bottom: `${(STOCK.onHand / CAP) * 100}%` }}><span>{STOCK.onHand} kg</span></i>
        </span>
        <b className={`ad-tank-kg${t >= FULL ? ' is-full' : ''}`}>{inr(kg)} kg</b>
      </In>

      <Lines><Thread d={TO_ORDER} on={t >= FULL} dur={400} /></Lines>
      <In on fx="fade" at={[860, 230, 360, 214]} className="ad-order-host">
        <OrderCard at={[0, 0, 360, 214]} state={t >= READY ? 'ready' : 'short'} />
      </In>
    </div>
  );
}
