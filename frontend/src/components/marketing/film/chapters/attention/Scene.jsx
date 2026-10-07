import React from 'react';
import { Bell, Activity, Sparkles, ShoppingCart, Truck, IndianRupee, MessageSquareQuote, FileText, Check, Send } from 'lucide-react';
import { Show, Typed, Cursor } from '../../../flow/kit';
import { MODULES } from '../../../../../lib/navigation';
import { CUSTOMER, MATERIAL, STOCK, PO_VALUE, APPROVAL_THRESHOLD, TOTAL, makeIds, FILM_DATE } from '../../../data/transaction';
import { ScreenHead } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 16 — the menu's badges (every one declared in lib/navigation.js, read
   from there, so the list cannot drift from the app's), the notifications
   in the account menu (titles as backend/notify callers write them), the
   Activity Timeline, and Ask AI with its own suggestions. */
export const Icon = Bell;

const IDS = makeIds(FILM_DATE);
const BADGES = MODULES.flatMap((m) => m.items.filter((i) => i.badge && !i.module).map((i) => ({ module: m.label, label: i.label, title: i.badge.title, tone: i.badge.tone })));
const SAMPLE = { 'Purchase orders': 1, 'Vendor quotes': 2, Enquiries: 1, Orders: 2 };

const NOTES = [
  [MessageSquareQuote, `New enquiry · ${IDS.enq}`, `${CUSTOMER.contact} (${CUSTOMER.name}) — 1 item`, '2d'],
  [FileText, `Approval needed · ${IDS.po}`, `PO value ${rupee(PO_VALUE)} exceeds the ${rupee(APPROVAL_THRESHOLD)} limit`, '1d'],
  [Truck, `Goods received · ${IDS.grn}`, `${STOCK.short} of ${MATERIAL.name} received against PO-18`, '20h'],
  [IndianRupee, `Payment received · ${IDS.inv}`, `${rupee(TOTAL)} via Bank — invoice Paid`, '3m'],
];

const ACTIVITY = [
  ['PO_CREATED', `${IDS.po} raised from Deccan Metals's quotation`],
  ['PO_APPROVAL', 'PO-18 sign-off: Approved'],
  ['GRN', `${IDS.grn} received for PO-0018 (${STOCK.short} units of ${MATERIAL.name})`],
  ['PO_DISPATCHED', 'PO-18 "SS304 sheet, 2 mm" dispatched to vendor'],
];

function Badges({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={ShoppingCart} title="Purchase Orders" sub="Create orders with detailed line items and GST." />
      <div className="fm-card">
        <b className="fm-card-h"><Bell size={15} /> Where the menu counts what is waiting</b>
        <div className="fm-badge-list">
          {BADGES.map((b, i) => (
            <Show key={b.label} on={t >= 500 + i * 300} className="fm-badge-row">
              <span className="fm-muted">{b.module} ›</span><b>{b.label}</b>
              <em className={`fm-badge tone-${b.tone}${SAMPLE[b.label] ? '' : ' is-zero'}`}>{SAMPLE[b.label] ?? 0}</em>
              <span className="fm-muted">{b.title}</span>
            </Show>
          ))}
        </div>
      </div>
    </div>
  );
}

function Timeline({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Activity} title="Activity Timeline" sub="Immutable audit log of all platform actions." />
      <div className="fm-table">
        {ACTIVITY.map(([type, text], i) => (
          <div key={type} className="fm-tr fm-tr-act"><span className="fm-mono-b fm-muted">{['10:02', '10:41', '15:18', '11:06'][i]}</span><span className="fm-act-type">{type}</span><span>{text}</span></div>
        ))}
      </div>
      {t < 15000 && (
        <div className="fm-notes fl-enter">
          <div className="fm-notes-h"><b>Notifications</b><span><Check size={12} /> Mark all read</span></div>
          {NOTES.map((n, i) => (
            <Show key={n[1]} on={t >= 7900 + i * 450} className="fm-note-row is-unread">
              <span className="fm-note-ico">{React.createElement(n[0], { size: 14 })}</span>
              <span className="fm-note-txt"><b>{n[1]}</b><small>{n[2]}</small><em>{n[3]} ago</em></span>
              <i className="fm-dot" />
            </Show>
          ))}
        </div>
      )}
      {t >= 15000 && <AskAi t={t} />}
    </div>
  );
}

const SUGGEST = ["What's overdue right now?", 'What needs my approval?', 'How do I raise a vendor PO?', "What's low on stock?"];

function AskAi({ t }) {
  const asked = t >= 17300;
  return (
    <div className="fm-ai fl-enter">
      <div className="fm-ai-h"><Sparkles size={15} /><b>Ask AI</b><small>Answers about your Maks Ops data</small></div>
      {!asked ? (
        <div className="fm-ai-body">
          <b>How can I help?</b>
          {SUGGEST.map((s, i) => (
            <span key={s} className="fl-cursor-host">
              <span className={`fm-ai-sug${i === 0 && t >= 16900 ? ' is-pressed' : ''}`}>{s}</span>
              {i === 0 && <Cursor on={t >= 16000 && t < 17400} click={t >= 16900 && t < 17150} />}
            </span>
          ))}
        </div>
      ) : (
        <div className="fm-ai-body">
          <span className="fm-ai-me">{SUGGEST[0]}</span>
          <span className="fm-ai-bot">
            <Typed text={`One invoice is past due: Orbit Infra's INV-0139 for ₹1,12,400, twelve days over. Nothing else is overdue, and ${IDS.inv} from Acme is paid.`} t={t} start={18000} cps={52} />
          </span>
        </div>
      )}
      <div className="fm-ai-in"><span className="fm-ph">Ask about Maks Ops…</span><Send size={14} /></div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  return beat.key === 'badges' ? <Badges t={t} /> : <Timeline t={t} />;
}
