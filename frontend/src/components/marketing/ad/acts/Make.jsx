import React from 'react';
import { PackageMinus, PackagePlus, Scale, ArrowDown, CheckCircle2, Factory } from 'lucide-react';
import { Show, Count } from '../../flow/kit';
import { IDS } from '../../flow/story';
import { PRODUCT, QTY, MATERIAL, STOCK, YIELD } from '../../data/transaction';
import { rupee } from '../../film/shell/format';
import { Lines, Thread } from '../parts';
import { box } from '../geo';

/* ══════════════════════════════════════════════════════════════════════
   Act 4 — production. (36.5–41 s; times here are from 36.5 s)

   ProductionOrder.jsx as it is: the order's status moving Planned → In
   Progress → Completed, Raw Material Consumed taken from stock (the stock
   the last act refilled goes down by what is issued), Finished Output,
   and Yield & Material Balance — what went in, what came out, what is
   scrap, and what each bracket's material cost. No invented machine
   stages: the progress is the order's own status.
   ══════════════════════════════════════════════════════════════════════ */

const OUT_KG = 282.6;
const SCRAP_VALUE = 960;
const SCRAP_PCT = +(100 - YIELD.yieldPct).toFixed(1);

const L = {
  wide: {
    head: [120, 150, 1040, 96], material: [120, 270, 320, 250], balance: [470, 270, 400, 250], output: [900, 270, 260, 250],
    done: [120, 548, 1040, 50],
    thread: 'M 280 520 C 280 534, 300 536, 330 536 L 1000 536 C 1020 536, 1030 532, 1030 520',
  },
  narrow: {
    head: [16, 112, 388, 120], material: [16, 446, 190, 150], balance: [16, 244, 388, 190], output: [214, 446, 190, 150],
    done: [16, 610, 388, 46],
    thread: null,
  },
};

const STEPS = ['Planned', 'In Progress', 'Completed'];

export default function Make({ t, layout }) {
  const l = L[layout];
  const done = t >= 3500;
  const step = done ? 2 : t >= 300 ? 1 : 0;
  return (
    <div className={`ad-act ad-make is-${layout}`}>
      <div className="ad-mk-head ad-card" style={box(l.head)}>
        <span className="ad-mk-id">
          <b className="fm-mono-b ad-amber"><Factory size={14} /> {IDS.prod}</b>
          <b className="ad-mk-name">{PRODUCT.name}</b>
          <small className="fm-muted">Planned: {QTY} {PRODUCT.unit} · from {IDS.co}</small>
        </span>
        <span className="ad-steps" style={{ '--p': step / 2 }}>
          {STEPS.map((s, i) => <span key={s} className={i <= step ? 'is-on' : ''}>{s}</span>)}
          <i className="ad-steps-bar" />
        </span>
      </div>

      <div className={`ad-card ad-mk-panel${t >= 200 ? ' is-on' : ''}`} style={box(l.material)}>
        <b className="fm-card-h"><PackageMinus size={15} className="fm-red" /> Raw Material Consumed</b>
        <Show on={t >= 400} className="ad-mk-line"><span>{MATERIAL.name} <em className="fm-good">from stock</em></span><b>{YIELD.issued} kg</b></Show>
        <Show on={t >= 800} className="fm-move is-down"><ArrowDown size={12} /> Stock: {STOCK.after} → {STOCK.after - YIELD.issued} kg</Show>
      </div>

      <div className={`ad-card ad-mk-panel${t >= 450 ? ' is-on' : ''}`} style={box(l.balance)}>
        <b className="fm-card-h"><Scale size={15} /> Yield &amp; Material Balance</b>
        <div className={`ad-bal${t >= 1200 ? ' is-on' : ''}`} style={{ '--out': YIELD.yieldPct / 100 }}>
          <span className="ad-bal-out" /><span className="ad-bal-scrap" />
        </div>
        <div className="ad-bal-labels">
          <span><b>{OUT_KG} kg</b> finished</span>
          <span><b>{YIELD.scrap} kg</b> scrap · {rupee(SCRAP_VALUE)} back</span>
        </div>
        <div className="ad-bal-big">
          <span><small>Yield</small><b className="is-ok">{t >= 1600 ? <Count to={YIELD.yieldPct} t={t} start={1600} dur={1000} fmt={(n) => n.toFixed(1)} /> : '0.0'}%</b></span>
          <span><small>Scrap</small><b>{SCRAP_PCT}%</b></span>
          <span><small>Cost / unit</small><b className="ad-amber">{t >= 2600 ? rupee(YIELD.costPerPiece) : '—'}</b></span>
        </div>
      </div>

      <div className={`ad-card ad-mk-panel${t >= 700 ? ' is-on' : ''}`} style={box(l.output)}>
        <b className="fm-card-h"><PackagePlus size={15} className="fm-green" /> Finished Output</b>
        <span className="ad-mk-count">{t >= 1000 ? <Count to={QTY} t={t} start={1000} dur={800} /> : 0}<small> pcs</small></span>
        <small className="fm-muted">{PRODUCT.name} · {OUT_KG} kg</small>
        <Show on={t >= 1900} className="fm-note-chip is-ok">+{QTY} to stock</Show>
      </div>

      {l.thread && <Lines layout={layout}><Thread d={l.thread} on={t >= 500} dur={1600} /></Lines>}

      <Show on={done} className="ad-done" style={box(l.done)}>
        <CheckCircle2 size={18} /> Completed — {QTY} brackets made from {YIELD.issued} kg, ready to dispatch
      </Show>
    </div>
  );
}
