import React from 'react';
import { Truck, IndianRupee, ArrowRight } from 'lucide-react';
import { CUSTOMER, MATERIAL, PRODUCT, QTY, RATE, SUB, HALF_GST, TOTAL, YIELD } from '../../data/transaction';
import { In, Ring, Burst, Cursor } from '../parts';
import { IDS, clickAt, count, inr } from '../util';
import { Bracket } from '../art';

/* ══════════════════════════════════════════════════════════════════════
   Act 6 — made, sent, billed, paid. (55–67 s)

   Production: the sheet drains out of its bar as the brackets count up
   to 120 on the other side, and the yield ring comes round to 94.2%.

   Then it leaves: the delivery challan drives across, the tax invoice
   builds itself with its GST and total, Record payment — and the status
   flips to Paid, stamped, with a burst.
   ══════════════════════════════════════════════════════════════════════ */

const RUN = 500;            // material starts going in
const DONE = 2700;          // all 120 made
const OUT = 5500;           // production gives way to delivery
const INV = 6500;           // the invoice
const PAID = 8700;

const CURSOR = [{ at: 7300, x: 1000, y: 660 }, clickAt(8300, 568, 574), { at: 9000, x: 1080, y: 660 }];

export default function Make({ t }) {
  const made = Math.round(count(t, RUN + 100, DONE - RUN - 100, 0, QTY));
  const left = Math.round(count(t, RUN, DONE - RUN, YIELD.issued, 0));
  const total = count(t, INV + 400, 700, 0, TOTAL);
  return (
    <div className="ad-act ad-make">
      {/* production */}
      <In on={t >= 100} off={t >= OUT} fx="rise" at={[180, 150, 920, 372]} className="ad-card ad-prod">
        <span className="ad-prod-h">
          <span><span className="ad-eyebrow">Production order</span><b className="ad-id is-big">{IDS.prod}</b></span>
          <b className="ad-prod-what">{PRODUCT.name}</b>
          <span className={`ad-chip ${t >= DONE ? 'tone-green' : 'tone-blue'}`}>{t >= DONE ? 'Completed' : 'In Progress'}</span>
        </span>
        <span className="ad-prod-flow">
          <span className="ad-prod-in">
            <small>{MATERIAL.name}</small>
            <span className="ad-prod-bar"><i style={{ transform: `scaleX(${t >= RUN ? 0.001 : 1})` }} /></span>
            <b>{inr(left)} kg</b>
          </span>
          <span className={`ad-prod-arrow${t >= RUN && t < DONE ? ' is-on' : ''}`}><ArrowRight size={26} /></span>
          <span className="ad-prod-out">
            <span className="ad-pcs">{Array.from({ length: QTY }, (_, i) => <i key={i} className={i < made ? 'is-on' : ''} />)}</span>
            <b><span className="ad-big-num">{made}</span> pcs</b>
          </span>
        </span>
        <span className="ad-prod-foot">
          <span className="ad-eyebrow">Yield &amp; Material Balance</span>
          <In on={t >= 2900} fx="pop" as="span" className="ad-prod-yield">
            <Ring size={78} stroke={8} value={t >= 3000 ? YIELD.yieldPct / 100 : 0} tone="green" dur={900}>
              <b className="is-small">{YIELD.yieldPct}%</b>
            </Ring>
            <small>yield</small>
          </In>
          <In on={t >= 3300} fx="pop" as="span" className="ad-chip is-lg">Scrap {YIELD.scrap} kg</In>
          <In on={t >= 3500} fx="pop" as="span" className="ad-chip is-lg tone-amber">₹{YIELD.costPerPiece} / piece</In>
        </span>
      </In>

      {/* delivery */}
      <In on={t >= OUT + 100} fx="drive" at={[60, 200, 330, 150]} className="ad-card ad-dc">
        <span className="ad-dc-ico"><Truck size={24} /></span>
        <span><span className="ad-eyebrow">Delivery challan</span><b className="ad-id is-big">{IDS.dc}</b></span>
        <span className="ad-muted">{QTY} × {PRODUCT.name}</span>
        <span className="ad-dc-veh">TS 09 EU 1234</span>
      </In>

      {/* the tax invoice, and its payment */}
      <In on={t >= INV} fx="pop" at={[440, 104, 580, 520]} className="ad-card ad-doc ad-inv">
        <span className="ad-doc-top">
          <span><span className="ad-eyebrow">Tax invoice</span><b className="ad-id is-big">{IDS.inv}</b></span>
          <span className={`ad-chip is-lg ${t >= PAID ? 'tone-green' : 'tone-amber'}`}>{t >= PAID ? 'Paid' : 'Unpaid'}</span>
        </span>
        <span className="ad-muted">Bill to {CUSTOMER.name}</span>
        <span className="ad-tr is-head"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></span>
        <span className="ad-tr"><span className="ad-tr-item"><Bracket size={30} /> {PRODUCT.name}</span><span>{QTY}</span><span>₹{inr(RATE)}</span><span>₹{inr(SUB)}</span></span>
        <div className="ad-sums">
          <span>CGST 9% <b>₹{inr(HALF_GST)}</b></span>
          <span>SGST 9% <b>₹{inr(HALF_GST)}</b></span>
          <span className="is-total">Total <b>₹{inr(Math.round(total))}</b></span>
        </div>
        <In on={t >= 7800} fx="rise" className={`ad-btn ad-inv-pay${t >= 7780 && t < 8360 ? ' is-hot' : ''}`}>
          <IndianRupee size={14} /> Record payment
        </In>
        <In on={t >= PAID} fx="stamp" className="ad-stamp tone-green is-big" style={{ left: 300, top: 150 }}>Paid</In>
        <span className="ad-inv-burst" style={{ left: 330, top: 120 }}><Burst on={t >= PAID + 50} n={20} tone="green" size={220} /></span>
      </In>

      <Cursor t={t} path={CURSOR} until={9600} />
    </div>
  );
}
