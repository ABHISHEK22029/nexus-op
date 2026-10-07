import React from 'react';
import {
  MessageSquareQuote, FileText, ShoppingBag, ShoppingCart, PackageCheck, Factory, Truck, ReceiptText, Wallet,
} from 'lucide-react';
import { IDS } from '../../flow/story';
import { SELLER, CUSTOMER, PRODUCT, QTY, RATE, TOTAL } from '../../data/transaction';
import { rupee } from '../../film/shell/format';
import { Lines, Thread, Rider } from '../parts';
import { box } from '../geo';

/* ══════════════════════════════════════════════════════════════════════
   Act 5 — paid, and the chain behind it. (41–45.5 s; from 41 s)

   The tax invoice for the order, INV-0147, and the payment that closes
   it. Then the camera pulls back: the invoice shrinks into the last link
   of a chain, and the seven records before it come into view — every one
   of them a real record type, in the app's own numbering, each linked to
   the one before. The thread runs the length of it.
   ══════════════════════════════════════════════════════════════════════ */

const LINKS = [
  ['Enquiry', IDS.enq, MessageSquareQuote],
  ['Quotation', IDS.qt, FileText],
  ['Order', IDS.co, ShoppingBag],
  ['Purchase order', IDS.po, ShoppingCart],
  ['Goods receipt', IDS.grn, PackageCheck],
  ['Production', IDS.prod, Factory],
  ['Delivery challan', IDS.dc, Truck],
  ['Tax invoice', IDS.inv, ReceiptText],
];

const L = {
  wide: {
    inv: [430, 140, 420, 520],
    node: (i) => [42 + i * 152, 318, 140, 84],
    line: 'M 112 360 L 1176 360',
    sum: [0, 440, 1280],
    zoom: 'translate(536px, -40px) scale(0.333)',
  },
  narrow: {
    inv: [60, 130, 300, 420],
    node: (i) => [64, 118 + i * 70, 300, 56],
    line: 'M 40 146 L 40 636',
    sum: null,
    zoom: 'translate(4px, 296px) scale(0.3)',
  },
};

const PULL = 1400, DRAW = 2100, DRAW_MS = 1300;

export default function Chain({ t, layout }) {
  const l = L[layout];
  const paid = t >= 900;
  const pulled = t >= PULL;
  return (
    <div className={`ad-act ad-chain is-${layout}`}>
      {t < PULL + 800 && (
        <div className={`ad-inv${pulled ? ' is-pulled' : ''}`} style={{ ...box(l.inv), '--zoom': l.zoom }}>
          <div className="ad-inv-top">
            <span className="fm-paper-logo">PF</span>
            <span className="ad-inv-co"><b>{SELLER.name}</b><small>GSTIN {SELLER.gstin}</small></span>
            <span className="ad-inv-title"><b>TAX INVOICE</b><small className="fm-mono-b">{IDS.inv}</small></span>
          </div>
          <div className="ad-inv-to"><small>Bill to</small><b>{CUSTOMER.name}</b><span>Order {IDS.co} · E-way bill recorded</span></div>
          <div className="ad-inv-line"><span>{PRODUCT.name}</span><span>{QTY} × {rupee(RATE)}</span></div>
          <div className="ad-inv-line is-gst"><span>CGST 9% + SGST 9%</span><span>incl.</span></div>
          <div className="ad-inv-total"><span>Invoice total</span><b>{rupee(TOTAL)}</b></div>
          <span className={`fl-btn primary is-wide ad-inv-pay${t >= 650 && t < 850 ? ' is-pressed' : ''}`}><Wallet size={13} /> {paid ? 'Paid in full' : 'Record payment'}</span>
          {paid && <span className="ad-stamp">PAID</span>}
        </div>
      )}

      <Lines layout={layout}>
        <Thread d={l.line} on={t >= DRAW} dur={DRAW_MS} />
      </Lines>
      <Rider d={l.line} on={t >= DRAW} dur={DRAW_MS} />

      {LINKS.map((link, i) => {
        const [kind, id] = link;
        const Ico = link[2];
        const shown = pulled && t >= PULL + 200 + i * 70;
        const lit = t >= DRAW + (DRAW_MS * i) / (LINKS.length - 1) - 60;
        return (
          <div key={kind} className={`ad-link${shown ? ' is-on' : ''}${lit ? ' is-lit' : ''}`} style={box(l.node(i))}>
            <span className="ad-link-ico"><Ico size={layout === 'narrow' ? 15 : 16} /></span>
            <span className="ad-link-main"><small>{kind}</small><b className="fm-mono-b">{id}</b></span>
          </div>
        );
      })}
      {l.sum && (
        <p className={`ad-chain-sum${t >= DRAW + DRAW_MS ? ' is-on' : ''}`} style={box(l.sum)}>
          One order — {CUSTOMER.short}, {QTY} × {PRODUCT.name}, {rupee(TOTAL)} — and every record it made, each linked to the last.
        </p>
      )}
    </div>
  );
}
