import React from 'react';
import { Inbox, FileText, ClipboardList, ShoppingCart, PackageCheck, Factory, Truck, ReceiptText } from 'lucide-react';
import { Lines, Thread as Line } from '../parts';
import { IDS } from '../util';

/* ══════════════════════════════════════════════════════════════════════
   Act 7 — every step, connected. (67–73 s)

   The camera pulls back from the single order to all of it at once: the
   eight records it made, enquiry to invoice, in a line across the frame.
   The thread runs through them and each lights as it is reached; then
   light keeps travelling along it, the way the work does.
   ══════════════════════════════════════════════════════════════════════ */

const STEPS = [
  ['Enquiry', IDS.enq, Inbox], ['Quotation', IDS.qt, FileText], ['Order', IDS.co, ClipboardList],
  ['Purchase order', IDS.po, ShoppingCart], ['Goods receipt', IDS.grn, PackageCheck], ['Production', IDS.prod, Factory],
  ['Delivery', IDS.dc, Truck], ['Invoice', IDS.inv, ReceiptText],
].map((step, i) => [...step, i]);
const YS = [318, 262, 300, 244, 286, 236, 276, 250];
const PTS = STEPS.map((_, i) => [110 + i * 151.4, YS[i]]);

/* A smooth line through the points (Catmull–Rom, as cubic Béziers),
   entering from the left edge and leaving by the right. */
const smooth = (pts) => {
  const p = [[-60, 336], ...pts, [1340, 236]];
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};
const PATH = smooth(PTS);
const DRAW_AT = 300, DRAW = 2400;

export default function Thread({ t }) {
  return (
    <div className={`reel-act reel-thread-act${t >= 40 ? ' is-on' : ''}`}>
      <Lines><Line d={PATH} on={t >= DRAW_AT} dur={DRAW} /></Lines>
      {t >= DRAW_AT + DRAW && [0, 1, 2, 3].map((i) => (
        <span key={i} className="reel-travel" style={{ offsetPath: `path("${PATH}")`, animationDelay: `${i * 650}ms` }} />
      ))}
      {STEPS.map(([label, id, icon, i]) => {
        const Ico = icon;
        const [x, y] = PTS[i];
        const lit = t >= DRAW_AT + ((i + 1) / (STEPS.length + 1)) * DRAW;
        return (
          <div key={label} className={`reel-node${t >= i * 140 ? ' is-on' : ''}${lit ? ' is-lit' : ''}${t >= 2900 ? ' is-pulse' : ''}`}
            style={{ left: x - 36, top: y - 36, '--i': i }}>
            <span className="reel-node-dot"><Ico size={26} /></span>
            <span className="reel-node-label"><b>{label}</b><small>{id}</small></span>
          </div>
        );
      })}
    </div>
  );
}
