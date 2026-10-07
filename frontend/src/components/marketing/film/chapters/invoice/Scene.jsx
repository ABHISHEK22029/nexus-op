import React from 'react';
import { ReceiptText, CheckCircle2, Wallet } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import {
  CUSTOMER, PRODUCT, QTY, RATE, SUB, HALF_GST, ROUND_OFF, TOTAL, SELLER, makeIds, FILM_DATE,
} from '../../../data/transaction';
import { amountInWords } from '../../../../../lib/amountInWords';
import { ScreenHead } from '../../shell/screen';
import { rupee } from '../../shell/format';
import { Paper, Meta, Lines, Totals } from '../../shell/paper';

/* 14 — SalesInvoiceBuilder (Invoice number with "Next in your series —
   type over it", place of supply deciding CGST + SGST, E-way bill no.,
   Create invoice …, saved as a draft) and SalesInvoiceDoc (Tax Invoice,
   Bank Details for Payment, Record payment with Bank / Cash / UPI /
   Cheque). */
export const Icon = ReceiptText;

const IDS = makeIds(FILM_DATE);
const EWAY = '351012345678';

const F = ({ label, children, hint, wide }) => (
  <label className={`fm-pf-field${wide ? ' is-wide' : ''}`}>
    <small>{label}</small><span className="fm-input is-app">{children}</span>{hint && <em className="fm-hint">{hint}</em>}
  </label>
);

function Build({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={ReceiptText} title="New tax invoice" sub={`Draft · Customer ${CUSTOMER.name} · Order ${IDS.co}`} />
      <div className="fm-inv-build">
        <div className="fm-card fm-inv-form">
          <F label="Invoice number" hint="Next in your series — type over it to use any number"><b className="fm-mono-b">{IDS.inv}</b></F>
          <F label="Invoice date">09 Nov 2026</F>
          <F label="Due date">09 Dec 2026</F>
          <F label="Customer" wide>{CUSTOMER.name}</F>
          <F label="Place of supply" hint="Where the goods go — decides CGST + SGST or IGST">36 — Telangana</F>
          <F label="GST type">Intra-state (CGST + SGST)</F>
          <F label="GST rate %">18</F>
          <F label="E-way bill no.">{EWAY}</F>
          <small className="fm-sec-label fm-span">Line items</small>
          <div className="fm-table fm-span">
            <div className="fm-tr is-head fm-tr-il"><span>Description</span><span>HSN / SAC</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
            <div className="fm-tr fm-tr-il"><span><b>{PRODUCT.name}</b></span><span>{PRODUCT.hsn}</span><span>{QTY}</span><span>{rupee(RATE)}</span><span className="fm-mono-b">{rupee(SUB)}</span></div>
          </div>
        </div>
        <div className="fm-card fm-bill-sum">
          <b className="fm-card-h">Invoice summary</b>
          <p><span>Sub-total</span><b>{rupee(SUB)}</b></p>
          <p><span>CGST @ 9%</span><b>{rupee(HALF_GST)}</b></p>
          <p><span>SGST @ 9%</span><b>{rupee(HALF_GST)}</b></p>
          <p><span>Round off ₹</span><b>−₹{Math.abs(ROUND_OFF)}</b></p>
          <p className="is-strong"><span>Invoice total</span><b>{rupee(TOTAL)}</b></p>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary is-wide${t >= 8300 && t < 8550 ? ' is-pressed' : ''}`}>Create invoice {IDS.inv}</span>
            <Cursor on={t >= 7300 && t < 8800} click={t >= 8300 && t < 8550} />
          </span>
          <small className="fm-muted fm-center">It is saved as a draft — everything stays editable until you mark it sent.</small>
        </div>
      </div>
    </div>
  );
}

function Doc({ t, paying }) {
  const paid = paying && t >= 24200;
  return (
    <div className="fm-screen">
      <div className="fm-doc-bar">
        <span className="fm-stack"><Pill tone={paid ? 'ok' : 'info'} dot>{paid ? 'Paid' : 'Sent'}</Pill></span>
        <span className="fm-sh-actions"><span className="fl-btn">PDF</span><span className="fl-btn">Email</span><span className="fl-btn">Print</span></span>
      </div>
      <div className={`fm-inv-wrap${paying ? ' is-paying' : ''}`}>
        <Paper title="TAX INVOICE" id={IDS.inv} stamp={paid ? 'PAID' : null}>
          <Meta left={[['Bill to', CUSTOMER.name], ['', `${CUSTOMER.city}, ${CUSTOMER.state}`], ['Place of Supply', '36 — Telangana']]}
            right={[['Date', '09 Nov 2026'], ['Due', '09 Dec 2026'], ['Order Ref', IDS.co], ['E-Way Bill', EWAY]]} />
          <Lines cols={[['#'], ['Description'], ['HSN'], ['Qty', 'r'], ['Rate', 'r'], ['Amount', 'r']]}
            rows={[['1', PRODUCT.name, PRODUCT.hsn, `${QTY} ${PRODUCT.unit}`, rupee(RATE), rupee(SUB)]]} />
          <Totals words={amountInWords(TOTAL)}
            rows={[['Sub-total', rupee(SUB)], ['CGST @ 9%', rupee(HALF_GST)], ['SGST @ 9%', rupee(HALF_GST)], ['Round off', `−₹${Math.abs(ROUND_OFF)}`], ['Invoice total', rupee(TOTAL), true]]} />
          <div className="fm-bank">
            <b>Bank Details for Payment</b>
            <span>{SELLER.name} Pvt. Ltd. · HDFC Bank · Account No. 5020 0043 1187 22 · IFSC HDFC0001234 · UPI precisionfab@hdfcbank</span>
          </div>
        </Paper>
        {paying && (
          <div className="fm-card fm-pay-card fl-enter">
            <b className="fm-card-h"><Wallet size={15} /> Record payment</b>
            <label className="fm-pf-field"><small>Amount</small><span className="fm-input is-app">{TOTAL}</span></label>
            <div className="fm-modes">{['Bank', 'Cash', 'UPI', 'Cheque'].map((m) => <span key={m} className={`fm-chip${m === 'Bank' ? ' is-on' : ''}`}>{m}</span>)}</div>
            <label className="fm-pf-field"><small>Reference</small><span className="fm-input is-app">NEFT ACME-0911</span></label>
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn primary is-wide${t >= 23800 && t < 24050 ? ' is-pressed' : ''}`}>{paid ? <><CheckCircle2 size={13} /> Paid in full</> : 'Record payment'}</span>
              <Cursor on={t >= 22800 && t < 24300} click={t >= 23800 && t < 24050} />
            </span>
            {paid && <Show on className="fm-toast"><CheckCircle2 size={13} /> Payment recorded — Paid</Show>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'build') return <Build t={t} />;
  return <Doc t={t} paying={beat.key === 'paid'} />;
}
