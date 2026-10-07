import React from 'react';
import { Building2, ArrowRight, Check, AlertTriangle, Layers } from 'lucide-react';
import { Show, Typed, Cursor } from '../../../flow/kit';
import { SELLER } from '../../../data/transaction';
import { MoMark } from '../../shell/marks';
import { ScreenHead } from '../../shell/screen';

/* 01 — FirstRun.jsx, CompanyProfile.jsx and the setup checklist
   (SetupReadiness over /setup/readiness), with their own words. */
export const Icon = Building2;

const SIZES = ['Just me', '2–10', '11–50', '51–200', '200+'];

function FirstRun({ t }) {
  return (
    <div className="fm-firstrun">
      <div className="fm-fr-card">
        <MoMark size={44} />
        <b className="fm-fr-h">Set up your workspace</b>
        <span className="fm-fr-q">What is your business called?</span>
        <span className="fm-input is-app">
          {t >= 900 ? <Typed text={SELLER.name} t={t} start={900} cps={16} /> : <span className="fm-ph">Steelco Fabrication Pvt Ltd</span>}
        </span>
        <span className="fm-fr-q">How many people work there? <small>— optional</small></span>
        <span className="fl-cursor-host fm-fr-sizes">
          {SIZES.map((s) => <span key={s} className={`fm-fr-size${s === '11–50' && t >= 3700 ? ' is-on' : ''}`}>{s}</span>)}
          <span className="fm-fr-cur"><Cursor on={t >= 3000 && t < 4300} click={t >= 3600 && t < 3850} /></span>
        </span>
        <span className="fl-cursor-host">
          <span className={`fl-btn primary fm-fr-go${t >= 5600 && t < 5850 ? ' is-pressed' : ''}`}>Start using Maks Ops <ArrowRight size={14} /></span>
          <Cursor on={t >= 4700 && t < 6300} click={t >= 5600 && t < 5850} />
        </span>
        <span className="fm-fr-skip">Skip for now</span>
      </div>
    </div>
  );
}

const Field = ({ label, value, t, start, mono }) => (
  <label className="fm-pf-field">
    <small>{label}</small>
    <span className={`fm-input is-app${mono ? ' is-mono' : ''}`}>
      {start == null || t >= start ? (start == null ? value : <Typed text={value} t={t} start={start} cps={26} />) : <span className="fm-ph">—</span>}
    </span>
  </label>
);

function Profile({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Building2} title="Company profile"
        sub="Your name, registration and bank details — printed on every quotation, order and invoice." />
      <div className="fm-pf-grid">
        <section className="fm-card">
          <b className="fm-card-h">Business identity</b>
          <Field label="Registered business name" value={`${SELLER.name} Pvt. Ltd.`} />
          <Field label="Trade name" value={SELLER.name} />
          <Field label="Registered address" value={`Plot 14, IDA Cherlapally, ${SELLER.city}`} />
        </section>
        <section className="fm-card">
          <b className="fm-card-h">Tax & registration</b>
          <Field label="GSTIN" value={SELLER.gstin} t={t} start={8300} mono />
          <Field label="State code" value={`${SELLER.stateCode} — ${SELLER.state}`} t={t} start={9500} />
          <Field label="PAN" value="AAMCK2569F" t={t} start={10100} mono />
        </section>
        <section className="fm-card">
          <b className="fm-card-h">Bank details</b>
          <Field label="Bank name" value="HDFC Bank" t={t} start={11000} />
          <Field label="Account number" value="5020 0043 1187 22" t={t} start={11700} mono />
          <Field label="IFSC code" value="HDFC0001234" t={t} start={12700} mono />
          <Field label="UPI ID" value="precisionfab@hdfcbank" t={t} start={13400} />
        </section>
      </div>
      <Show on={t >= 14600} className="fm-note-chip is-ok"><Check size={13} /> Ready for compliant invoicing</Show>
    </div>
  );
}

const CHECKS = [
  ['Your business name', 'set', true],
  ['Company GSTIN and bank details', 'complete', true],
  ['Products with a bill of materials', '0 of 6', false, 'Without a BOM the system cannot work out what a product needs, so an order for it produces no material demand at all.'],
  ['Materials with at least one vendor', '2 of 9', false, 'A shortfall with no vendor cannot become a purchase order — it is reported as skipped and stays short.'],
];

function Ready({ t }) {
  const at = t - 15500;
  const fixed = at >= 5600;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Layers} title="Material Requirements"
        sub="What every open order needs, against what's in stock." />
      <div className={`fm-ready${fixed ? ' is-ok' : ''}`}>
        <div className={`fm-ready-h${fixed ? ' is-ok' : ''}`}>
          {fixed ? <Check size={17} /> : <AlertTriangle size={17} />}
          <b>{fixed ? 'Everything the engine needs is in place.' : '2 things are missing before the system can tell you what to buy and build.'}</b>
        </div>
        {CHECKS.map(([label, have, done, cost], i) => {
          const ok = done || fixed;
          return (
            <Show key={label} on={at >= 300 + i * 450} className={`fm-ready-row${ok ? ' is-ok' : ''}`}>
              <span className="fm-ready-ico">{ok ? <Check size={14} /> : <AlertTriangle size={14} />}</span>
              <span className="fm-ready-txt">
                <b>{label}</b>
                <small>{ok ? (done ? have : 'done') : `${have} — ${cost}`}</small>
              </span>
              {!ok && <span className="fl-btn fm-fix">Fix this</span>}
            </Show>
          );
        })}
      </div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'firstrun') return <FirstRun t={t} />;
  if (beat.key === 'profile') return <Profile t={t} />;
  return <Ready t={t} />;
}
