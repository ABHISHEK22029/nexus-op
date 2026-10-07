import React from 'react';
import { ClipboardCheck, Hammer, FileText, Files, Layers, AlertTriangle } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import {
  CUSTOMER, PRODUCT, QTY, RATE, SUB, TOTAL, MATERIAL, STOCK, makeIds, FILM_DATE,
} from '../../../data/transaction';
import { ScreenHead, Tiles } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 07 — CustomerOrders.jsx (the order, its lines with Make / Raise
   Quotation, Create Invoice) and OrderReadiness.jsx ("Can build X of Y —
   blocked by …", Details, See what to order). 57 is what orderReadiness
   computes: 143 kg on hand ÷ 2.5 kg a bracket, rounded down. */
export const Icon = ClipboardCheck;

const IDS = makeIds(FILM_DATE);
const NEED = QTY * MATERIAL.perPiece;           // 300 kg for this order

export default function Scene({ t }) {
  const ready = t >= 8000;
  return (
    <div className="fm-screen">
      <ScreenHead icon={ClipboardCheck} title="Customer Orders" sub="Log the PO your customer places with you, and drive procurement from it." />
      <Tiles items={[['Orders', 3], ['Order value', '₹5,84,900'], ['Open', 2, 'info'], ['In procurement', 0, 'amber'], ['No line items', 0]]} />
      <div className="fm-order fm-card">
        <div className="fm-order-h">
          <span className="fm-mono-b">{IDS.co}</span>
          <span><b>{CUSTOMER.name}</b><small className="fm-muted"> · their PO ACME/PO/4471 · from {IDS.qt}</small></span>
          <span className="fm-mono-b">{rupee(TOTAL)}</span>
          <Pill tone="info" dot>Open</Pill>
        </div>
        <div className="fm-table">
          <div className="fm-tr is-head fm-tr-o"><span>Description</span><span>Qty</span><span>Unit rate ₹</span><span>Total ₹</span><span /></div>
          <div className="fm-tr fm-tr-o">
            <span><b>{PRODUCT.name}</b></span><span>{QTY} {PRODUCT.unit}</span><span>{rupee(RATE)}</span><span>{rupee(SUB)}</span>
            <span className="fm-sh-actions"><span className="fl-btn"><Hammer size={13} /> Make</span><span className="fl-btn"><FileText size={13} /> Raise Quotation</span></span>
          </div>
        </div>
        {ready && (
          <div className="fm-readiness fl-enter">
            <div className="fm-readiness-h">
              <AlertTriangle size={16} />
              <b>Can build <em>{STOCK.buildable} of {QTY}</em> — blocked by <em>{MATERIAL.name}</em></b>
              <span className="fm-muted">Details</span>
            </div>
            <div className="fm-table">
              <div className="fm-tr is-head fm-tr-r"><span>Material</span><span>Per unit</span><span>Needed</span><span>In stock</span><span>Supports</span></div>
              <Show on={t >= 9200} className="fm-tr fm-tr-r">
                <span><b>{MATERIAL.name}</b></span><span>{MATERIAL.perPiece} kg</span><span>{NEED} kg</span><span>{STOCK.onHand} kg</span>
                <span className="fm-bad">{STOCK.buildable}</span>
              </Show>
            </div>
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn primary${t >= 17600 && t < 17850 ? ' is-pressed' : ''}`}><Layers size={13} /> See what to order</span>
              <Cursor on={t >= 16700 && t < 18300} click={t >= 17600 && t < 17850} />
            </span>
          </div>
        )}
        <div className="fm-order-foot"><span className="fl-btn"><Files size={13} /> Create Invoice</span></div>
      </div>
    </div>
  );
}
