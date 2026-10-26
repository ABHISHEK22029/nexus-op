import React from 'react';
import {
  FileText, ReceiptText, ShoppingCart, ShieldCheck, PackageCheck, Factory, Wallet, Users, Check, Lock, Sparkles,
  Bell, LayoutDashboard, Inbox, ClipboardList, Truck, BarChart3, TrendingUp, Receipt, Percent,
} from 'lucide-react';
import { MoMark } from '../../film/shell/marks';
import { canFor } from '../../film/data/roleViews';
import { In, Cursor } from '../parts';
import { clickAt, count, inr, typed } from '../util';

/* ══════════════════════════════════════════════════════════════════════
   Act 8 — the platform around the order. (73–86 s)

   Four quick beats, one card each:
     · roles: press a role and the card shows what that role may do — read
       from the backend's own role permissions (roles.snapshot.js);
     · Ask AI: a question typed, the answer written back;
     · reports: the totals count up and the months rise;
     · the menu: the bell rings and the counts arrive — what is waiting on
       somebody, in the app's own words.
   ══════════════════════════════════════════════════════════════════════ */

const ROLES = ['Owner', 'Sales', 'Procurement', 'Finance'];
const SWITCH = [500, 1300, 2100, 2900];
const CHIP_X = (i) => 276 + i * 186;
const CAPS = [
  ['Quotations', 'sales-quotations', FileText], ['Invoices', 'sales-invoices', ReceiptText],
  ['Purchase orders', 'po', ShoppingCart], ['Sign off purchase orders', 'po-approval', ShieldCheck],
  ['Goods receipt', 'grn', PackageCheck], ['Production', 'production', Factory],
  ['Expenses', 'expenses', Wallet], ['Team', 'users', Users],
];

const AI = 3500, NUMBERS = 7000, ALERTS = 10000;
const QUESTION = 'What’s overdue this week?';

const KPIS = [
  ['Total Sales Invoiced', TrendingUp, (t) => `₹${inr(Math.round(count(t, 7300, 1300, 0, 1394224)))}`],
  ['Receivables Outstanding', Receipt, (t) => `₹${inr(Math.round(count(t, 7400, 1300, 0, 333101)))}`],
  ['Operational Margin', Percent, (t) => `${Math.round(count(t, 7500, 1300, 0, 11))}%`],
];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const BARS = [38, 52, 46, 60, 68, 57, 74, 80, 72, 86, 91, 100];

const MENU = [
  ['Home', LayoutDashboard], ['Enquiries', Inbox, 2, 'info', 'not yet read', 10400],
  ['Quotations', FileText], ['Orders', ClipboardList],
  ['Purchase orders', ShoppingCart, 1, 'warn', 'awaiting approval', 10800],
  ['Delivery challans', Truck, 1, 'danger', 'missing an e-way bill', 11200],
  ['Invoices', ReceiptText], ['Reports', BarChart3],
];

const CURSOR = [{ at: 0, x: 240, y: 620 }, ...SWITCH.map((at, i) => clickAt(at, CHIP_X(i) + 85, 196)), { at: 3300, x: 1100, y: 640 }];

export default function Run({ t }) {
  let role = 0;
  SWITCH.forEach((at, i) => { if (t >= at) role = i; });
  const can = canFor(ROLES[role]);
  return (
    <div className="reel-act reel-run">
      {/* roles */}
      {ROLES.map((r, i) => (
        <In key={r} on={t >= 60 + i * 80} off={t >= AI} fx="drop" at={[CHIP_X(i), 168, 170, 56]}
          className={`reel-role${role === i && t >= SWITCH[0] ? ' is-active' : ''}`}>
          <span className="reel-role-av">{r[0]}</span>{r}
        </In>
      ))}
      <In on={t >= 300} off={t >= AI} fx="rise" at={[300, 250, 680, 320]} className="reel-card reel-caps-card">
        <span className="reel-caps-h">What <b key={ROLES[role]} className="reel-swap">{ROLES[role]}</b> can do</span>
        <span className="reel-caps-grid">
          {CAPS.map(([label, res, icon]) => {
            const Ico = icon;
            const yes = can(res, 'write');
            return (
              <span key={label} className={`reel-cap-row${yes ? ' is-yes' : ''}`}>
                <Ico size={16} /> {label} {yes ? <Check size={16} className="reel-cap-st" /> : <Lock size={14} className="reel-cap-st" />}
              </span>
            );
          })}
        </span>
      </In>

      {/* Ask AI */}
      <In on={t >= AI + 100} off={t >= NUMBERS} fx="rise" at={[340, 150, 600, 420]} className="reel-card reel-ai">
        <span className="reel-ai-h"><Sparkles size={17} /> Ask AI</span>
        <span className="reel-ai-q">{typed(QUESTION, t, AI + 400, 42)}<b className="reel-caret" /></span>
        <In on={t >= AI + 1800} fx="rise" className="reel-ai-a">
          <span>Two invoices are overdue:</span>
          <In on={t >= AI + 2000} fx="left" as="span" className="reel-ai-row"><b>INV-0139</b> Orbit Infra <em>₹64,900</em> <small>12 days</small></In>
          <In on={t >= AI + 2250} fx="left" as="span" className="reel-ai-row"><b>INV-0141</b> Sunrise Projects <em>₹38,350</em> <small>5 days</small></In>
        </In>
      </In>

      {/* the numbers */}
      {KPIS.map(([label, icon, val], i) => {
        const Ico = icon;
        return (
        <In key={label} on={t >= NUMBERS + 100 + i * 100} off={t >= ALERTS} fx="rise" at={[190 + i * 310, 168, 280, 132]} className="reel-card reel-kpi">
          <span className="reel-kpi-h"><Ico size={15} /> {label}</span>
          <b className="reel-kpi-v">{val(t)}</b>
        </In>
        );
      })}
      <In on={t >= NUMBERS + 300} off={t >= ALERTS} fx="rise" at={[190, 320, 900, 260]} className="reel-card reel-chart">
        {BARS.map((h, i) => (
          <span key={MONTHS[i]} className="reel-bar-col">
            <i style={{ transform: `scaleY(${t >= NUMBERS + 600 + i * 70 ? h / 100 : 0.02})` }} className={i === 11 ? 'is-last' : ''} />
            <small>{MONTHS[i]}</small>
          </span>
        ))}
      </In>

      {/* what is waiting on somebody */}
      <In on={t >= ALERTS + 50} fx="rise" at={[430, 136, 400, 476]} className="reel-card reel-menu">
        <span className="reel-menu-h"><MoMark size={26} /> <b>Maks Ops</b><Bell size={18} className={`reel-bell${t >= ALERTS + 250 ? ' is-ring' : ''}`} /></span>
        {MENU.map(([label, icon, n, tone, , at]) => {
          const Ico = icon;
          return (
          <span key={label} className="reel-menu-row">
            <Ico size={16} /> {label}
            {n ? <In on={t >= at} fx="pop" as="b" className={`reel-menu-badge tone-${tone}`}>{n}</In> : null}
          </span>
          );
        })}
      </In>
      {MENU.filter((m) => m[2]).map(([label, , n, tone, hint, at]) => (
        <In key={label} on={t >= at + 100} fx="left" at={[850, 136 + 66 + 5 + MENU.findIndex((m) => m[0] === label) * 48, 260, 38]}
          className={`reel-hint tone-${tone}`}>
          {n} {hint}
        </In>
      ))}

      <Cursor t={t} path={CURSOR} until={3500} />
    </div>
  );
}
