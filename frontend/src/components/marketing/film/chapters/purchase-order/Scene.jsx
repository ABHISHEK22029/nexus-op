import React from 'react';
import { ShoppingCart, ShieldCheck, CheckCircle2, Send, Eye, Zap } from 'lucide-react';
import { Show, Cursor, Pill } from '../../../flow/kit';
import { MATERIAL, STOCK, PO_VALUE, APPROVAL_THRESHOLD, makeIds, FILM_DATE } from '../../../data/transaction';
import { amountInWords } from '../../../../../lib/amountInWords';
import { ScreenHead } from '../../shell/screen';
import { rupee } from '../../shell/format';
import { Paper, Meta, Lines, Totals } from '../../shell/paper';
import { canFor } from '../../data/roleViews';

/* 10 — PurchaseOrders.jsx (Needs sign-off; Sign off / Reject for whoever
   holds po-approval; Approve; Dispatch), the Automation threshold, and the
   printed PO (POInvoice). Whether a role is offered "Sign off" is not drawn
   by hand: it is canFor(role)('po-approval', 'write') on the backend's own
   role table, the same test the app makes. */
export const Icon = ShoppingCart;

const IDS = makeIds(FILM_DATE);
const GST = Math.round(PO_VALUE * 0.09);
const WITH_GST = PO_VALUE + 2 * GST;

function List({ t, role, signedAt }) {
  const mayApprove = canFor(role)('po-approval', 'write');
  const signed = signedAt != null && t >= signedAt + 250;
  return (
    <div className="fm-table">
      <div className="fm-tr is-head fm-tr-po"><span>PO #</span><span>Vendor</span><span>Item</span><span>PO Value</span><span>Status</span><span>Actions</span></div>
      <div className="fm-tr fm-tr-po is-new">
        <span className="fm-mono-b">{IDS.po}</span><span><b>Deccan Metals</b></span><span>{MATERIAL.name}</span>
        <span className="fm-mono-b">{rupee(PO_VALUE)}</span>
        <span className="fm-stack">
          <Pill tone="amber" dot>Pending</Pill>
          {signed ? <Pill tone="ok">Approved</Pill> : <Pill tone="danger">Needs sign-off</Pill>}
        </span>
        <span className="fm-sh-actions">
          {mayApprove && !signed && (
            <>
              <span className="fl-cursor-host is-inline">
                <span className={`fl-btn primary${signedAt != null && t >= signedAt && t < signedAt + 250 ? ' is-pressed' : ''}`}><ShieldCheck size={13} /> Sign off</span>
                {signedAt != null && <Cursor on={t >= signedAt - 900 && t < signedAt + 500} click={t >= signedAt && t < signedAt + 250} />}
              </span>
              <span className="fl-btn">Reject</span>
            </>
          )}
          <span className="fl-btn"><Eye size={13} /> View PO</span>
        </span>
      </div>
      <div className="fm-tr fm-tr-po">
        <span className="fm-mono-b">PFW/FY2026-27/017</span><span><b>Hyderabad Fasteners</b></span><span>M8 × 25 SS304 bolts</span>
        <span className="fm-mono-b">₹3,250</span><span><Pill tone="info" dot>Dispatched</Pill></span><span className="fm-sh-actions"><span className="fl-btn">Receive GRN</span></span>
      </div>
    </div>
  );
}

function Lists({ t, beat }) {
  const role = beat.role || 'Owner';
  return (
    <div className="fm-screen">
      <ScreenHead icon={ShoppingCart} title="Purchase Orders" sub="Create orders with detailed line items and GST." />
      {beat.key === 'held' && (
        <Show on={t >= 1600} className="fm-card fm-auto">
          <span className="fm-auto-ico"><Zap size={15} /></span>
          <label className="fm-pf-field"><small>PO approval threshold (₹)</small><span className="fm-input is-app">{APPROVAL_THRESHOLD}</span></label>
          <span className="fm-muted">POs over <b>{rupee(APPROVAL_THRESHOLD)}</b> will need sign-off.</span>
        </Show>
      )}
      {beat.key !== 'held' && (
        <div className={`fm-seen-as tone-${role.toLowerCase()}`}>
          Signed in as <b>{role}</b> — {canFor(role)('po-approval', 'write') ? 'may sign off purchase orders' : 'may raise purchase orders, not sign them off'}
        </div>
      )}
      <List t={t} role={role} signedAt={beat.key === 'finance' ? 12800 : null} />
      {beat.key === 'finance' && <Show on={t >= 13100} className="fm-toast"><CheckCircle2 size={13} /> PO approved</Show>}
    </div>
  );
}

function Document({ t }) {
  const approved = t >= 17100, dispatched = t >= 18600;
  return (
    <div className="fm-screen">
      <div className="fm-doc-bar">
        <span className="fm-stack">
          <Pill tone={dispatched ? 'info' : approved ? 'ok' : 'amber'} dot>{dispatched ? 'Dispatched' : approved ? 'Approved' : 'Pending'}</Pill>
          <Pill tone="ok">Signed off</Pill>
        </span>
        <span className="fm-sh-actions">
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn${!approved ? ' primary' : ''}${t >= 16800 && t < 17050 ? ' is-pressed' : ''}`}><CheckCircle2 size={13} /> Approve</span>
            <Cursor on={t >= 16100 && t < 17300} click={t >= 16800 && t < 17050} />
          </span>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn${approved && !dispatched ? ' primary' : ''}${t >= 18300 && t < 18550 ? ' is-pressed' : ''}`}><Send size={13} /> Dispatch</span>
            <Cursor on={t >= 17500 && t < 18800} click={t >= 18300 && t < 18550} />
          </span>
        </span>
      </div>
      <Paper title="PURCHASE ORDER" id={IDS.po}>
        <Meta left={[['Vendor', 'Deccan Metals'], ['', 'Balanagar, Hyderabad · GSTIN 36AAACD9999K1Z2']]}
          right={[['Date', '08 Oct 2026'], ['For', IDS.co], ['Quote reference', 'DM/Q/2231']]} />
        <Lines cols={[['#'], ['Description'], ['HSN'], ['Qty', 'r'], ['Rate', 'r'], ['Amount', 'r']]}
          rows={[['1', MATERIAL.name, '7219', `${STOCK.short} kg`, '₹260', rupee(PO_VALUE)]]} />
        <div className="fm-terms">
          <span><small>Payment Terms</small>Net 30 Days</span><span><small>Price Basis</small>Ex Works</span>
          <span><small>P&amp;F / Loading</small>Vendor Scope</span><span><small>Warranty</small>12 months</span>
        </div>
        <Totals words={amountInWords(WITH_GST)}
          rows={[['Subtotal', rupee(PO_VALUE)], ['CGST @ 9%', rupee(GST)], ['SGST @ 9%', rupee(GST)], ['Total', rupee(WITH_GST), true]]} />
      </Paper>
    </div>
  );
}

export default function Scene({ t, beat }) {
  return beat.key === 'dispatch' ? <Document t={t} /> : <Lists t={t} beat={beat} />;
}
