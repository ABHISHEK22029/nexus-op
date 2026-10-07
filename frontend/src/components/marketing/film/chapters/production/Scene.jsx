import React from 'react';
import { Factory, PackageMinus, PackagePlus, Recycle, Scale, ShoppingBag, ArrowDown } from 'lucide-react';
import { Show, Typed, Cursor, Count } from '../../../flow/kit';
import { PRODUCT, QTY, MATERIAL, STOCK, YIELD, CUSTOMER, makeIds, FILM_DATE } from '../../../data/transaction';
import { rupee } from '../../shell/format';

/* 12 — ProductionOrder.jsx: the header (from the customer order), the
   three entry sections — Raw Material Consumed with its From stock picker
   (f25bf1a), Finished Output, Scrap & Remnant — and Yield & Material
   Balance. 282.6 kg out of 300 kg in is 94.2%; net material cost is
   300 kg × ₹260 less ₹960 of scrap, ₹77,040, or ₹642 a bracket. */
export const Icon = Factory;

const IDS = makeIds(FILM_DATE);
const ISSUED = YIELD.issued;                 // 300 kg
const OUT_KG = 282.6;
const SCRAP_VALUE = 960;
const GROSS = ISSUED * 260;
const NET = GROSS - SCRAP_VALUE;

const Metric = ({ l, v, sub, tone }) => (
  <div className="fm-metric"><small>{l}</small><b className={tone ? `is-${tone}` : ''}>{v}</b>{sub && <em>{sub}</em>}</div>
);

export default function Scene({ t, layout }) {
  const issued = t >= 5200, out = t >= 10200, scrap = t >= 13300, done = t >= 15500;
  return (
    <div className="fm-screen">
      <div className="fm-card fm-prod-h">
        <div>
          <span className="fm-mono-b fm-amber">{IDS.prod}</span>
          <b className="fm-prod-title">{PRODUCT.name}</b>
          <small className="fm-muted">Planned: {QTY} nos</small>
          <span className="fm-from-pill"><ShoppingBag size={12} /> From {IDS.co} · {CUSTOMER.name}</span>
        </div>
        <div className="fm-sh-actions">
          {['Planned', 'In Progress', 'Completed'].map((s) => (
            <span key={s} className={`fm-chip${(done ? 'Completed' : 'In Progress') === s ? ' is-on' : ''}`}>{s}</span>
          ))}
        </div>
      </div>

      {done ? (
        <div className="fm-card fl-enter">
          <b className="fm-card-h"><Scale size={15} /> Yield &amp; Material Balance</b>
          <div className="fm-metrics">
            <Metric l="Yield" v={<><Count to={YIELD.yieldPct} t={t} start={15700} dur={1200} fmt={(n) => n.toFixed(1)} />%</>} sub="finished ÷ input" tone="ok" />
            <Metric l="Recovered" v={`${YIELD.yieldPct}%`} sub="incl. reusable remnant" tone="ok" />
            <Metric l="Scrap" v="5.8%" sub={`${rupee(SCRAP_VALUE)} recovered`} />
            <Metric l="Unaccounted Loss" v="0 kg" sub="balanced ✓" />
            <Metric l="Input" v={`${ISSUED} kg`} />
            <Metric l="Output" v={`${OUT_KG} kg`} sub={`${QTY} pcs`} />
            <Metric l="Net Material Cost" v={rupee(NET)} sub={`gross ${rupee(GROSS)}`} />
            <Metric l="Cost / Unit" v={rupee(YIELD.costPerPiece)} tone="amber" />
          </div>
          <Show on={t >= 18200} className="fm-note-chip is-ok">{QTY} brackets added to stock — finished output goes in as it is recorded.</Show>
        </div>
      ) : (
        <div className="fm-prod-entry">
          {!(layout === 'narrow' && t >= 8000) && <div className="fm-card">
            <b className="fm-card-h"><PackageMinus size={15} className="fm-red" /> Raw Material Consumed</b>
            <div className="fm-entry">
              <label className="fm-pf-field is-wide"><small>From stock</small>
                <span className="fm-input is-app is-select">{t >= 1400 ? `${MATERIAL.name} — ${STOCK.after} kg on hand` : '— Not from stock (type it) —'}</span>
              </label>
              <label className="fm-pf-field"><small>Qty (kg) *</small><span className="fm-input is-app"><Typed text={String(ISSUED)} t={t} start={2600} cps={8} ph="100" /></span></label>
              <label className="fm-pf-field"><small>₹/kg</small><span className="fm-input is-app">{t >= 1400 ? '260' : ''}</span></label>
              <span className="fl-cursor-host is-inline"><span className={`fl-btn primary${t >= 4800 && t < 5050 ? ' is-pressed' : ''}`}>+</span><Cursor on={t >= 3900 && t < 5400} click={t >= 4800 && t < 5050} /></span>
            </div>
            {issued && (
              <Show on className="fm-line">
                <span>{MATERIAL.name} <em className="fm-good">from stock</em></span><span>{ISSUED} kg</span><span>₹260/kg</span>
              </Show>
            )}
            {issued && <Show on={t >= 5600} className="fm-move is-down"><ArrowDown size={12} /> Stock: {STOCK.after} → {STOCK.after - ISSUED} kg</Show>}
          </div>}
          <div className="fm-card">
            <b className="fm-card-h"><PackagePlus size={15} className="fm-green" /> Finished Output</b>
            <div className="fm-entry">
              <label className="fm-pf-field is-wide"><small>Product *</small><span className="fm-input is-app">{t >= 8400 ? PRODUCT.name : ''}</span></label>
              <label className="fm-pf-field"><small>Pcs</small><span className="fm-input is-app"><Typed text={String(QTY)} t={t} start={8800} cps={8} /></span></label>
              <label className="fm-pf-field"><small>Weight (kg)</small><span className="fm-input is-app"><Typed text={String(OUT_KG)} t={t} start={9300} cps={10} /></span></label>
            </div>
            {out && <Show on className="fm-line"><span>{PRODUCT.name}</span><span>{QTY} pcs</span><span>{OUT_KG} kg</span></Show>}
            <b className="fm-card-h fm-mt"><Recycle size={15} className="fm-amber" /> Scrap &amp; Remnant</b>
            <div className="fm-entry">
              <label className="fm-pf-field"><small>Type</small><span className="fm-input is-app is-select">Sellable scrap</span></label>
              <label className="fm-pf-field"><small>Qty (kg) *</small><span className="fm-input is-app"><Typed text={String(YIELD.scrap)} t={t} start={11200} cps={8} /></span></label>
              <label className="fm-pf-field"><small>Sale value ₹</small><span className="fm-input is-app"><Typed text={String(SCRAP_VALUE)} t={t} start={12000} cps={8} /></span></label>
            </div>
            {scrap && <Show on className="fm-line"><span className="fm-amber">Scrap</span><span>{YIELD.scrap} kg</span><span>{rupee(SCRAP_VALUE)}</span></Show>}
          </div>
        </div>
      )}
    </div>
  );
}
