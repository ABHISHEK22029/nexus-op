import React from 'react';
import { FileText, Mail, Printer, ArrowRightLeft, Check, X, ExternalLink } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import {
  CUSTOMER, PRODUCT, QTY, RATE, SUB, HALF_GST, ROUND_OFF, TOTAL, SELLER, makeIds, FILM_DATE,
} from '../../../data/transaction';
import { amountInWords } from '../../../../../lib/amountInWords';
import { ScreenHead, Tiles } from '../../shell/screen';
import { Paper, Meta, Lines, Totals } from '../../shell/paper';
import { rupee } from '../../shell/format';
import { QuotationForm } from '../enquiry/Scene';

/* 06 — SalesQuotations.jsx (the form, then the list's status select),
   SalesQuotationDoc.jsx (Email · Print · Convert to Order) and
   EmailDocumentModal (Gmail compose, written for you). */
export const Icon = FileText;

const IDS = makeIds(FILM_DATE);

function Doc({ t, status, convertAt }) {
  return (
    <div className="fm-screen">
      <div className="fm-doc-bar">
        <Pill tone={status === 'Accepted' ? 'ok' : status === 'Sent' ? 'info' : 'neutral'} dot>{status}</Pill>
        <span className="fm-sh-actions">
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn${t >= 11300 && t < 11550 ? ' is-pressed' : ''}`}><Mail size={13} /> Email</span>
            {convertAt == null && <Cursor on={t >= 10500 && t < 11900} click={t >= 11300 && t < 11550} />}
          </span>
          <span className="fl-btn"><Printer size={13} /> Print</span>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${convertAt != null && t >= convertAt && t < convertAt + 250 ? ' is-pressed' : ''}`}><ArrowRightLeft size={13} /> Convert to Order</span>
            {convertAt != null && <Cursor on={t >= convertAt - 900 && t < convertAt + 500} click={t >= convertAt && t < convertAt + 250} />}
          </span>
        </span>
      </div>
      <Paper title="QUOTATION" id={IDS.qt} stamp={status === 'Accepted' ? 'ACCEPTED' : null}>
        <Meta
          left={[['To', CUSTOMER.name], ['', `${CUSTOMER.city}, ${CUSTOMER.state}`]]}
          right={[['Quote date', '07 Oct 2026'], ['Valid until', '22 Oct 2026'], ['Ref', IDS.enq]]} />
        <Lines cols={[['#'], ['Description'], ['HSN'], ['Qty', 'r'], ['Rate', 'r'], ['Amount', 'r']]}
          rows={[['1', PRODUCT.name, PRODUCT.hsn, `${QTY} ${PRODUCT.unit}`, rupee(RATE), rupee(SUB)]]} />
        <Totals words={amountInWords(TOTAL)}
          rows={[['Sub-total', rupee(SUB)], ['CGST @ 9%', rupee(HALF_GST)], ['SGST @ 9%', rupee(HALF_GST)], ['Round off', `−₹${Math.abs(ROUND_OFF)}`], ['Total', rupee(TOTAL), true]]} />
        <p className="fm-paper-note">This is a quotation, not a tax invoice.</p>
      </Paper>
      {convertAt == null && t >= 11700 && t < 16000 && <Email t={t} />}
    </div>
  );
}

function Email({ t }) {
  return (
    <div className="fm-modal-wrap is-light">
      <div className="fm-modal is-wide fl-enter">
        <div className="fm-modal-top"><b className="fm-modal-h"><Mail size={16} /> Email the quotation</b><X size={15} className="fm-muted" /></div>
        <label className="fm-pf-field"><small>To</small><span className="fm-input is-app">{CUSTOMER.email}</span></label>
        <label className="fm-pf-field"><small>Subject</small><span className="fm-input is-app">Quotation {IDS.qt} from {SELLER.name}</span></label>
        <label className="fm-pf-field"><small>Message</small>
          <span className="fm-input is-app is-tall is-mono fm-mail-body">
            {`Dear ${CUSTOMER.contact},\n\nPlease find attached our quotation ${IDS.qt}.\n\nQuotation number : ${IDS.qt}\nAmount          : ${rupee(TOTAL)}\nValid until     : 22 Oct 2026\n\nLet us know if you'd like us to proceed, or if anything needs adjusting.`}
          </span>
        </label>
        <small className="fm-muted">Attach the PDF from this page in the compose window.</small>
        <div className="fm-sh-actions fm-right">
          <span className="fl-btn">Use my mail app</span>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 14800 && t < 15050 ? ' is-pressed' : ''}`}><ExternalLink size={13} /> Open Gmail</span>
            <Cursor on={t >= 13900 && t < 15400} click={t >= 14800 && t < 15050} />
          </span>
        </div>
      </div>
    </div>
  );
}

function List({ t }) {
  const accepted = t >= 19200;
  return (
    <div className="fm-screen">
      <ScreenHead icon={FileText} title="Quotations" sub="Quote your customers up front — then convert a won quote straight into an order." />
      <Tiles items={[['Quotations', 4], ['Quoted value', '₹6,41,200'], ['Open value', accepted ? '₹3,12,700' : '₹6,41,200', 'info'], ['Won', accepted ? 1 : 0, 'ok']]} />
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-q"><span>Quotation</span><span>Customer</span><span>Value</span><span>Status</span></div>
        <div className="fm-tr fm-tr-q is-new">
          <span className="fm-mono-b">{IDS.qt}</span><span>{CUSTOMER.name}</span><span className="fm-mono-b">{rupee(TOTAL)}</span>
          <span className="fl-cursor-host is-inline">
            <span className={`fm-input is-app is-select fm-status${accepted ? ' is-ok' : ''}`}>{accepted ? 'Accepted' : 'Sent'}</span>
            <Cursor on={t >= 18300 && t < 19600} click={t >= 18900 && t < 19150} />
          </span>
        </div>
        <div className="fm-tr fm-tr-q"><span className="fm-mono-b">QT-0006</span><span>Orbit Infra</span><span className="fm-mono-b">₹3,12,700</span><span><Pill tone="info">Sent</Pill></span></div>
      </div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'price') {
    return (
      <div className="fm-screen">
        <ScreenHead icon={FileText} title="Quotations" sub="Quote your customers up front — then convert a won quote straight into an order." />
        <QuotationForm t={t} rateFrom={1500} submitAt={6800} banner />
        <Show on={t >= 7100} className="fm-toast"><Check size={13} /> Quotation {IDS.qt} created</Show>
      </div>
    );
  }
  if (beat.key === 'doc') return <Doc t={t} status={t >= 15100 ? 'Sent' : 'Draft'} />;
  if (t < 21000) return <List t={t} />;
  return (
    <>
      <Doc t={t} status="Accepted" convertAt={23000} />
      <Show on={t >= 23300} className="fm-toast is-float"><Check size={13} /> Won! Created order {IDS.co}</Show>
    </>
  );
}
