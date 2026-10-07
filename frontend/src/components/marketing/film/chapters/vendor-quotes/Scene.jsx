import React from 'react';
import {
  Upload, FileSpreadsheet, FileText, FileType, CheckCircle2, AlertTriangle, ShieldCheck, Scale, ShoppingCart, Eye, Pencil, X,
} from 'lucide-react';
import { Show, Cursor } from '../../../flow/kit';
import { VENDORS, MATERIAL, STOCK, makeIds, FILM_DATE } from '../../../data/transaction';
import { ScreenHead } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 09 — VendorQuotations.jsx: the upload, the list with Read / Check it /
   Checked, the Review panel and "Save as checked", "Side by side" with
   "Lowest like for like", and "Raise PO" — which now orders from the quote
   (9f66da6). */
export const Icon = Scale;

const IDS = makeIds(FILM_DATE);
const KIND = { excel: FileSpreadsheet, pdf: FileText, word: FileType };
const QTY = STOCK.short;
const amount = (v) => v.rate * QTY;
const high = Math.max(...VENDORS.map(amount));
const best = VENDORS.find((v) => v.best);

function Status({ v, checked }) {
  if (v.kind === 'pdf' && !checked) return <span className="fm-vq-st is-warn"><AlertTriangle size={13} /> Check it</span>;
  if (v.kind === 'pdf') return <span className="fm-vq-st is-ok"><ShieldCheck size={13} /> Checked</span>;
  return <span className="fm-vq-st is-ok"><CheckCircle2 size={13} /> Read</span>;
}

function List({ t, checked, picked }) {
  return (
    <div className="fm-table">
      <div className="fm-tr is-head fm-tr-vq"><span /><span>Vendor</span><span>File</span><span>Against</span><span>Items</span><span>Total</span><span>Read</span><span /></div>
      {VENDORS.map((v, i) => {
        const K = KIND[v.kind];
        return (
          <Show key={v.name} on={t >= 1200 + i * 900} className="fm-tr fm-tr-vq">
            <span className={`fm-box${picked ? ' is-on' : ''}`}>{picked ? '✓' : ''}</span>
            <span><b>{v.name}</b></span>
            <span className="fm-file"><K size={14} /> {v.file}</span>
            <span className="fm-muted">For {IDS.co}</span>
            <span>1</span>
            <span className="fm-mono-b">{rupee(amount(v) * 1.18)}</span>
            <span><Status v={v} checked={checked} /></span>
            <span className="fm-icons"><Pencil size={14} /><Eye size={14} /></span>
          </Show>
        );
      })}
    </div>
  );
}

function Review({ t }) {
  return (
    <div className="fm-review fm-card fl-enter">
      <div className="fm-modal-top"><b>Review: deccan-metals.pdf</b><X size={15} className="fm-muted" /></div>
      <div className="fm-row2">
        <label className="fm-pf-field"><small>Vendor</small><span className="fm-input is-app">Deccan Metals</span></label>
        <label className="fm-pf-field"><small>Vendor's quote no.</small><span className="fm-input is-app">DM/Q/2231</span></label>
      </div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-rv"><span>Item</span><span>HSN</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span></div>
        <div className="fm-tr fm-tr-rv is-warnrow"><span>{MATERIAL.name}</span><span>7219</span><span>{QTY}</span><span>kg</span><span>260</span><span>{rupee(260 * QTY)}</span></div>
      </div>
      <span className="fl-cursor-host is-inline fm-right-self">
        <span className={`fl-btn primary${t >= 13600 && t < 13850 ? ' is-pressed' : ''}`}><ShieldCheck size={13} /> Save as checked</span>
        <Cursor on={t >= 12700 && t < 14200} click={t >= 13600 && t < 13850} />
      </span>
    </div>
  );
}

function Compare({ t, raiseAt }) {
  const raised = raiseAt != null && t >= raiseAt + 300;
  return (
    <div className="fm-cmp fm-card fl-enter">
      <div className="fm-modal-top"><b className="fm-cmp-h">Side by side</b><span className="fm-muted">CSV · Print</span></div>
      <Show on={t >= 16300} className="fm-cmp-best">
        <b>{best.name}</b> is lowest like for like at <b>{rupee(amount(best))}</b> before tax — {rupee(high - amount(best))} less than the highest, across the 1 item every vendor quoted.
      </Show>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-cmp"><span>Vendor</span><span>Like for like</span><span>Their stated total</span><span>Items quoted</span><span /></div>
        {VENDORS.map((v) => (
          <div key={v.name} className={`fm-tr fm-tr-cmp${v.best ? ' is-best' : ''}`}>
            <span><b>{v.name}</b>{v.best && <em className="fm-lowest">Lowest like for like</em>}</span>
            <span className="fm-mono-b">{rupee(amount(v))}</span>
            <span className="fm-mono-b fm-muted">{rupee(amount(v) * 1.18)}</span>
            <span>1</span>
            <span className="fm-right-cell">
              {v.best && raised ? <span className="fm-raised"><CheckCircle2 size={13} /> {IDS.po}</span> : (
                <span className="fl-cursor-host is-inline">
                  <span className={`fl-btn${v.best ? ' primary' : ''}${v.best && raiseAt != null && t >= raiseAt && t < raiseAt + 250 ? ' is-pressed' : ''}`}><ShoppingCart size={12} /> Raise PO</span>
                  {v.best && raiseAt != null && <Cursor on={t >= raiseAt - 900 && t < raiseAt + 500} click={t >= raiseAt && t < raiseAt + 250} />}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-item"><span>Item</span>{VENDORS.map((v) => <span key={v.name}>{v.name.split(' ')[0]}</span>)}<span>Spread</span></div>
        <div className="fm-tr fm-tr-item">
          <span>{MATERIAL.name} · {QTY} kg</span>
          {VENDORS.map((v) => <span key={v.name} className={v.best ? 'fm-good' : ''}>₹{v.rate}</span>)}
          <span>{(((283 - 260) / 260) * 100).toFixed(1)}%</span>
        </div>
      </div>
      {raised && <Show on className="fm-toast"><CheckCircle2 size={13} /> {IDS.po} raised to {best.name} — it needs sign-off</Show>}
    </div>
  );
}

export default function Scene({ t, beat }) {
  const checked = t >= 13800;
  const comparing = beat.key === 'compare' || beat.key === 'raise';
  return (
    <div className="fm-screen">
      <ScreenHead icon={Scale} title="Vendor quotations"
        sub="Upload the file each vendor sent — Excel, CSV, PDF or Word. The items are read out of it, you can check and correct them, and compare vendors side by side."
        right={comparing ? null : (
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 700 && t < 950 ? ' is-pressed' : ''}`}><Upload size={13} /> Upload quotation</span>
            <Cursor on={t >= 100 && t < 1300} click={t >= 700 && t < 950} />
          </span>
        )} />
      {!comparing ? (
        <>
          <div className="fm-drop"><Upload size={18} /> Drop the files here — or press Upload quotation</div>
          <List t={t} checked={checked} />
          {beat.key === 'review' && t < 14600 && <Review t={t} />}
        </>
      ) : (
        <Compare t={t} raiseAt={beat.key === 'raise' ? 25200 : null} />
      )}
    </div>
  );
}
