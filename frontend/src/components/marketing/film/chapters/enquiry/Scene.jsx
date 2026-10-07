import React from 'react';
import { Inbox, ArrowRight, Check, X, MessageSquareQuote, FileText, Phone, Mail } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import { CUSTOMER, PRODUCT, QTY, makeIds, FILM_DATE } from '../../../data/transaction';
import { ScreenHead, Tiles } from '../../shell/screen';

/* 05 — the enquiry's dialog in Enquiries.jsx ("What they want", Convert to
   quotation / Mark won / Ignore), then SalesQuotations.jsx opening its New
   Quotation form from the enquiry, as it now does. */
export const Icon = MessageSquareQuote;

const IDS = makeIds(FILM_DATE);
const NOTE = 'Brushed finish, delivery in 4 weeks. Drawing to follow.';

export function QuotationForm({ t, rateFrom = null, banner = true, submitAt = null }) {
  const rate = rateFrom != null && t >= rateFrom ? Math.min(2320, Math.round(((t - rateFrom) / 700) * 2320 / 10) * 10) : null;
  const priced = rate === 2320;
  return (
    <div className="fm-qform fm-card">
      {banner && (
        <div className="fm-from-enq">
          <MessageSquareQuote size={16} />
          <div>
            <b>From enquiry {IDS.enq} · {CUSTOMER.name}</b> — their lines are below; price them.
            <i>“{NOTE}”</i>
          </div>
        </div>
      )}
      <div className="fm-qhead">
        <label className="fm-pf-field"><small>Customer *</small><span className="fm-input is-app is-select">{CUSTOMER.name}</span></label>
        <label className="fm-pf-field"><small>Quote Date</small><span className="fm-input is-app">07 Oct 2026</span></label>
        <label className="fm-pf-field"><small>Valid Until</small><span className="fm-input is-app">22 Oct 2026</span></label>
        <label className="fm-pf-field"><small>GST %</small><span className="fm-input is-app">18</span></label>
      </div>
      <small className="fm-sec-label">Line items</small>
      <div className="fm-qline">
        <label className="fm-pf-field"><small>SKU</small><span className="fm-input is-app is-select">{PRODUCT.name}</span></label>
        <label className="fm-pf-field"><small>Description *</small><span className="fm-input is-app">{PRODUCT.name}</span></label>
        <label className="fm-pf-field"><small>Unit</small><span className="fm-input is-app">{PRODUCT.unit}</span></label>
        <label className="fm-pf-field"><small>Qty</small><span className="fm-input is-app">{QTY}</span></label>
        <label className="fm-pf-field"><small>Rate ₹</small><span className={`fm-input is-app${rateFrom != null && !priced && t >= rateFrom ? ' is-focus' : ''}`}>{rate ?? ''}</span></label>
        <label className="fm-pf-field"><small>Total ₹</small><span className="fm-input is-app is-mono">{rate ? (QTY * rate).toLocaleString('en-IN') : '0'}</span></label>
      </div>
      <div className="fm-qfoot">
        <span className="fm-muted">Sub-total: <b>₹{rate ? (QTY * rate).toLocaleString('en-IN') : 0}</b> · Net: <b>₹{rate ? Math.round(QTY * rate * 1.18).toLocaleString('en-IN') : 0}</b></span>
        {submitAt != null && (
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= submitAt && t < submitAt + 250 ? ' is-pressed' : ''}`}>Create Quotation</span>
            <Cursor on={t >= submitAt - 900 && t < submitAt + 600} click={t >= submitAt && t < submitAt + 250} />
          </span>
        )}
      </div>
    </div>
  );
}

function Detail({ t }) {
  return (
    <div className="fm-modal-wrap is-light">
      <div className="fm-modal is-wide fl-enter">
        <div className="fm-modal-top">
          <b className="fm-modal-h"><Inbox size={16} /> Enquiry {IDS.enq}</b>
          <X size={15} className="fm-muted" />
        </div>
        <div className="fm-enq-who">
          <b>{CUSTOMER.name}</b>
          <span className="fm-muted"><Phone size={12} /> 98480 12345 · <Mail size={12} /> {CUSTOMER.email} · {CUSTOMER.contact}</span>
        </div>
        <small className="fm-sec-label">What they want</small>
        <div className="fm-table">
          <div className="fm-tr is-head fm-tr-3"><span>Item</span><span>Qty</span><span>Unit</span></div>
          <div className="fm-tr fm-tr-3"><span><b>{PRODUCT.name}</b></span><span>{QTY}</span><span>{PRODUCT.unit}</span></div>
        </div>
        <p className="fm-enq-note">“{NOTE}”</p>
        <div className="fm-sh-actions">
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 6400 && t < 6650 ? ' is-pressed' : ''}`}><ArrowRight size={13} /> Convert to quotation</span>
            <Cursor on={t >= 5400 && t < 7000} click={t >= 6400 && t < 6650} />
          </span>
          <span className="fl-btn"><Check size={13} /> Mark won</span>
          <span className="fl-btn">Ignore</span>
        </div>
      </div>
    </div>
  );
}

function List({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Inbox} title="Enquiries"
        sub="People who found your catalogue and asked for something. Converting one adds them as a customer." />
      <Tiles items={[['Total', 3], ['New', t >= 1500 ? 0 : 1, 'info'], ['Quoted', 2, 'violet'], ['Won', 0, 'ok']]} />
      <div className="fm-rows">
        <div className={`fm-row${t < 1500 ? ' is-new' : ''}`}>
          <span className="fl-cursor-host is-inline"><Pill tone="info">{t >= 1500 ? 'Read' : 'New'}</Pill><Cursor on={t >= 400 && t < 1700} click={t >= 1100 && t < 1350} /></span>
          <span className="fm-row-main"><b>{CUSTOMER.name} <span>· {CUSTOMER.contact}</span></b><small>{IDS.enq} · 1 item · {NOTE}</small></span>
          <span className="fm-row-when">just now</span>
        </div>
        <div className="fm-row"><Pill>Quoted</Pill><span className="fm-row-main"><b>Orbit Infra <span>· Suresh</span></b><small>ENQ-0041 · 2 items · Base plates for the yard canopy</small></span><span className="fm-row-when">2 days ago</span></div>
      </div>
      {t >= 1400 && <Detail t={t} />}
    </div>
  );
}

function Converted({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={FileText} title="Quotations" sub="Quote your customers up front — then convert a won quote straight into an order." />
      <Show on={t >= 7200} className="fm-toast"><Check size={13} /> {CUSTOMER.name} added as a customer</Show>
      <QuotationForm t={t} />
    </div>
  );
}

export default function Scene({ t, beat }) {
  return beat.key === 'open' ? <List t={t} /> : <Converted t={t} />;
}
