import React from 'react';
import { MessageCircle, CheckCheck, Plus } from 'lucide-react';
import { MoMark } from '../../film/shell/marks';
import { CATALOGUE_URL, CUSTOMER, PRODUCT, QTY, SELLER, makeDay } from '../../data/transaction';
import { In, Lines, Thread, Rider, Cursor } from '../parts';
import { AppWin, Browser } from '../screens';
import { IDS, clickAt, typed, inr } from '../util';
import { Bracket } from '../art';

/* ══════════════════════════════════════════════════════════════════════
   Act 2 — the catalogue, and the enquiry it brings. (11.5–22 s)

   The bracket's card builds itself, large, in the middle of the frame —
   picture, name, price, minimum order, the button a customer presses —
   then the camera pulls back and it is one card of Precision Fab Works'
   catalogue, at its own address, shared on WhatsApp.

   Then the customer's side: Add to enquiry, Send enquiry, and the enquiry
   flies across into Maks Ops, where it lands at the top of the list and
   the menu counts it.
   ══════════════════════════════════════════════════════════════════════ */

const BROWSER = [150, 150, 840, 500];
const TILE_W = 250;
/* the hero tile's pull-back: from the middle of the frame, 1.55×, to its place */
const HERO_FROM = 'translate(337px, -16px) scale(1.55)';

const OTHERS = [
  { left: 296, name: 'Base Plate, 6 mm', price: '₹410', unit: 'nos', shape: 'plate' },
  { left: 564, name: 'Cable Tray, 300 mm', price: '₹1,180', unit: 'm', shape: 'tray' },
];

const CURSOR = [
  { at: 3300, x: 1100, y: 560 },
  clickAt(4300, 880, 219),            // Share on WhatsApp
  { at: 4800, x: 820, y: 520 },
  clickAt(6000, 193, 542),            // Add to enquiry
  clickAt(6900, 530, 470),            // Send enquiry
  { at: 7500, x: 640, y: 620 },
];
const FLY_LINK = 'M 880 219 C 960 150, 1090 200, 1132 318';
const FLY_ENQ = 'M 530 420 C 690 330, 860 250, 1006 300';

export default function Sell({ t }) {
  const bare = t < 2600;                 // only the bracket's card, large
  const aside = t >= 5500;               // the customer's side, moved over
  const enquired = t >= 8000;
  const day = makeDay();

  return (
    <div className="reel-act reel-sell">
      <Browser at={BROWSER} url={typed(CATALOGUE_URL, t, 3000, 38)}
        className={`reel-cat${bare ? ' is-bare' : ''}${aside ? ' is-aside' : ''}`}>
        <div className="reel-cat-head">
          <span className="reel-cat-logo">PF</span>
          <span><b>{SELLER.name}</b><small>Catalogue · {SELLER.city}</small></span>
          <In on={t >= 3900} fx="pop" className="reel-btn is-wa reel-cat-share">
            <MessageCircle size={14} /> Share on WhatsApp
          </In>
        </div>

        {/* the bracket: built large, then pulled back into the grid */}
        <div className="reel-tile is-hero" style={{ left: 28, top: 106, width: TILE_W, transform: bare ? HERO_FROM : 'none' }}>
          <In on={t >= 600} fx="zoom" className="reel-tile-art"><Bracket size={150} /></In>
          <In on={t >= 900} fx="left" className="reel-tile-name">{PRODUCT.name}</In>
          <In on={t >= 1200} fx="left" className="reel-tile-price">₹{inr(PRODUCT.rate)} <small>/ {PRODUCT.unit}</small></In>
          <In on={t >= 1500} fx="fade" className="reel-tile-meta">
            <span className="reel-chip">MOQ {PRODUCT.moq}</span><span className="reel-chip">{PRODUCT.leadTime}</span>
          </In>
          <In on={t >= 1800} fx="rise" className={`reel-btn reel-tile-btn${t >= 5480 && t < 6200 ? ' is-hot' : ''}`}>
            <Plus size={14} /> Add to enquiry
          </In>
        </div>
        {OTHERS.map((o) => (
          <div key={o.name} className="reel-tile" style={{ left: o.left, top: 106, width: TILE_W }}>
            <span className={`reel-tile-art is-${o.shape}`}><i /></span>
            <span className="reel-tile-name">{o.name}</span>
            <span className="reel-tile-price">{o.price} <small>/ {o.unit}</small></span>
            <span className="reel-btn is-ghost reel-tile-btn"><Plus size={14} /> Add to enquiry</span>
          </div>
        ))}
      </Browser>

      {/* shared: the link goes out, and arrives on WhatsApp */}
      <Lines><Thread d={FLY_LINK} on={t >= 4450} off={t >= 5500} dur={450} /></Lines>
      <Rider d={FLY_LINK} on={t >= 4450} dur={450} className={`reel-pill-fly${t >= 4950 ? ' is-landed' : ''}`}>
        <span className="reel-pill">maksops.co.in/c/…</span>
      </Rider>
      <In on={t >= 4850} off={aside} fx="pop" at={[1004, 262, 252, 178]} className="reel-wa">
        <span className="reel-wa-h"><MessageCircle size={14} /> WhatsApp</span>
        <span className="reel-wa-card">
          <span className="reel-wa-prev"><MoMark size={30} /><span><b>{SELLER.name}</b><small>{CATALOGUE_URL}</small></span></span>
          <span className="reel-wa-meta">Our catalogue — order online <CheckCheck size={14} /></span>
        </span>
      </In>

      {/* the customer's enquiry */}
      <In on={t >= 6250} off={t >= 7300} fx="pop" at={[380, 300, 300, 210]} className="reel-card reel-drawer">
        <b className="reel-drawer-h">Your enquiry</b>
        <span className="reel-drawer-row"><Bracket size={38} /> <span>{PRODUCT.name}</span><b className="reel-qty">{QTY}</b></span>
        <span className="reel-note">Brushed finish, 4 weeks</span>
        <span className={`reel-btn reel-drawer-send${t >= 6400 && t < 7000 ? ' is-hot' : ''}`}>Send enquiry</span>
      </In>
      <Lines><Thread d={FLY_ENQ} on={t >= 7100} dur={800} /></Lines>
      <Rider d={FLY_ENQ} on={t >= 7100} dur={800} className={`reel-packet${t >= 7980 ? ' is-landed' : ''}`}>
        <span className="reel-packet-in"><b>{IDS.enq}</b> {QTY} × {PRODUCT.name}</span>
      </Rider>

      {/* where it lands: Maks Ops */}
      <In on={aside} fx="right" at={[800, 170, 450, 430]} className="reel-app-host">
        <AppWin at={[0, 0, 450, 430]} active="marketing" badges={{ marketing: t >= 8200 ? 1 : 0 }} title="Enquiries"
          className={t >= 8200 ? 'is-pinged' : ''}>
          <div className="reel-rows">
            <In on={enquired} fx="drop" className="reel-row is-new">
              <span><b>{CUSTOMER.short}</b><small>{QTY} × {PRODUCT.name}</small></span>
              <span className="reel-chip tone-blue">New</span>
            </In>
            <div className="reel-row"><span><b>Orbit Infra</b><small>60 × Base Plate, 6 mm</small></span><span className="reel-chip">Quoted</span></div>
            <div className="reel-row"><span><b>Sunrise Projects</b><small>40 m Cable Tray</small></span><span className="reel-chip">Quoted</span></div>
            <div className="reel-row is-faint"><span><b>Deccan Builders</b><small>{day(-3)}</small></span><span className="reel-chip">Won</span></div>
          </div>
        </AppWin>
      </In>

      <Cursor t={t} path={CURSOR} until={8300} />
    </div>
  );
}
