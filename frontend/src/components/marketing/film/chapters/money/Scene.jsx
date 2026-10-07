import React from 'react';
import { Wallet, Zap, Play, Pause, BarChart3, Download, ReceiptText } from 'lucide-react';
import { Show, Typed, Cursor, Pill, Count } from '../../../flow/kit';
import { ScreenHead } from '../../shell/screen';
import { rupee } from '../../shell/format';

/* 15 — Expenses (MasterList: Date, Category, Description, Paid To, Mode,
   Amount), Automation's recurring schedules ("Expense we pay" / "Invoice
   we bill", Create schedule, Run now) and Reports & Export. */
export const Icon = Wallet;

const EXPENSES = [
  ['09 Nov', 'Labour / Wages', 'Loading crew, 2 days', 'Daily wages', 'Cash', 3600],
  ['08 Nov', 'Freight / Transport', 'Freight — Acme dispatch', 'VRL Logistics', 'Bank', 4200],
  ['06 Nov', 'Diesel / Fuel', 'Diesel for the DG set', 'HP Petro Point', 'UPI', 6800],
  ['04 Nov', 'Utilities', 'Electricity — factory shed', 'TGSPDCL', 'Bank', 18420],
  ['01 Nov', 'Other', 'Factory rent — Cherlapally shed', 'Sri Sai Estates', 'Bank', 65000],
];
const EXPENSE_TOTAL = EXPENSES.reduce((s, e) => s + e[5], 0);

function Expenses({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={Wallet} title="Expenses" sub="Off-PO costs — diesel, labour, freight, equipment hire, petty cash." />
      <div className="fm-card fm-sumbar"><span>Total Recorded Spend</span><b>{rupee(EXPENSE_TOTAL)}</b></div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-exp"><span>Date</span><span>Category</span><span>Description</span><span>Paid To</span><span>Mode</span><span>Amount</span></div>
        {EXPENSES.map((e, i) => (
          <Show key={e[2]} on={t >= 400 + (EXPENSES.length - 1 - i) * 450} className={`fm-tr fm-tr-exp${i === 0 ? ' is-new' : ''}`}>
            <span className="fm-muted">{e[0]}</span><span>{e[1]}</span><span><b>{e[2]}</b></span><span>{e[3]}</span><span>{e[4]}</span><span className="fm-mono-b">{rupee(e[5])}</span>
          </Show>
        ))}
      </div>
    </div>
  );
}

function Recurring({ t }) {
  const made = t >= 11300;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Zap} title="Automation" sub="Rules that run themselves — approvals, recurring bills, and reminders. No scripting." />
      <div className="fm-card">
        <b className="fm-card-h">Recurring bills</b>
        <p className="fm-muted fm-modal-p">Auto-create the bills you raise or pay on a cadence — monthly retainers/AMC invoices, rent, subscriptions. Maks Ops generates them on the schedule and notifies you.</p>
        <div className="fm-sh-actions">
          <span className="fm-chip is-on">Expense we pay</span><span className="fm-chip">Invoice we bill</span>
        </div>
        <div className="fm-rec-form">
          <label className="fm-pf-field"><small>Title</small><span className="fm-input is-app"><Typed text="Factory rent — Cherlapally shed" t={t} start={7200} cps={30} /></span></label>
          <label className="fm-pf-field"><small>Amount</small><span className="fm-input is-app"><Typed text="65000" t={t} start={8400} cps={10} /></span></label>
          <label className="fm-pf-field"><small>Frequency</small><span className="fm-input is-app is-select">Monthly</span></label>
          <label className="fm-pf-field"><small>First run date *</small><span className="fm-input is-app">01 Dec 2026</span></label>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 10900 && t < 11150 ? ' is-pressed' : ''}`}>Create schedule</span>
            <Cursor on={t >= 10000 && t < 11500} click={t >= 10900 && t < 11150} />
          </span>
        </div>
      </div>
      <div className="fm-table">
        <div className="fm-tr is-head fm-tr-rec"><span>Schedule</span><span>Every</span><span>Next</span><span>Amount</span><span /></div>
        {made && (
          <Show on className="fm-tr fm-tr-rec is-new">
            <span><b>Factory rent — Cherlapally shed</b><small className="fm-muted"> · expense</small></span><span>Monthly</span><span>01 Dec 2026</span><span className="fm-mono-b">₹65,000</span>
            <span className="fm-sh-actions"><span className="fl-btn"><Play size={12} /> Run now</span><span className="fl-btn"><Pause size={12} /></span></span>
          </Show>
        )}
        <div className="fm-tr fm-tr-rec">
          <span><b>AMC — Orbit Infra cranes</b><small className="fm-muted"> · invoice</small></span><span>Monthly</span><span>15 Nov 2026</span><span className="fm-mono-b">₹42,000</span>
          <span><Pill tone="ok" dot>Active</Pill></span>
        </div>
      </div>
    </div>
  );
}

function Reports({ t }) {
  return (
    <div className="fm-screen">
      <ScreenHead icon={BarChart3} title="Reports & Export" sub="A live snapshot of the business, and one-click CSV/Excel export of every register." />
      <div className="fm-rep">
        {[['Total Sales Invoiced', 1528400], ['Receivables Outstanding', 412700], ['Purchase Bills', 602850], ['Expenses', EXPENSE_TOTAL]].map(([k, v], i) => (
          <div key={k} className="fm-card"><small className="fm-sec-label">{k}</small><b className="fm-big"><Count to={v} t={t} start={13900 + i * 200} dur={1100} fmt={(n) => rupee(Math.round(n))} /></b></div>
        ))}
        <div className="fm-card fm-rep-margin"><small className="fm-sec-label">Operational Margin</small><b className="fm-big is-ok"><Count to={827530} t={t} start={14800} dur={1200} fmt={(n) => rupee(Math.round(n))} /></b><em>54.1% of invoiced</em></div>
      </div>
      <div className="fm-card fm-export">
        <b className="fm-card-h"><Download size={15} /> Export registers</b>
        <div className="fm-sh-actions">
          {['Sales Invoices', 'Quotations', 'Customer Orders', 'Customers', 'Vendors', 'Raw Materials', 'Expenses'].map((r, i) => (
            <Show key={r} on={t >= 16200 + i * 180} as="span" className="fl-btn"><ReceiptText size={12} /> {r}</Show>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'expenses') return <Expenses t={t} />;
  if (beat.key === 'recurring') return <Recurring t={t} />;
  return <Reports t={t} />;
}
