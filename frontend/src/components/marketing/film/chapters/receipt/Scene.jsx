import React from 'react';
import { PackageCheck, Database, ReceiptText, Wallet, CheckCircle2, ArrowUp } from 'lucide-react';
import { Show, Typed, Cursor, Count, Pill } from '../../../flow/kit';
import { MATERIAL, STOCK, PO_VALUE, makeIds, FILM_DATE } from '../../../data/transaction';
import { ScreenHead, Tiles } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 11 — GRN.jsx ("Inward New Material": Select PO, Vehicle No., Batch
   Number, Chainage, Weighbridge Weight → Generate GRN), Stock on hand,
   GrnBillBuilder ("New GRN Bill") and Payables (Total payable, Ageing,
   Top vendors owed, Record payment). */
export const Icon = PackageCheck;

const IDS = makeIds(FILM_DATE);
const GST = Math.round(PO_VALUE * 0.09);
const PAYABLE = PO_VALUE + 2 * GST;

function Inward({ t }) {
  const done = t >= 6700;
  return (
    <div className="fm-screen">
      <ScreenHead icon={PackageCheck} title="Goods Receipt Note (GRN)" sub="Record inward material deliveries against Purchase Orders." />
      <div className="fm-card">
        <b className="fm-card-h">Inward New Material</b>
        <div className="fm-grn-form">
          <label className="fm-pf-field is-wide"><small>Select PO</small><span className="fm-input is-app is-select">{t >= 900 ? `${IDS.po} — ${MATERIAL.name}` : '— Select —'}</span></label>
          <label className="fm-pf-field"><small>Vehicle No.</small><span className="fm-input is-app"><Typed text="TS 09 UB 4521" t={t} start={1800} cps={14} ph="TS 09 EU 1234" /></span></label>
          <label className="fm-pf-field"><small>Batch Number</small><span className="fm-input is-app"><Typed text="DM-0931" t={t} start={3000} cps={12} ph="B-2026" /></span></label>
          <label className="fm-pf-field"><small>Chainage</small><span className="fm-input is-app"><span className="fm-ph">CH 12+500</span></span></label>
          <label className="fm-pf-field"><small>Weighbridge Weight</small><span className="fm-input is-app"><Typed text={String(STOCK.short)} t={t} start={3900} cps={8} /></span></label>
          <span className="fl-cursor-host is-inline fm-grn-go">
            <span className={`fl-btn primary${t >= 6300 && t < 6550 ? ' is-pressed' : ''}`}>Generate GRN</span>
            <Cursor on={t >= 5400 && t < 6900} click={t >= 6300 && t < 6550} />
          </span>
        </div>
      </div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-grn"><span>Receipt ID</span><span>PO Ref</span><span>Vehicle</span><span>Net Quantity</span></div>
        {done && <Show on className="fm-tr fm-tr-grn is-new"><span className="fm-mono-b">{IDS.grn}</span><span className="fm-mono-b">{IDS.po}</span><span>TS 09 UB 4521</span><span><b>{STOCK.short} kg</b></span></Show>}
        <div className="fm-tr fm-tr-grn"><span className="fm-mono-b">GRN-00030</span><span className="fm-mono-b">PFW/FY2026-27/017</span><span>TS 07 HB 0098</span><span>500 nos</span></div>
      </div>
      {done && <Show on={t >= 6900} className="fm-toast"><CheckCircle2 size={13} /> GRN generated</Show>}
    </div>
  );
}

function Stock({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Database} title="Stock on hand"
        sub="What you are holding right now, across the business. Set a reorder level to make the low-stock warning mean something." />
      <Tiles items={[['Items held', 14], ['Needs ordering', t >= 10200 ? 1 : 2, 'amber'], ['Stock value', t >= 10200 ? '₹4,21,860' : '₹3,75,060']]} />
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-stk"><span>Item</span><span>Held</span><span>Status</span><span>Reorder at</span><span>Last movement</span></div>
        <div className="fm-tr fm-tr-stk is-new">
          <span><b>{MATERIAL.name}</b><small className="fm-muted"> · Yard 2, Rack B</small></span>
          <span className="fm-held"><b><Count to={STOCK.after} from={STOCK.onHand} t={t} start={9400} dur={1400} /> kg</b></span>
          <span>{t >= 10800 ? <Pill tone="ok" dot>Healthy</Pill> : <Pill tone="danger" dot>Low Stock</Pill>}</span>
          <span className="fm-muted">200 kg</span>
          <span><Show on={t >= 9400} className="fm-move"><ArrowUp size={12} /> +{STOCK.short} kg · {IDS.grn}</Show></span>
        </div>
        <div className="fm-tr fm-tr-stk"><span><b>M8 × 25 SS304 bolts</b></span><span><b>620 nos</b></span><span><Pill tone="ok" dot>Healthy</Pill></span><span className="fm-muted">300 nos</span><span className="fm-muted">+500 · GRN-00030</span></div>
        <div className="fm-tr fm-tr-stk"><span><b>MS plate, 8 mm</b></span><span><b>460 kg</b></span><span><Pill tone="ok" dot>Healthy</Pill></span><span className="fm-muted">250 kg</span><span className="fm-muted">opening</span></div>
      </div>
      <Show on={t >= 11400} className="fm-note-chip">Every movement is in the ledger — goods in, issues to production, dispatch, counts.</Show>
    </div>
  );
}

function Bill({ t }) {
  const made = t >= 21000;
  return (
    <div className="fm-screen">
      <ScreenHead icon={ReceiptText} title="New GRN Bill" sub={`Against ${IDS.grn} · ${IDS.po} · Deccan Metals`} />
      <div className="fm-bill">
        <div className="fm-card">
          <div className="fm-row2">
            <label className="fm-pf-field"><small>Vendor Bill Ref</small><span className="fm-input is-app"><Typed text="DM/INV/1187" t={t} start={15800} cps={12} ph="INV-2026-..." /></span></label>
            <label className="fm-pf-field"><small>GST Type</small><span className="fm-input is-app is-select">Intra-state (CGST+SGST)</span></label>
          </div>
          <small className="fm-sec-label">Line Items</small>
          <div className="fm-table">
            <div className="fm-tr is-head fm-tr-bill"><span>Description</span><span>Qty</span><span>UOM</span><span>Rate</span><span>Amount</span></div>
            <div className="fm-tr fm-tr-bill"><span>{MATERIAL.name}</span><span>{STOCK.short}</span><span>kg</span><span>260</span><span className="fm-mono-b">{rupee(PO_VALUE)}</span></div>
          </div>
          <small className="fm-sec-label">Charges &amp; Adjustments</small>
          <div className="fm-charges"><span>Freight ₹ <b>0</b></span><span>Discount ₹ (−) <b>0</b></span><span>Round Off ₹ <b>0</b></span></div>
        </div>
        <div className="fm-card fm-bill-sum">
          <b className="fm-card-h">Bill Summary</b>
          <p><span>Taxable</span><b>{rupee(PO_VALUE)}</b></p>
          <p><span>CGST 9%</span><b>{rupee(GST)}</b></p>
          <p><span>SGST 9%</span><b>{rupee(GST)}</b></p>
          <p className="is-strong"><span>Net Payable</span><b>{rupee(PAYABLE)}</b></p>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary is-wide${t >= 20600 && t < 20850 ? ' is-pressed' : ''}`}>{made ? <><CheckCircle2 size={13} /> GB-0001</> : 'Create Bill'}</span>
            <Cursor on={t >= 19700 && t < 21200} click={t >= 20600 && t < 20850} />
          </span>
        </div>
      </div>
    </div>
  );
}

function Pay({ t }) {
  const paid = t >= 28200;
  const open = t >= 24600 && !paid;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Wallet} title="Payables" sub="What you owe your vendors — outstanding bills, ageing, and payments." />
      <div className="fm-pay-top">
        <div className="fm-card"><small className="fm-sec-label">Total payable</small><b className="fm-big">{paid ? '₹0' : rupee(PAYABLE)}</b></div>
        <div className="fm-card"><small className="fm-sec-label">Ageing</small>
          <div className="fm-ageing">{[['0-30', paid ? 0 : PAYABLE], ['31-60', 0], ['61-90', 0], ['90+', 0]].map(([k, v]) => <span key={k}><small>{k}</small><b>{rupee(v)}</b></span>)}</div>
        </div>
        <div className="fm-card"><small className="fm-sec-label">Top vendors owed</small><b>{paid ? 'Nothing outstanding' : `Deccan Metals · ${rupee(PAYABLE)}`}</b></div>
      </div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-pay"><span>Bill</span><span>Vendor</span><span>Net</span><span>Status</span><span /></div>
        <div className="fm-tr fm-tr-pay is-new">
          <span className="fm-mono-b">GB-0001</span><span><b>Deccan Metals</b><small className="fm-muted"> · DM/INV/1187</small></span>
          <span className="fm-mono-b">{rupee(PAYABLE)}</span>
          <span>{paid ? <Pill tone="ok" dot>Paid</Pill> : <Pill tone="amber" dot>Unpaid</Pill>}</span>
          <span className="fl-cursor-host is-inline"><span className={`fl-btn${t >= 24200 && t < 24450 ? ' is-pressed' : ''}`}>Pay</span><Cursor on={t >= 23400 && t < 24700} click={t >= 24200 && t < 24450} /></span>
        </div>
      </div>
      {open && (
        <div className="fm-modal-wrap is-light">
          <div className="fm-modal fl-enter">
            <b className="fm-modal-h"><Wallet size={16} /> Record payment</b>
            <div className="fm-row2">
              <label className="fm-pf-field"><small>Amount ₹ *</small><span className="fm-input is-app">{PAYABLE}</span></label>
              <label className="fm-pf-field"><small>Mode</small><span className="fm-input is-app is-select">NEFT</span></label>
            </div>
            <label className="fm-pf-field"><small>Reference</small><span className="fm-input is-app"><Typed text="UTR HDFC2610081187" t={t} start={25400} cps={22} /></span></label>
            <span className="fl-cursor-host is-inline fm-right-self">
              <span className={`fl-btn primary${t >= 27700 && t < 27950 ? ' is-pressed' : ''}`}>Record payment</span>
              <Cursor on={t >= 26900 && t < 28300} click={t >= 27700 && t < 27950} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'inward') return <Inward t={t} />;
  if (beat.key === 'stock') return <Stock t={t} />;
  if (beat.key === 'bill') return <Bill t={t} />;
  return <Pay t={t} />;
}
