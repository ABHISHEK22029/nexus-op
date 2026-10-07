import React from 'react';
import { Layers, ShoppingCart, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import { MATERIAL, STOCK, PO_VALUE } from '../../../data/transaction';
import { ScreenHead, Tiles } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 08 — MaterialRequirements.jsx (tiles, "Only what's short", the columns
   Required / In Stock / Shortfall / On Order / Net / Status / To Order /
   Buy From, the RFQ tag on the top of the shortfall's value) and the
   ShortfallPoModal preview behind "Raise purchase orders". */
export const Icon = Layers;

const BOLTS = { name: 'M8 × 25 SS304 bolts', required: 480, stock: 120, short: 360, order: 500, rate: 6.5, vendor: 'Hyderabad Fasteners' };
const SHORT_VALUE = PO_VALUE + BOLTS.short * BOLTS.rate;

function Table({ t }) {
  return (
    <div className="fm-table fm-req">
      <div className="fm-tr is-head fm-tr-req">
        <span>Material</span><span>Required</span><span>In Stock</span><span>Shortfall</span><span>On Order</span><span>Status</span><span>To Order</span><span>Buy From</span>
      </div>
      <Show on={t >= 600} className="fm-tr fm-tr-req is-short">
        <span><b>{MATERIAL.name}</b> <em className="fm-tag">RFQ</em></span>
        <span>{STOCK.needed} kg</span><span>{STOCK.onHand} kg</span><span className="fm-bad">{STOCK.short}</span><span className="fm-muted">—</span>
        <span><Pill tone="danger">Short</Pill></span><span><b>{STOCK.short} kg</b></span>
        <span className="fm-buy"><b>Deccan Metals</b><small>₹260 · 7 days</small></span>
      </Show>
      <Show on={t >= 1100} className="fm-tr fm-tr-req is-short">
        <span><b>{BOLTS.name}</b></span>
        <span>{BOLTS.required}</span><span>{BOLTS.stock}</span><span className="fm-bad">{BOLTS.short}</span><span className="fm-muted">—</span>
        <span><Pill tone="danger">Short</Pill></span><span><b>{BOLTS.order}</b><small className="fm-muted"> min. order</small></span>
        <span className="fm-buy"><b>{BOLTS.vendor}</b><small>₹6.50 · 3 days</small></span>
      </Show>
      <Show on={t >= 1600} className="fm-tr fm-tr-req">
        <span><b>MS plate, 8 mm</b></span><span>210 kg</span><span>460 kg</span><span className="fm-muted">—</span><span className="fm-muted">—</span>
        <span><Pill tone="ok">Covered</Pill></span><span className="fm-muted">—</span><span className="fm-buy"><b>Apex Steel Traders</b><small>₹72 · 5 days</small></span>
      </Show>
    </div>
  );
}

function Plan({ t }) {
  return (
    <div className="fm-modal-wrap is-light">
      <div className="fm-modal is-wide fl-enter">
        <div className="fm-modal-top"><b className="fm-modal-h"><ShoppingCart size={16} /> Raise purchase orders for the shortfall</b><X size={15} className="fm-muted" /></div>
        <p className="fm-muted fm-modal-p">One purchase order per vendor, from each material’s preferred vendor, at their price — quantities rounded up to their minimum order.</p>
        {[['Deccan Metals', [[MATERIAL.name, `${STOCK.short} kg`, '₹260', PO_VALUE]]],
          [BOLTS.vendor, [[BOLTS.name, `${BOLTS.order} nos`, '₹6.50', BOLTS.order * BOLTS.rate, `short ${BOLTS.short}, minimum order`]]]].map(([v, lines], i) => (
          <Show key={v} on={t >= 13200 + i * 500} className="fm-plan-v">
            <div className="fm-plan-h"><b>{v}</b><b>{rupee(lines.reduce((s, l) => s + l[3], 0))}</b></div>
            {lines.map(([m, q, r, a, note]) => (
              <div key={m} className="fm-plan-l"><span>{m}</span><span>{q}{note && <small>{note}</small>}</span><span className="fm-muted">× {r}</span><b>{rupee(a)}</b></div>
            ))}
          </Show>
        ))}
        <div className="fm-sh-actions fm-right">
          <span className="fl-btn">Cancel</span>
          <span className="fl-btn primary">Raise 2 purchase orders</span>
        </div>
      </div>
    </div>
  );
}

export default function Scene({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Layers} title="Material Requirements"
        sub="What every open order needs, against what's in stock. Shortfalls are ranked by value, so the money goes where it matters."
        right={(
          <span className="fm-sh-actions">
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn primary${t >= 12000 && t < 12250 ? ' is-pressed' : ''}`}><ShoppingCart size={13} /> Raise purchase orders</span>
              <Cursor on={t >= 11000 && t < 12600} click={t >= 12000 && t < 12250} />
            </span>
            <span className="fl-btn"><RefreshCw size={13} /> Refresh</span>
          </span>
        )} />
      <Tiles items={[['Materials short', 2, 'danger'], ['On order', 0, 'amber'], ['Shortfall value', rupee(SHORT_VALUE), 'info']]} />
      <div className="fm-filters">
        <span className="fm-chip is-on">All statuses</span><span className="fm-chip">All categories</span>
        <span className="fm-check"><i className="is-on">✓</i> Only what's short</span>
        <span className="fm-muted fm-hint-r"><AlertTriangle size={12} /> RFQ: the top of the shortfall by value — worth a quote first</span>
      </div>
      <Table t={t} />
      {t >= 12300 && <Plan t={t} />}
    </div>
  );
}
