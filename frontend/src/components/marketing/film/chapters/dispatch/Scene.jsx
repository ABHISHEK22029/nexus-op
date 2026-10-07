import React from 'react';
import { Truck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Show, Typed, Cursor, Pill } from '../../../flow/kit';
import { CUSTOMER, PRODUCT, QTY, SUB, TOTAL, makeIds, FILM_DATE } from '../../../data/transaction';
import { ScreenHead, Tiles } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 13 — DeliveryChallans.jsx (Prefill from order, Dispatch through,
   Vehicle No., LR / Docket No., Create Challan) and DeliveryChallanDoc's
   Rule 138 warning with its E-way Bill No. — now recorded right there
   (a145994). */
export const Icon = Truck;

const IDS = makeIds(FILM_DATE);
const EWAY = '351012345678';

function Form({ t }) {
  const made = t >= 6600;
  return (
    <div className="fm-screen fm-dc-screen">
      <ScreenHead icon={Truck} title="Delivery Challans"
        sub="The goods-out note to your customer — dispatch details and the value carried for the e-way bill." />
      <Tiles items={[['Challans', 9], ['Dispatched', 7, 'info'], ['Delivered', 1, 'ok'], ['E-way bill missing', made ? 1 : 0, made ? 'danger' : 'ok']]} />
      <div className="fm-card">
        <div className="fm-dc-form">
          <label className="fm-pf-field"><small>Prefill from order</small><span className="fm-input is-app is-select">{t >= 700 ? `${IDS.co} · ${CUSTOMER.name}` : '— Choose an order —'}</span></label>
          <label className="fm-pf-field"><small>Customer *</small><span className="fm-input is-app">{t >= 900 ? CUSTOMER.name : ''}</span></label>
          <label className="fm-pf-field"><small>Dispatch through</small><span className="fm-input is-app"><Typed text="VRL Logistics" t={t} start={1800} cps={18} ph="Transporter" /></span></label>
          <label className="fm-pf-field"><small>Vehicle No.</small><span className="fm-input is-app"><Typed text="TS 09 UC 7712" t={t} start={2700} cps={16} ph="GJ06AB1234" /></span></label>
          <label className="fm-pf-field"><small>LR / Docket No.</small><span className="fm-input is-app"><Typed text="VRL-55021" t={t} start={3700} cps={14} /></span></label>
        </div>
        <small className="fm-sec-label">Items dispatched</small>
        <div className="fm-table">
          <div className="fm-tr is-head fm-tr-dc"><span>Description *</span><span>Qty</span><span>Unit</span><span>Value ₹</span></div>
          {t >= 900 && <div className="fm-tr fm-tr-dc"><span><b>{PRODUCT.name}</b></span><span>{QTY}</span><span>{PRODUCT.unit}</span><span className="fm-mono-b">{rupee(SUB)}</span></div>}
        </div>
        <span className="fl-cursor-host is-inline fm-right-self">
          <span className={`fl-btn primary${t >= 6200 && t < 6450 ? ' is-pressed' : ''}`}>{made ? <><CheckCircle2 size={13} /> {IDS.dc}</> : 'Create Challan'}</span>
          <Cursor on={t >= 5300 && t < 6800} click={t >= 6200 && t < 6450} />
        </span>
      </div>
    </div>
  );
}

function Doc({ t }) {
  const recorded = t >= 13200;
  return (
    <div className="fm-screen">
      <div className="fm-doc-bar">
        <span className="fm-stack"><Pill tone="info" dot>Dispatched</Pill>{recorded && <Pill tone="ok">Order delivered</Pill>}</span>
        <span className="fm-mono-b">{IDS.dc}</span>
      </div>
      {!recorded && (
        <div className="fm-warn-box fl-enter-soft">
          <b><AlertTriangle size={15} /> E-way bill required — and not recorded</b>
          <span>This consignment is {rupee(TOTAL)}, above the ₹50,000 threshold in Rule 138. Generate the e-way bill on the government portal and record the number here before the vehicle leaves.</span>
        </div>
      )}
      <div className="fm-paper fm-dc-doc">
        <div className="fm-paper-top">
          <span className="fm-paper-logo">PF</span>
          <span className="fm-paper-co"><b>Precision Fab Works</b><small>Delivery challan — goods out</small></span>
          <span className="fm-paper-title"><b>DELIVERY CHALLAN</b><small>{IDS.dc}</small></span>
        </div>
        <div className="fm-dc-meta">
          {[['Dispatch through', 'VRL Logistics'], ['Vehicle No.', 'TS 09 UC 7712'], ['LR / Docket', 'VRL-55021'], ['Place of supply', '36 — Telangana']].map(([k, v]) => (
            <span key={k}><small>{k}</small><b>{v}</b></span>
          ))}
          <span className={`fl-cursor-host${recorded ? '' : ' is-warn'}`}>
            <small>E-way Bill No.</small>
            <b className="fm-mono-b">{t >= 10600 ? <Typed text={EWAY} t={t} start={10600} cps={10} /> : <em className="fm-add-link">required — add</em>}</b>
            <Cursor on={t >= 9400 && t < 10700} click={t >= 10200 && t < 10450} />
          </span>
        </div>
        <div className="fm-paper-lines" style={{ '--n': 5 }}>
          <div className="fm-pl is-head"><span>#</span><span>Description</span><span>Unit</span><span className="r">Qty</span><span className="r">Value</span></div>
          <div className="fm-pl"><span>1</span><span>{PRODUCT.name}</span><span>{PRODUCT.unit}</span><span className="r">{QTY}</span><span className="r">{rupee(SUB)}</span></div>
        </div>
        <p className="fm-paper-note">To {CUSTOMER.name}, {CUSTOMER.city} · against {IDS.co}</p>
      </div>
      {recorded && <Show on className="fm-toast"><CheckCircle2 size={13} /> E-way bill recorded · {IDS.co} delivered</Show>}
    </div>
  );
}

export default function Scene({ t, beat }) {
  return beat.key === 'challan' ? <Form t={t} /> : <Doc t={t} />;
}
