import React from 'react';
import { ShoppingCart, BadgeCheck, ShieldCheck, Upload } from 'lucide-react';
import { MATERIAL, STOCK, VENDORS, PO_VALUE, APPROVAL_THRESHOLD } from '../../data/transaction';
import { In, Cursor } from '../parts';
import { OrderCard } from '../screens';
import { IDS, clickAt, count, inr } from '../util';
import { FileIcon } from '../art';

/* ══════════════════════════════════════════════════════════════════════
   Act 4 — what to buy, from whom, signed off. (34.5–49.5 s)

   The order sits where act 3 left it. Beside it the shortfall measures
   itself: needed, in stock, short — the short bar glowing red — and one
   button raises the purchase orders.

   Three vendors' quotes drop in as they arrived, an Excel, a PDF and a
   Word file; a scan reads them, and they stand up as three columns, the
   lowest rising out of the line. Raise PO; the purchase order lands, over
   the limit, so it needs sign-off; Finance signs it off.
   ══════════════════════════════════════════════════════════════════════ */

const DROP = 4000;          // the vendors' files
const COLUMNS = 6000;       // read, and stood up side by side
const BEST = 7000;          // the lowest rises
const PO = 9000;            // the purchase order lands
const SIGNED = 12900;       // Finance signs it off

const KIND = { excel: 'xlsx', pdf: 'pdf', word: 'docx' };
const SHORT_NAMES = { 'Apex Steel Traders': 'Apex Steel', 'Deccan Metals': 'Deccan Metals', 'Sunrise Alloys': 'Sunrise Alloys' };

const CURSOR = [
  { at: 2300, x: 900, y: 660 },
  clickAt(3200, 1086, 503),         // Raise purchase orders
  { at: 3800, x: 1160, y: 640 },
  clickAt(8700, 640, 452),          // Raise PO
  { at: 9300, x: 1000, y: 640 },
  clickAt(12600, 790, 444),         // Sign off
  { at: 13300, x: 1100, y: 650 },
];

export default function Source({ t }) {
  const bar = (on, frac) => ({ transform: `scaleX(${on ? frac : 0})` });
  const leaving = t >= DROP;
  return (
    <div className="reel-act reel-source">
      <In on fx="fade" off={leaving} className="reel-order-host" at={[64, 160, 380, 226]}>
        <OrderCard at={[0, 0, 380, 226]} state="short" />
      </In>

      {/* the shortfall */}
      <In on={t >= 100} off={leaving} fx="right" at={[480, 160, 736, 290]} className="reel-card reel-need">
        <span className="reel-need-h"><span className="reel-eyebrow">Material requirements</span><b>{MATERIAL.name}</b></span>
        {[
          ['Needed for open orders', STOCK.needed, 1, 'slate', 400],
          ['In stock', STOCK.onHand, STOCK.onHand / STOCK.needed, 'blue', 900],
          ['Short', STOCK.short, STOCK.short / STOCK.needed, 'red', 1400],
        ].map(([label, kg, frac, tone, at]) => (
          <span key={label} className={`reel-need-row tone-${tone}${t >= at + 900 && tone === 'red' ? ' is-glow' : ''}`}>
            <span>{label}</span>
            <span className="reel-need-track"><i style={bar(t >= at, frac)} /></span>
            <b>{inr(Math.round(count(t, at, 900, 0, kg)))} kg</b>
          </span>
        ))}
      </In>
      <In on={t >= 2600} off={leaving} fx="pop" at={[956, 480, 260, 46]}
        className={`reel-btn is-big${t >= 2700 && t < 3260 ? ' is-hot' : ''}`}>
        <ShoppingCart size={15} /> Raise purchase orders
      </In>

      {/* the vendors' quotes, as they came */}
      <In on={t >= DROP} off={t >= COLUMNS} fx="pop" at={[390, 160, 500, 360]} className="reel-drop">
        <span className="reel-drop-h"><Upload size={15} /> Vendor quotes</span>
        {VENDORS.map((v, i) => (
          <In key={v.name} on={t >= DROP + 300 + i * 300} fx="drop" className="reel-file" style={{ left: 50 + i * 140, top: 96 }}>
            <FileIcon kind={KIND[v.kind]} size={64} />
            <small>{v.file}</small>
          </In>
        ))}
        <i className={`reel-scan${t >= 5300 ? ' is-on' : ''}`} />
      </In>

      {/* read, and side by side */}
      {VENDORS.map((v, i) => {
        const best = v.best && t >= BEST;
        return (
          <In key={v.name} on={t >= COLUMNS} off={t >= PO} fx="rise" d={i * 120} at={[200 + i * 305, 172, 270, 330]}
            className={`reel-card reel-vq${best ? ' is-best' : ''}${t >= BEST && !v.best ? ' is-dim' : ''}`}>
            {best && <span className="reel-vq-badge"><BadgeCheck size={14} /> Lowest like for like</span>}
            <span className="reel-vq-file"><FileIcon kind={KIND[v.kind]} size={26} /> {v.file}</span>
            <b className="reel-vq-name">{SHORT_NAMES[v.name]}</b>
            <span className="reel-vq-rate">₹{v.rate}<small> / kg</small></span>
            <span className="reel-muted">{STOCK.short} kg · ₹{inr(v.rate * STOCK.short)}</span>
            {v.best && <In on={t >= 7600} fx="rise" className={`reel-btn reel-vq-po${t >= 8180 && t < 8760 ? ' is-hot' : ''}`}>Raise PO</In>}
          </In>
        );
      })}

      {/* the purchase order, and its sign-off */}
      <In on={t >= PO} fx="pop" at={[400, 168, 480, 320]} className="reel-card reel-po">
        <span className="reel-eyebrow">Purchase order</span>
        <b className="reel-id is-big">{IDS.po}</b>
        <span className="reel-po-who">{VENDORS[1].name}</span>
        <span className="reel-muted">{MATERIAL.name} · {STOCK.short} kg × ₹260</span>
        <span className="reel-po-amt">₹{inr(PO_VALUE)}</span>
        <In on={t >= 9800} fx="left" as="span" className="reel-po-rule">
          Over ₹{inr(APPROVAL_THRESHOLD)}, so it waits for sign-off
        </In>
        <span className="reel-po-foot">
          <span className={`reel-chip ${t >= SIGNED ? 'tone-green' : 'tone-amber is-pulse'}`}>{t >= SIGNED ? 'Approved' : 'Needs sign-off'}</span>
          <In on={t >= 11900} fx="pop" as="span" className={`reel-btn is-green${t >= 12080 && t < 12660 ? ' is-hot' : ''}`}><ShieldCheck size={14} /> Sign off</In>
        </span>
        <In on={t >= SIGNED} fx="stamp" className="reel-stamp tone-green" style={{ left: 250, top: 60 }}>Signed off</In>
      </In>
      <In on={t >= 11800} fx="right" at={[930, 214, 200, 64]} className="reel-who">
        <span className="reel-who-av">F</span><span><b>Finance</b><small>can sign off</small></span>
      </In>

      <Cursor t={t} path={CURSOR} until={13800} />
    </div>
  );
}
