import React from 'react';
import { Link2 } from 'lucide-react';
import { Show } from '../../../flow/kit';
import { makeIds, FILM_DATE, CUSTOMER } from '../../../data/transaction';
import { MoMark } from '../../shell/marks';

/* 17 — the close. The transaction as the records it made, then the same
   records as one connected picture, then the mark. */
export const Icon = Link2;

const IDS = makeIds(FILM_DATE);
const CHAIN = [
  ['Enquiry', IDS.enq], ['Quotation', IDS.qt], ['Customer order', IDS.co], ['Purchase order', IDS.po],
  ['Goods receipt', IDS.grn], ['Production', IDS.prod], ['Delivery challan', IDS.dc], ['Tax invoice', IDS.inv],
];

/* The graph: who feeds whom. Columns left to right; each node lists the
   nodes it points to. */
const NODES = [
  { k: 'cust', label: CUSTOMER.short, sub: 'customer', col: 0, row: 1 },
  { k: 'cat', label: 'Catalogue', sub: 'public page', col: 1, row: 1 },
  { k: 'enq', label: 'Enquiry', sub: IDS.enq, col: 2, row: 1 },
  { k: 'sales', label: 'Sales', sub: 'quotation · order', col: 3, row: 0 },
  { k: 'stock', label: 'Stock', sub: 'requirements', col: 3, row: 1 },
  { k: 'buy', label: 'Purchasing', sub: 'PO · receipt', col: 3, row: 2 },
  { k: 'prod', label: 'Production', sub: 'yield · cost', col: 4, row: 1 },
  { k: 'inv', label: 'Invoice', sub: 'dispatch · GST', col: 5, row: 1 },
  { k: 'cash', label: 'Payment', sub: 'received', col: 6, row: 1 },
];
const EDGES = [
  ['cust', 'cat'], ['cat', 'enq'], ['enq', 'sales'], ['enq', 'stock'], ['enq', 'buy'],
  ['sales', 'prod'], ['stock', 'prod'], ['buy', 'prod'], ['prod', 'inv'], ['inv', 'cash'],
];

function Graph({ t, layout }) {
  const at = t - 9000;
  const W = layout === 'narrow' ? 380 : 1160, H = layout === 'narrow' ? 560 : 380;
  const cols = 7, rows = 3;
  /* narrow: the columns run top to bottom instead */
  const pos = (n) => (layout === 'narrow'
    ? { x: 62 + n.row * 128, y: 30 + n.col * 80 }
    : { x: 50 + n.col * ((W - 100) / (cols - 1)), y: 60 + n.row * ((H - 120) / (rows - 1)) });
  const byKey = Object.fromEntries(NODES.map((n) => [n.k, n]));
  return (
    <div className="fm-graph" style={{ width: W, height: H }}>
      <svg className="fm-graph-edges" width={W} height={H} aria-hidden="true">
        {EDGES.map(([a, b], i) => {
          const p = pos(byKey[a]), q = pos(byKey[b]);
          return (
            <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} pathLength="1"
              className={`fm-edge${at >= 400 + i * 260 ? ' is-on' : ''}`} />
          );
        })}
      </svg>
      {NODES.map((n, i) => {
        const p = pos(n);
        return (
          <Show key={n.k} on={at >= i * 240} className="fm-node" style={{ left: p.x, top: p.y }}>
            <b>{n.label}</b><small>{n.sub}</small>
          </Show>
        );
      })}
    </div>
  );
}

export default function Scene({ t, layout }) {
  if (t >= 15000) {
    return (
      <div className="fm-open fm-end">
        <div className="fm-open-mark fl-enter-soft">
          <MoMark size={104} />
          <b>Maks Ops</b>
          <span>From catalogue to cash.</span>
          <Show on={t >= 16400} as="small">Everything in between, connected.</Show>
        </div>
      </div>
    );
  }
  if (t >= 9000) {
    return (
      <div className="fm-close fm-close-graph">
        <Show on className="fm-close-h">Each record linked to the one before it.</Show>
        <Graph t={t} layout={layout} />
      </div>
    );
  }
  return (
    <div className="fm-close">
      <Show on={t >= 200} className="fm-close-h">One enquiry, eight records.</Show>
      <div className="fm-chain">
        {CHAIN.map(([label, id], i) => (
          <Show key={id} on={t >= 700 + i * 850} from="left" className="fm-link">
            <small>{label}</small>
            <b>{id}</b>
          </Show>
        ))}
      </div>
    </div>
  );
}
