import React from 'react';
import { BarChart3, Bell } from 'lucide-react';
import { Count } from '../../flow/kit';
import { MODULES } from '../../../../lib/navigation';
import AppShell from '../../film/shell/AppShell';
import { ScreenHead } from '../../film/shell/screen';
import { rupee } from '../../film/shell/format';
import { Win } from '../parts';

/* ══════════════════════════════════════════════════════════════════════
   Act 7 — the whole operation. (49.5–52.5 s; from 49.5 s)

   The owner's view: Reports & Export's live snapshot (the same figures
   the product film's Money chapter shows, so the two never disagree),
   and what is waiting on someone — the menu's own badges, by their own
   titles from lib/navigation.js. The window settles from slightly close
   to its place, a small pull-back into the overview.
   ══════════════════════════════════════════════════════════════════════ */

const WIN = { wide: [140, 140, 1000, 548], narrow: [10, 112, 400, 592] };

const FIGURES = [
  ['Total Sales Invoiced', 1528400],
  ['Receivables Outstanding', 412700],
  ['Purchase Bills', 602850],
  ['Expenses', 98020],
];
const MARGIN = FIGURES[0][1] - FIGURES[2][1] - FIGURES[3][1];        // 8,27,530

/* what is waiting, by the menu's own badge titles */
const WAITING = [['/purchase-orders', 1], ['/quotations', 2], ['/enquiries', 1]].map(([path, n]) => {
  const item = MODULES.flatMap((m) => m.items).find((i) => i.path === path);
  return { label: item.label, title: item.badge.title, tone: item.badge.tone, n };
});

export default function Overview({ t, layout }) {
  return (
    <div className={`ad-act ad-overview is-${layout}`}>
      <Win at={WIN[layout]} className={`ad-ov-win${t >= 60 ? ' is-settled' : ''}`}>
        <AppShell path="/reports" layout={layout}>
          <div className="fm-screen">
            <ScreenHead icon={BarChart3} title="Reports & Export" sub="A live snapshot of the business, and one-click CSV/Excel export of every register." />
            <div className="ad-ov-figs">
              {FIGURES.map(([k, v], i) => (
                <div key={k} className="fm-card"><small className="fm-sec-label">{k}</small>
                  <b className="ad-ov-big"><Count to={v} t={t} start={200 + i * 120} dur={900} fmt={(n) => rupee(Math.round(n))} /></b>
                </div>
              ))}
              <div className="fm-card ad-ov-margin"><small className="fm-sec-label">Operational Margin</small>
                <b className="ad-ov-big is-ok"><Count to={MARGIN} t={t} start={700} dur={1000} fmt={(n) => rupee(Math.round(n))} /></b>
              </div>
            </div>
            <div className={`fm-card ad-ov-wait${t >= 1300 ? ' is-on' : ''}`}>
              <b className="fm-card-h"><Bell size={15} /> Waiting on someone</b>
              {WAITING.map((w, i) => (
                <span key={w.label} className="ad-ov-row" style={{ '--i': i }}>
                  <em className={`fm-badge tone-${w.tone}`}>{w.n}</em><b>{w.label}</b><span className="fm-muted">{w.title}</span>
                </span>
              ))}
            </div>
          </div>
        </AppShell>
      </Win>
    </div>
  );
}
