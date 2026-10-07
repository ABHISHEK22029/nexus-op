import React from 'react';
import {
  AlertTriangle, CheckCircle2, Sparkles, Upload, FileSpreadsheet, FileText, FileType, ShoppingCart, PackageCheck, Check,
} from 'lucide-react';
import { Show, Count, Pill, Cursor } from '../../flow/kit';
import { IDS } from '../../flow/story';
import {
  QTY, MATERIAL, STOCK, VENDORS, PO_VALUE, APPROVAL_THRESHOLD,
} from '../../data/transaction';
import { rupee } from '../../film/shell/format';
import { Lines, Thread } from '../parts';
import { box } from '../geo';
import OrderCard from './OrderCard';

/* ══════════════════════════════════════════════════════════════════════
   Act 3 — Smart Inventory, and buying what is short. (19–36.5 s; times
   here are from 19 s.) The hero of the ad.

   The point is not that Maks Ops has stock numbers — every system does.
   It is that it reasons from the order to an answer, and shows its work:

     0.5   each bracket takes 2.5 kg of SS304 sheet       (bill of materials)
     1.4   so 120 take 300 kg
     2.3   other open orders want 23 kg more
     3.2   323 kg needed in all
     4.1   143 kg in stock
     4.8   the gap, as a gauge: 143 held, 180 short
     5.4   and what that means: the stock is poured into the 120 brackets
           and runs out at the 57th
     6.5   OrderReadiness' own sentence: "Can build 57 of 120 — blocked by
           SS304 sheet, 2 mm"
     7.5   the shortfall, 180 kg, goes on to buying

   9–14    the board steps aside; three vendors' quotes are uploaded, read,
           and set side by side; Deccan is lowest like for like; Raise PO;
           the PO is over the ₹40,000 limit, so it needs sign-off — and
           gets it.
   14–17.5 the board returns: GRN-00031 brings the 180 kg in, the gauge
           closes, the other 63 brackets fill, and the sentence turns to
           "All 120 can be built with stock on hand".

   Every number is the transaction's (data/transaction.js), and checked
   to add up by check-film.mjs.
   ══════════════════════════════════════════════════════════════════════ */

const ORDER_KG = QTY * MATERIAL.perPiece;               // 300
const OTHERS_KG = STOCK.needed - ORDER_KG;              // 23
const STOCK_SHARE = STOCK.onHand / STOCK.needed;        // 0.443

const L = {
  wide: {
    eyebrow: [480, 154], node: 456,
    rows: (i) => [480, 190 + i * 52, 340, 44],
    gauge: [480, 466, 340, 70], grid: [870, 190, 330, 300], verdict: [480, 560, 720, 54], short: [480, 626, 720, 52],
    cell: 20, gap: 4, cols: 12,
    spine: [
      'M 380 250 C 420 250, 430 212, 456 212', 'M 456 212 L 456 264', 'M 456 264 L 456 316', 'M 456 316 L 456 368',
      'M 456 368 L 456 420', 'M 456 420 L 456 501', 'M 456 501 L 456 587', 'M 456 587 L 456 652',
    ],
    feed: 'M 820 501 C 846 501, 846 340, 870 340',
    vendor: { head: [620, 150, 600, 40], file: (i) => [620, 206 + i * 58, 600, 48], table: [620, 206, 600, 238], po: [620, 466, 600, 156] },
    toVendor: 'M 578 391 C 600 391, 596 170, 620 170',
    toPo: 'M 1222 330 C 1252 330, 1252 520, 1222 520',
  },
  narrow: {
    eyebrow: [40, 180], node: 26,
    rows: (i) => [40, 200 + i * 30, 364, 28],
    gauge: [40, 354, 364, 56], grid: [40, 418, 364, 186], verdict: [40, 608, 364, 44], short: [40, 658, 364, 44],
    cell: 13, gap: 3, cols: 20,
    spine: [
      'M 26 172 L 26 214', 'M 26 214 L 26 244', 'M 26 244 L 26 274', 'M 26 274 L 26 304',
      'M 26 304 L 26 334', 'M 26 334 L 26 382', 'M 26 382 L 26 630', 'M 26 630 L 26 680',
    ],
    feed: null,
    vendor: { head: [16, 112, 388, 40], file: (i) => [16 + i * 130, 166, 122, 100], table: [16, 282, 388, 200], po: [16, 500, 388, 156] },
    toVendor: null, toPo: null,
  },
};

/* when each step of the reasoning lands */
const AT = { rows: [500, 1400, 2300, 3200, 4100], gauge: 4800, pour: 5400, verdict: 6500, short: 7500 };
const RAIL = 9000, BACK = 14000;

const KIND = { excel: FileSpreadsheet, pdf: FileText, word: FileType };

function Trace({ t, l }) {
  const rows = [
    ['Each bracket uses', <>{MATERIAL.perPiece} kg <em>{MATERIAL.name.split(',')[0]}</em></>],
    [`For ${QTY} brackets`, <><Count to={ORDER_KG} t={t} start={AT.rows[1] + 150} dur={600} /> kg</>],
    ['Other open orders', <>+ {OTHERS_KG} kg</>],
    ['Needed in all', <b className="ad-strong">{STOCK.needed} kg</b>],
    ['In stock now', t >= BACK + 900
      ? <><Count to={STOCK.after} from={STOCK.onHand} t={t} start={BACK + 900} dur={800} /> kg</>
      : <><Count to={STOCK.onHand} t={t} start={AT.rows[4] + 150} dur={600} /> kg</>],
  ];
  return rows.map(([label, value], i) => (
    <div key={label} className={`ad-trace${t >= AT.rows[i] ? ' is-on' : ''}${i === 3 ? ' is-key' : ''}`} style={box(l.rows(i))}>
      <span>{label}</span><span className="ad-trace-v">{value}</span>
    </div>
  ));
}

function Gauge({ t, l }) {
  const back = t >= BACK + 800;
  return (
    <div className={`ad-gauge${t >= AT.gauge ? ' is-on' : ''}${back ? ' is-filled' : ''}`} style={{ ...box(l.gauge), '--share': STOCK_SHARE }}>
      <div className="ad-gauge-track">
        <span className="ad-gauge-have" />
        <span className="ad-gauge-gap" />
      </div>
      <div className="ad-gauge-labels">
        <span><b>{back ? <Count to={STOCK.after} from={STOCK.onHand} t={t} start={BACK + 900} dur={800} /> : STOCK.onHand} kg</b> in stock</span>
        <span className={back ? 'is-ok' : 'is-short'}>{back ? `+${STOCK.short} kg received` : `${STOCK.short} kg short`}</span>
      </div>
    </div>
  );
}

function Capacity({ t, l, layout }) {
  const short = t >= AT.verdict - 100;
  const refill = t >= BACK + 1200;
  const built = refill ? QTY : STOCK.buildable;
  const cells = [];
  for (let i = 0; i < QTY; i++) {
    const first = i < STOCK.buildable;
    const on = first ? t >= AT.pour + i * 18 : refill && t >= BACK + 1200 + (i - STOCK.buildable) * 14;
    cells.push(<i key={i} className={`${on ? (first ? 'is-on' : 'is-in') : ''}${!first && short && !on ? ' is-short' : ''}`} />);
  }
  return (
    <div className={`ad-fill is-${layout}${t >= AT.pour - 300 ? ' is-on' : ''}`} style={{ ...box(l.grid), '--cell': `${l.cell}px`, '--gap': `${l.gap}px`, '--cols': l.cols }}>
      <span className="ad-fill-h">
        <span>What the stock will build</span>
        <b className={refill ? 'is-ok' : short ? 'is-short' : ''}>{t >= AT.pour ? (refill ? built : <Count to={STOCK.buildable} t={t} start={AT.pour} dur={1030} />) : 0} of {QTY}</b>
      </span>
      <span className="ad-cells-grid">{cells}</span>
    </div>
  );
}

function Verdict({ t, l }) {
  const ready = t >= BACK + 2300;
  return (
    <div className={`ad-verdict${t >= AT.verdict ? ' is-on' : ''}${ready ? ' is-ready' : ''}`} style={box(l.verdict)}>
      {ready ? (
        <span className="ad-verdict-in fl-enter-soft"><CheckCircle2 size={18} /> All {QTY} can be built with stock on hand <Pill tone="ok" dot>Ready</Pill></span>
      ) : (
        <span className="ad-verdict-in"><AlertTriangle size={18} /> Can build <em>{STOCK.buildable} of {QTY}</em> — blocked by <em>{MATERIAL.name}</em></span>
      )}
    </div>
  );
}

function Shortfall({ t, l }) {
  const grn = t >= BACK + 300;
  return (
    <div className={`ad-short${t >= AT.short ? ' is-on' : ''}${grn ? ' is-grn' : ''}`} style={box(l.short)}>
      {grn ? (
        <span className="ad-short-in fl-enter">
          <PackageCheck size={16} /> <b className="fm-mono-b">{IDS.grn}</b> {STOCK.short} kg {MATERIAL.name} from Deccan Metals <span className="ad-ok"><Check size={13} /> Received</span>
        </span>
      ) : (
        <span className="ad-short-in"><b>{STOCK.short} kg short</b> → to order {STOCK.short} kg of {MATERIAL.name}</span>
      )}
    </div>
  );
}

function Vendors({ t, l, layout }) {
  const v = l.vendor;
  const table = t >= 10850;
  const best = t >= 11400;
  const po = t >= 12400;
  const signed = t >= 13200;
  const lowest = Math.min(...VENDORS.map((x) => x.rate));
  return (
    <div className={`ad-vendors is-${layout}${t >= BACK ? ' is-out' : ''}`}>
      <div className="ad-v-head" style={box(v.head)}>
        <span><ShoppingCart size={15} /> <b>Vendor quotes</b> · {layout === 'narrow' ? `${STOCK.short} kg` : `${MATERIAL.name}, ${STOCK.short} kg`}</span>
        <span className="fl-cursor-host is-inline">
          <span className={`fl-btn primary${t >= 9550 && t < 9750 ? ' is-pressed' : ''}`}><Upload size={13} /> Upload quotation</span>
          <Cursor on={t >= 9150 && t < 9850} click={t >= 9550 && t < 9750} />
        </span>
      </div>
      {!table && VENDORS.map((x, i) => {
        const Ico = KIND[x.kind];
        const read = t >= 10250 + i * 160;
        return (
          <div key={x.name} className={`ad-file${t >= 9850 + i * 150 ? ' is-on' : ''}${read ? ' is-read' : ''}`} style={box(v.file(i))}>
            <Ico size={layout === 'narrow' ? 18 : 16} />
            <span className="ad-file-main"><b>{x.file}</b><small>{x.name}</small></span>
            <span className="ad-file-state">{read ? <><Check size={12} /> Read</> : 'Reading…'}</span>
            <i className="ad-scan" />
          </div>
        );
      })}
      {table && (
        <div className="ad-cmp fl-enter-soft" style={box(v.table)}>
          <span className="ad-cmp-h"><b>Side by side</b><small>{MATERIAL.name} · {STOCK.short} kg</small></span>
          <div className="fm-table">
            <div className="fm-tr is-head ad-tr-v"><span>Vendor</span><span>Rate / kg</span><span>For {STOCK.short} kg</span><span /></div>
            {VENDORS.map((x) => (
              <div key={x.name} className={`fm-tr ad-tr-v${x.best && best ? ' is-best' : ''}`}>
                <span><b>{x.name}</b>{x.best && best && <em className="fm-lowest">Lowest like for like</em>}</span>
                <span className="fm-mono-b">{rupee(x.rate)}</span>
                <span className="fm-mono-b">{rupee(x.rate * STOCK.short)}</span>
                <span className="ad-tr-act">
                  {x.best ? (
                    <span className="fl-cursor-host is-inline">
                      <span className={`fl-btn primary${t >= 12100 && t < 12300 ? ' is-pressed' : ''}`}>{po ? <><Check size={12} /> Raised</> : 'Raise PO'}</span>
                      <Cursor on={t >= 11600 && t < 12500} click={t >= 12100 && t < 12300} />
                    </span>
                  ) : <small className="fm-muted">+{rupee((x.rate - lowest) * STOCK.short)}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {po && (
        <div className="ad-po fl-enter" style={box(v.po)}>
          <span className="ad-po-h"><small>Purchase order</small><b className="fm-mono-b">{IDS.po}</b>
            {signed ? <Pill tone="ok" dot>Signed off · Finance</Pill> : <Pill tone="amber" dot>Needs sign-off</Pill>}
          </span>
          <span className="ad-po-l"><span>Deccan Metals · {STOCK.short} kg × {rupee(lowest)}</span><b>{rupee(PO_VALUE)}</b></span>
          <small className="fm-muted">Over the {rupee(APPROVAL_THRESHOLD)} limit, so Finance signs it off before it goes.</small>
        </div>
      )}
    </div>
  );
}

export default function Supply({ t, layout }) {
  const l = L[layout];
  const railed = t >= RAIL && t < BACK;
  const steps = [AT.rows[0], AT.rows[1], AT.rows[2], AT.rows[3], AT.rows[4], AT.gauge, AT.verdict, AT.short];
  return (
    <div className={`ad-act ad-supply is-${layout}`}>
      <div className={`ad-board is-${layout}${railed ? ' is-rail' : ''}`}>
        <OrderCard layout={layout} />
        <span className={`ad-eyebrow${t >= 200 ? ' is-on' : ''}`} style={{ left: l.eyebrow[0], top: l.eyebrow[1] }}>
          <Sparkles size={12} /> Smart Inventory
        </span>
        <Lines layout={layout}>
          {l.spine.map((d, i) => <Thread key={d} d={d} on={t >= steps[i] - 250} dur={320} />)}
          {l.feed && <Thread d={l.feed} on={t >= AT.pour - 200} dur={420} />}
          {l.spine.map((d, i) => {
            const y = Number(d.split(' ').pop());
            return <circle key={`n${d}`} className={`ad-node${t >= steps[i] ? ' is-on' : ''}`} cx={l.node} cy={y} r="5" />;
          })}
        </Lines>
        <Trace t={t} l={l} />
        <Gauge t={t} l={l} />
        <Capacity t={t} l={l} layout={layout} />
        <Verdict t={t} l={l} />
        <Shortfall t={t} l={l} />
      </div>

      {t >= RAIL - 100 && t < BACK + 700 && <Vendors t={t} l={l} layout={layout} />}
      {l.toVendor && (
        <Lines layout={layout}>
          <Thread d={l.toVendor} on={railed && t >= RAIL + 600} dur={500} />
          <Thread d={l.toPo} on={railed && t >= 12300} dur={450} />
        </Lines>
      )}
    </div>
  );
}
