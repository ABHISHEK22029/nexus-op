import React from 'react';
import { Send, Check, Inbox, FileText, Mail, Paperclip, CheckCircle2, ShoppingBag, Share2, MessageCircle } from 'lucide-react';
import { Show, Typed, Cursor, Pill, Morph, Count } from '../../flow/kit';
import { BracketArt, IDS } from '../../flow/story';
import { SELLER, CUSTOMER, PRODUCT, QTY, RATE, SUB, HALF_GST, TOTAL } from '../../data/transaction';
import AppShell from '../../film/shell/AppShell';
import PublicWindow from '../../film/shell/PublicWindow';
import { ScreenHead } from '../../film/shell/screen';
import { rupee } from '../../film/shell/format';
import { Win, Lines, Thread, Rider } from '../parts';
import OrderCard from './OrderCard';

/* ══════════════════════════════════════════════════════════════════════
   Act 2 — the front door. (7–19 s; times here are from 7 s)

   0–3.4    The customer's screen: Precision Fab Works' catalogue page for
            the bracket. 120 typed, Add to enquiry, the drawer, their note,
            Send enquiry — PublicCatalogue.jsx's own steps.
   3.5–5.6  The hand-off, the ad's first piece of magic: the customer's
            screen steps back to the left, Maks Ops arrives on the right,
            and the enquiry itself leaves one and lands in the other along
            the thread. Then Maks Ops takes the frame.
   5–8      It is in the Enquiries list, unread; it opens — who, what,
            their note — and Convert to quotation.
   8–12     The same panel becomes QT-0007, already priced; Email opens a
            draft with the PDF; it is sent, accepted, and converted — and
            what is left on screen is the order, CO-0012, exactly where
            act 3 picks it up.
   ══════════════════════════════════════════════════════════════════════ */

const WIN = { wide: [140, 140, 1000, 548], narrow: [10, 112, 400, 592] };
const NOTE = 'Brushed finish, delivery in 4 weeks. Drawing to follow.';

/* the enquiry's flight, from the customer's drawer to the Enquiries list */
const FLIGHT = {
  wide: 'M 440 256 C 580 130, 900 140, 1070 280',
  narrow: 'M 210 600 C 110 500, 310 420, 210 318',
};

function Catalogue({ t, layout }) {
  const drawer = t >= 1900;
  const sent = t >= 3400;
  return (
    <PublicWindow path="/c/precision-fab/ss304-mounting-bracket">
      <div className="fm-cat-head">
        <span className="fm-cat-logo">PF</span>
        <span className="fm-cat-co"><b>{SELLER.name}</b><small>Catalogue · {SELLER.city}</small></span>
        {layout === 'wide' && <span className="fm-cat-btn is-icon"><Share2 size={14} /></span>}
        {layout === 'wide' && <span className="fm-cat-btn"><MessageCircle size={14} className="fm-wa" /> WhatsApp</span>}
        <span className={`fm-cat-btn is-basket${t >= 1650 ? ' is-full' : ''}`}><ShoppingBag size={14} /> Enquiry{t >= 1650 ? <i>1</i> : null}</span>
      </div>
      <div className="fm-cat-body fm-prod ad-prod">
        <div className="fm-prod-grid">
          <div className="fm-prod-art"><BracketArt /></div>
          <div className="fm-prod-info">
            <small className="fm-prod-cat">Brackets</small>
            <b className="fm-prod-name">{PRODUCT.name}</b>
            <span className="fm-prod-line">2 mm SS304, brushed — for panel and frame mounting.</span>
            <dl className="fm-prod-dl">
              <dt>Rate</dt><dd>{rupee(RATE)} / {PRODUCT.unit}</dd>
              <dt>Minimum order</dt><dd>{PRODUCT.moq} {PRODUCT.unit}</dd>
              <dt>Lead time</dt><dd>{PRODUCT.leadTime}</dd>
            </dl>
            <div className="fm-prod-buy">
              <span className="fm-qty is-big"><Typed text={String(QTY)} t={t} start={500} cps={8} ph="1" /></span>
              <span className="fl-cursor-host is-inline">
                <span className={`fm-cat-cta${t >= 1400 && t < 1600 ? ' is-pressed' : ''}${t >= 1650 ? ' is-done' : ''}`}>
                  {t >= 1650 ? <><Check size={14} /> Added</> : 'Add to enquiry'}
                </span>
                <Cursor on={t >= 700 && t < 1800} click={t >= 1400 && t < 1600} />
              </span>
            </div>
          </div>
        </div>
      </div>
      {drawer && (
        <div className="fm-drawer-wrap ad-drawer">
          <div className="fm-drawer fl-enter">
            <div className="fm-drawer-h"><b>Your enquiry</b></div>
            <div className={`fm-drawer-line${sent ? ' ad-lifted' : ''}`}><span>{PRODUCT.name}</span><span className="fm-qty">{QTY}</span></div>
            <span className="fm-input">{CUSTOMER.contact}</span>
            <span className="fm-input">{CUSTOMER.name}</span>
            <span className="fm-input">{CUSTOMER.email}</span>
            <span className="fm-input is-tall"><Typed text={NOTE} t={t} start={2100} cps={52} ph="Anything we should know" /></span>
            <span className="fl-cursor-host">
              <span className={`fm-cat-cta is-wide${t >= 3200 && t < 3400 ? ' is-pressed' : ''}`}><Send size={14} /> Send enquiry</span>
              <Cursor on={t >= 2600 && t < 3600} click={t >= 3200 && t < 3400} />
            </span>
          </div>
        </div>
      )}
    </PublicWindow>
  );
}

/* the enquiry, opened: then the same panel as a quotation, then the order */
function Panel({ t, layout }) {
  const quoting = t >= 8000;
  const composing = t >= 10050 && t < 10900;
  const status = t >= 11100 ? 'Accepted' : t >= 10900 ? 'Sent' : 'Draft';
  const id = t >= 11500 ? IDS.co : quoting ? IDS.qt : IDS.enq;
  return (
    <div className={`ad-panel is-${layout}`}>
      <div className="ad-panel-h">
        <span className="ad-panel-ico">{quoting ? <FileText size={16} /> : <Inbox size={16} />}</span>
        <b className="fm-mono-b ad-id"><Morph k={id}>{id}</Morph></b>
        {quoting
          ? <Pill tone={status === 'Accepted' ? 'ok' : status === 'Sent' ? 'info' : 'neutral'} dot>{status}</Pill>
          : <Pill tone="info" dot>New</Pill>}
        <span className="ad-panel-who">{CUSTOMER.contact} · {CUSTOMER.name}</span>
      </div>

      {!quoting ? (
        <div className="ad-panel-b fl-enter-soft">
          <small className="fm-sec-label">What they want</small>
          <div className="ad-want"><b>{PRODUCT.name}</b><span>× {QTY} {PRODUCT.unit}</span></div>
          <small className="fm-sec-label">Their note</small>
          <p className="ad-note">{NOTE}</p>
          <small className="ad-from"><Inbox size={12} /> From your catalogue · {CUSTOMER.email}</small>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 7300 && t < 7500 ? ' is-pressed' : ''}`}>Convert to quotation</span>
            <Cursor on={t >= 6700 && t < 7700} click={t >= 7300 && t < 7500} />
          </span>
        </div>
      ) : (
        <div className="ad-panel-b fl-enter-soft">
          <span className="ad-banner">From enquiry {IDS.enq} — their lines are below; price them.</span>
          <div className="fm-table ad-qt">
            <div className="fm-tr is-head ad-tr-q"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
            <div className="fm-tr ad-tr-q">
              <span><b>{PRODUCT.name}</b></span><span>{QTY}</span>
              <span className="fm-mono-b"><Typed text={rupee(RATE)} t={t} start={8300} cps={14} ph="₹" /></span>
              <span className="fm-mono-b">{t >= 8800 ? <Count to={SUB} t={t} start={8800} dur={500} fmt={(n) => rupee(Math.round(n))} /> : '—'}</span>
            </div>
          </div>
          <div className="ad-sums">
            <span>CGST 9% <b>{rupee(HALF_GST)}</b></span>
            <span>SGST 9% <b>{rupee(HALF_GST)}</b></span>
            <span className="is-total">Total <b>{t >= 9000 ? <Count to={TOTAL} t={t} start={9000} dur={600} fmt={(n) => rupee(Math.round(n))} /> : '—'}</b></span>
          </div>
          <div className="ad-acts">
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn${t >= 9850 && t < 10050 ? ' is-pressed' : ''}`}><Mail size={13} /> Email</span>
              <Cursor on={t >= 9400 && t < 10200} click={t >= 9850 && t < 10050} />
            </span>
            <span className="fl-btn">PDF</span>
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn primary${t >= 11300 && t < 11480 ? ' is-pressed' : ''}`}>{t >= 11500 ? <><CheckCircle2 size={13} /> {IDS.co}</> : 'Convert to Order'}</span>
              <Cursor on={t >= 10950 && t < 11600} click={t >= 11300 && t < 11480} />
            </span>
          </div>
          {composing && (
            <div className="ad-compose fl-enter">
              <span className="ad-compose-row"><small>To</small><b>{CUSTOMER.email}</b></span>
              <span className="ad-compose-row"><small>Subject</small><b>Quotation {IDS.qt} — {SELLER.name}</b></span>
              <span className="ad-compose-body">Please find attached our quotation for {QTY} × {PRODUCT.name}.</span>
              <span className="ad-compose-foot">
                <span className="ad-attach"><Paperclip size={12} /> {IDS.qt}.pdf</span>
                <span className={`fl-btn primary${t >= 10650 && t < 10850 ? ' is-pressed' : ''}`}><Send size={13} /> Use my mail app</span>
              </span>
            </div>
          )}
          <Show on={t >= 10900 && t < 11400} className="fm-toast is-float ad-toast"><Check size={13} /> Emailed to {CUSTOMER.email}</Show>
        </div>
      )}
    </div>
  );
}

function App({ t, layout }) {
  const path = t >= 8000 ? '/sales-quotations' : '/enquiries';
  return (
    <AppShell path={path} layout={layout} badges={t < 5800 ? { '/enquiries': 1 } : {}}>
      {t < 8000 ? (
        <div className="fm-screen">
          <ScreenHead icon={Inbox} title="Enquiries"
            sub="People who found your catalogue and asked for something. Converting one adds them as a customer." />
          <div className="fm-rows">
            <Show on={t >= 4950} from="down" className="fm-row is-new">
              <Pill tone="info">New</Pill>
              <span className="fm-row-main"><b>{CUSTOMER.name} <span>· {CUSTOMER.contact}</span></b><small>{IDS.enq} · 1 item · {NOTE}</small></span>
              <span className="fm-row-when">just now</span>
            </Show>
            <div className="fm-row"><Pill>Quoted</Pill><span className="fm-row-main"><b>Orbit Infra <span>· Suresh</span></b><small>ENQ-0041 · 2 items · Base plates for the yard canopy</small></span><span className="fm-row-when">2 days ago</span></div>
            <div className="fm-row"><Pill>Quoted</Pill><span className="fm-row-main"><b>Sunline Solar <span>· Meera</span></b><small>ENQ-0039 · 1 item · Mid clamps, 600</small></span><span className="fm-row-when">last week</span></div>
          </div>
        </div>
      ) : (
        <div className="fm-screen">
          <ScreenHead icon={FileText} title="Quotations" sub="Quote your customers up front — then convert a won quote straight into an order." />
        </div>
      )}
      {t >= 5600 && t < 5600 + 1600 && <Show on className="fm-toast is-float ad-toast"><Check size={13} /> Enquiry received</Show>}
      {t >= 5500 && <Panel t={t} layout={layout} />}
    </AppShell>
  );
}

export default function Front({ t, layout }) {
  const win = WIN[layout];
  const wide = layout === 'wide';
  /* the customer's screen: whole, then stepping back, then gone */
  const custState = t >= 5000 ? 'is-gone' : t >= 3500 ? 'is-back' : '';
  /* Maks Ops: arriving, on the right, then the whole frame */
  const appState = t >= 5000 ? 'is-full' : t >= 3650 ? 'is-half' : 'is-off';
  const ordered = t >= 11600;
  return (
    <div className={`ad-act ad-front is-${layout}`}>
      {t < 5700 && (
        <Win at={win} className={`ad-cust ${custState}`}><Catalogue t={t} layout={layout} /></Win>
      )}
      {t >= 3400 && (
        <Win at={win} className={`ad-app ${appState}${ordered ? ' is-done' : ''}`}><App t={t} layout={layout} /></Win>
      )}

      <Lines layout={layout}>
        <Thread d={FLIGHT[layout]} on={t >= 4150 && t < 5050} dur={850} />
      </Lines>
      {t >= 3950 && t < 5600 && (
        <Rider d={FLIGHT[layout]} on={t >= 4150} dur={850}
          className={`ad-packet${t >= 4000 ? ' is-ready' : ''}${t >= 5050 ? ' is-dropped' : ''}`}>
          <span className="ad-packet-ico"><Send size={14} /></span>
          <span className="ad-packet-main"><b>Enquiry · {PRODUCT.name}</b><small>× {QTY} · {CUSTOMER.short}</small></span>
        </Rider>
      )}
      {wide && t >= 3650 && t < 5000 && (
        <>
          <span className="ad-tag is-cust">The customer’s screen</span>
          <span className="ad-tag is-you">Your Maks Ops</span>
        </>
      )}

      {ordered && <OrderCard layout={layout} className="ad-order-arrive" />}
    </div>
  );
}
