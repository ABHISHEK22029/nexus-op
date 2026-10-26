import React from 'react';
import {
  Store, Inbox, FileText, ClipboardList, Boxes, Scale, ShoppingCart, PackageCheck, Factory, Truck, ReceiptText,
  BarChart3, Users, Sparkles,
} from 'lucide-react';
import { MoMark } from '../../film/shell/marks';
import { Burst } from '../parts';

/* ══════════════════════════════════════════════════════════════════════
   Act 9 — everything, and the close. (86–92 s)

   Everything the ad showed, at once: fourteen tiles snap into a grid in a
   wave. Then they are drawn into the middle, the mark bursts out of them,
   and the line the ad has been earning arrives — From catalogue to cash —
   with the one button (ProductAd lays the real link over the canvas).
   ══════════════════════════════════════════════════════════════════════ */

const TILES = [
  ['Catalogue', Store], ['Enquiries', Inbox], ['Quotations', FileText], ['Orders', ClipboardList],
  ['Smart inventory', Boxes], ['Vendor quotes', Scale], ['Purchase orders', ShoppingCart],
  ['Goods receipt', PackageCheck], ['Production', Factory], ['Delivery', Truck], ['Invoices & GST', ReceiptText],
  ['Reports', BarChart3], ['Team & roles', Users], ['Ask AI', Sparkles],
].map((tile, i) => [...tile, i]);
const MX = 640, MY = 232;
const GATHER = 2500;        // the tiles are drawn in
const MARK = 3100;          // the mark bursts out

export default function Finale({ t }) {
  return (
    <div className="reel-act reel-finale">
      {TILES.map(([label, icon, i]) => {
        const Ico = icon;
        const c = i % 7, r = Math.floor(i / 7);
        const left = 73 + c * 164, top = 172 + r * 106;
        return (
          <div key={label}
            className={`reel-tile2${t >= 80 + (c + r) * 55 ? ' is-on' : ''}${t >= GATHER ? ' is-gone' : ''}`}
            style={{ left, top, '--pull': `translate(${MX - (left + 75)}px, ${MY - (top + 46)}px) scale(0.1)`, '--pd': `${(6 - c) * 22}ms` }}>
            <Ico size={22} />
            <span>{label}</span>
          </div>
        );
      })}

      <div className={`reel-end-mark${t >= MARK ? ' is-on' : ''}`} style={{ left: MX, top: MY }}>
        <span className="reel-end-burst"><Burst on={t >= MARK} n={22} size={300} /></span>
        <MoMark size={104} />
      </div>
      <h3 className={`reel-end-title${t >= 3500 ? ' is-on' : ''}`}>
        From catalogue <span>to cash.</span>
      </h3>
      <p className={`reel-end-sub${t >= 3900 ? ' is-on' : ''}`}>Run your business, not your spreadsheets.</p>
      <p className={`reel-end-url${t >= 4500 ? ' is-on' : ''}`}>maksops.co.in</p>
    </div>
  );
}
