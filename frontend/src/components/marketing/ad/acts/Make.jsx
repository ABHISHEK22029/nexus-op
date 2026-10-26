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
    <div className="reel-act reel-make">
      {/* production */}
      <In on={t >= 100} off={t >= OUT} fx="rise" at={[180, 150, 920, 372]} className="reel-card reel-prod">
        <span className="reel-prod-h">
          <span><span className="reel-eyebrow">Production order</span><b className="reel-id is-big">{IDS.prod}</b></span>
          <b className="reel-prod-what">{PRODUCT.name}</b>
          <span className={`reel-chip ${t >= DONE ? 'tone-green' : 'tone-blue'}`}>{t >= DONE ? 'Completed' : 'In Progress'}</span>
        </span>
        <span className="reel-prod-flow">
          <span className="reel-prod-in">
            <small>{MATERIAL.name}</small>
            <span className="reel-prod-bar"><i style={{ transform: `scaleX(${t >= RUN ? 0.001 : 1})` }} /></span>
            <b>{inr(left)} kg</b>
          </span>
          <span className={`reel-prod-arrow${t >= RUN && t < DONE ? ' is-on' : ''}`}><ArrowRight size={26} /></span>
          <span className="reel-prod-out">
            <span className="reel-pcs">{Array.from({ length: QTY }, (_, i) => <i key={i} className={i < made ? 'is-on' : ''} />)}</span>
            <b><span className="reel-big-num">{made}</span> pcs</b>
          </span>
        </span>
        <span className="reel-prod-foot">
          <span className="reel-eyebrow">Yield &amp; Material Balance</span>
          <In on={t >= 2900} fx="pop" as="span" className="reel-prod-yield">
            <Ring size={78} stroke={8} value={t >= 3000 ? YIELD.yieldPct / 100 : 0} tone="green" dur={900}>
              <b className="is-small">{YIELD.yieldPct}%</b>
            </Ring>
            <small>yield</small>
          </In>
          <In on={t >= 3300} fx="pop" as="span" className="reel-chip is-lg">Scrap {YIELD.scrap} kg</In>
          <In on={t >= 3500} fx="pop" as="span" className="reel-chip is-lg tone-amber">₹{YIELD.costPerPiece} / piece</In>
        </span>
      </In>

      {/* delivery */}
      <In on={t >= OUT + 100} fx="drive" at={[60, 200, 330, 150]} className="reel-card reel-dc">
        <span className="reel-dc-ico"><Truck size={24} /></span>
        <span><span className="reel-eyebrow">Delivery challan</span><b className="reel-id is-big">{IDS.dc}</b></span>
        <span className="reel-muted">{QTY} × {PRODUCT.name}</span>
        <span className="reel-dc-veh">TS 09 EU 1234</span>
      </In>

      {/* the tax invoice, and its payment */}
      <In on={t >= INV} fx="pop" at={[440, 104, 580, 520]} className="reel-card reel-doc reel-inv">
        <span className="reel-doc-top">
          <span><span className="reel-eyebrow">Tax invoice</span><b className="reel-id is-big">{IDS.inv}</b></span>
          <span className={`reel-chip is-lg ${t >= PAID ? 'tone-green' : 'tone-amber'}`}>{t >= PAID ? 'Paid' : 'Unpaid'}</span>
        </span>
        <span className="reel-muted">Bill to {CUSTOMER.name}</span>
        <span className="reel-tr is-head"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></span>
        <span className="reel-tr"><span className="reel-tr-item"><Bracket size={30} /> {PRODUCT.name}</span><span>{QTY}</span><span>₹{inr(RATE)}</span><span>₹{inr(SUB)}</span></span>
        <div className="reel-sums">
          <span>CGST 9% <b>₹{inr(HALF_GST)}</b></span>
          <span>SGST 9% <b>₹{inr(HALF_GST)}</b></span>
          <span className="is-total">Total <b>₹{inr(Math.round(total))}</b></span>
        </div>
        <In on={t >= 7800} fx="rise" className={`reel-btn reel-inv-pay${t >= 7780 && t < 8360 ? ' is-hot' : ''}`}>
          <IndianRupee size={14} /> Record payment
        </In>
        <In on={t >= PAID} fx="stamp" className="reel-stamp tone-green is-big" style={{ left: 300, top: 150 }}>Paid</In>
        <span className="reel-inv-burst" style={{ left: 330, top: 120 }}><Burst on={t >= PAID + 50} n={20} tone="green" size={220} /></span>
      </In>

      <Cursor t={t} path={CURSOR} until={9600} />
    </div>
  );
}
