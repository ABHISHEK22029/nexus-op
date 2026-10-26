import React from 'react';
import { ArrowRightLeft, Share2, Check } from 'lucide-react';
import { CUSTOMER, PRODUCT, QTY, RATE, SUB, HALF_GST, TOTAL, SELLER } from '../../data/transaction';
import { In, Lines, Thread, Rider, Cursor } from '../parts';
import { OrderCard } from '../screens';
import { IDS, clickAt, count, inr } from '../util';
import { Bracket } from '../art';

/* ══════════════════════════════════════════════════════════════════════
   Act 3 — the quotation, its approval, and the order. (22–34.5 s)

   The enquiry, large: one press of Convert to quotation and it turns over
   into QT-0007, filling itself in — the line, the GST, the total counting
   up. Shared for approval, it flies to the customer, who accepts it; it
   comes back stamped. Then it folds into the order, CO-0012, whose ring
   checks the stock behind it and stops short: 57 of 120.

   At the end the order moves to the left, where the next act starts.
   ══════════════════════════════════════════════════════════════════════ */

const FLIP = 1000;          // the enquiry turns over into the quotation
const SHARED = 5500;        // sent to the customer
const ACCEPTED = 6650;      // the stamp lands
const FOLD = 8500;          // it becomes the order
const DOCK = 11400;         // the order moves to where act 4 picks it up

const CURSOR = [
  { at: 0, x: 900, y: 640 },
  clickAt(700, 526, 472),           // Convert to quotation
  { at: 1300, x: 1000, y: 650 },
  clickAt(5200, 454, 534),          // Share for approval
  clickAt(6400, 980, 474),          // Accept quotation
  { at: 7000, x: 1120, y: 640 },
];
const FLY = 'M 520 360 C 690 240, 900 220, 1040 300';

export default function Quote({ t }) {
  const total = count(t, 2700, 1000, 0, TOTAL);
  const order = t < 9000 ? 'idle' : t < 10700 ? 'checking' : 'short';
  return (
    <div className="reel-act reel-quote">
      <div className="reel-flip">
        {/* the enquiry, as it arrived */}
        <div className={`reel-card reel-enq${t >= FLIP ? ' is-flipped' : ''}`} style={{ left: 390, top: 150, width: 500, height: 370 }}>
          <span className="reel-enq-top"><b className="reel-id">{IDS.enq}</b><span className="reel-chip tone-blue">New</span></span>
          <b className="reel-enq-who">{CUSTOMER.short}</b>
          <span className="reel-muted">{CUSTOMER.contact} · {CUSTOMER.email}</span>
          <span className="reel-enq-want"><Bracket size={60} /><span><b>{PRODUCT.name}</b><small>× {QTY} {PRODUCT.unit}</small></span></span>
          <span className="reel-note">“Brushed finish, delivery in 4 weeks.”</span>
          <span className={`reel-btn reel-enq-go${t >= 150 && t < 760 ? ' is-hot' : ''}`}><ArrowRightLeft size={14} /> Convert to quotation</span>
        </div>

        {/* the quotation it turns into */}
        <In on={t >= FLIP} fx="flip" d={300}
          className={`reel-card reel-doc reel-qt${t >= SHARED ? ' is-shared' : ''}${t >= FOLD ? ' is-folded' : ''}`}
          style={{ left: 330, top: 140, width: 620, height: 440 }}>
          <span className="reel-doc-top">
            <span><span className="reel-eyebrow">Quotation</span><b className="reel-id is-big">{IDS.qt}</b></span>
            <span className={`reel-chip ${t >= ACCEPTED ? 'tone-green' : t >= SHARED ? 'tone-blue' : ''}`}>
              {t >= ACCEPTED ? 'Accepted' : t >= SHARED ? 'Sent' : 'Draft'}
            </span>
          </span>
          <span className="reel-muted">{SELLER.name} → {CUSTOMER.short}</span>
          <In on={t >= FLIP + 300} fx="fade" className="reel-tr is-head"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></In>
          <In on={t >= FLIP + 500} fx="left" className="reel-tr">
            <span className="reel-tr-item"><Bracket size={30} /> {PRODUCT.name}</span><span>{QTY}</span><span>₹{inr(RATE)}</span><span>₹{inr(SUB)}</span>
          </In>
          <div className="reel-sums">
            <In on={t >= 1800} fx="fade" as="span">Sub-total <b>₹{inr(SUB)}</b></In>
            <In on={t >= 2000} fx="left" as="span">CGST 9% <b>₹{inr(HALF_GST)}</b></In>
            <In on={t >= 2300} fx="left" as="span">SGST 9% <b>₹{inr(HALF_GST)}</b></In>
            <In on={t >= 2600} fx="rise" as="span" className={`is-total${t >= 3700 ? ' is-shine' : ''}`}>Total <b>₹{inr(Math.round(total))}</b></In>
          </div>
          <In on={t >= 4400} fx="rise" className={`reel-btn reel-qt-share${t >= 4650 && t < 5260 ? ' is-hot' : ''}`}>
            <Share2 size={14} /> Share for approval
          </In>
          <In on={t >= ACCEPTED} fx="stamp" className="reel-stamp tone-green" style={{ left: 320, top: 92 }}>Accepted</In>
        </In>
      </div>

      {/* the customer's side */}
      <Lines><Thread d={FLY} on={t >= SHARED} off={t >= 7800} dur={600} /></Lines>
      <Rider d={FLY} on={t >= SHARED} dur={600} className={`reel-paper${t >= SHARED + 650 ? ' is-landed' : ''}`}><i /><i /><i /></Rider>
      <In on={t >= SHARED + 150} off={t >= 7800} fx="right" at={[870, 190, 340, 330]} className="reel-browser reel-cust">
        <div className="reel-browser-bar"><i /><i /><i /></div>
        <div className="reel-cust-body">
          <span className="reel-muted">Quotation from {SELLER.name}</span>
          <b className="reel-cust-amt">₹{inr(TOTAL)}</b>
          <span className="reel-muted">{QTY} × {PRODUCT.name}</span>
          {t >= 6500
            ? <span className="reel-cust-done"><Check size={16} /> Accepted</span>
            : <span className="reel-cust-btns">
                <span className={`reel-btn is-green${t >= 5900 ? ' is-hot' : ''}`}><Check size={14} /> Accept quotation</span>
                <span className="reel-btn is-ghost">Decline</span>
              </span>}
        </div>
      </In>

      {/* and the order it becomes */}
      <In on={t >= FOLD + 100} fx="pop" className={`reel-order-host${t >= DOCK ? ' is-docked' : ''}`} at={[430, 210, 420, 250]}>
        <OrderCard at={[0, 0, 420, 250]} state={order} />
      </In>

      <Cursor t={t} path={CURSOR} until={7600} />
    </div>
  );
}
