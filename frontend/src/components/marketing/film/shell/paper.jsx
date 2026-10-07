import React from 'react';
import { SELLER } from '../../data/transaction';

/* A printed document as the app prints it: the letterhead, the title and
   number, who it is for, the lines, the totals. The quotation, purchase
   order, challan and invoice chapters all use it, so the documents in the
   film look like one company's paperwork — because the app's do. */

export function Paper({ title, id, children, stamp, className = '' }) {
  return (
    <div className={`fm-paper ${className}`}>
      <div className="fm-paper-top">
        <span className="fm-paper-logo">PF</span>
        <span className="fm-paper-co">
          <b>{SELLER.name}</b>
          <small>Plot 14, IDA Cherlapally, {SELLER.city} · {SELLER.state} ({SELLER.stateCode})</small>
          <small>GSTIN {SELLER.gstin}</small>
        </span>
        <span className="fm-paper-title"><b>{title}</b><small>{id}</small></span>
      </div>
      {children}
      {stamp && <span className="fm-paper-stamp">{stamp}</span>}
    </div>
  );
}

/** [[label, value], …] in two columns */
export const Meta = ({ left, right }) => (
  <div className="fm-paper-meta">
    <div>{left.map(([k, v]) => <p key={k}><small>{k}</small><b>{v}</b></p>)}</div>
    <div>{right.map(([k, v]) => <p key={k}><small>{k}</small><b>{v}</b></p>)}</div>
  </div>
);

/** cols: [label, align?]; rows: arrays of cells */
export const Lines = ({ cols, rows }) => (
  <div className="fm-paper-lines" style={{ '--n': cols.length }}>
    <div className="fm-pl is-head">{cols.map(([c, a]) => <span key={c} className={a === 'r' ? 'r' : ''}>{c}</span>)}</div>
    {rows.map((r, i) => (
      <div key={i} className="fm-pl">{r.map((c, j) => <span key={j} className={cols[j]?.[1] === 'r' ? 'r' : ''}>{c}</span>)}</div>
    ))}
  </div>
);

/** [[label, value, strong?], …] */
export const Totals = ({ rows, words }) => (
  <div className="fm-paper-tot">
    <div className="fm-paper-words">{words && <><small>In words:</small> {words}</>}</div>
    <div className="fm-paper-sum">
      {rows.map(([k, v, strong]) => (
        <p key={k} className={strong ? 'is-strong' : ''}><span>{k}</span><b>{v}</b></p>
      ))}
    </div>
  </div>
);
