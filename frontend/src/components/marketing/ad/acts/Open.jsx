import React from 'react';
import { FileSpreadsheet, Mail, FileText, MessageSquare, ClipboardList, ReceiptText, StickyNote } from 'lucide-react';
import { MoMark } from '../../film/shell/marks';
import { Lines, Thread, Rider } from '../parts';
import { pick, box } from '../geo';

/* ══════════════════════════════════════════════════════════════════════
   Act 1 — before, and Maks Ops. (0–7 s)

   The day as it is: a spreadsheet, a mail thread, a vendor's PDF, a
   chat, a stock note, a job card, an invoice draft — each about the same
   order, none of them aware of the others. They drift; the words say what
   that costs. Then everything stops, an orange thread crosses the frame,
   and the pieces are drawn along it into a single point, which opens into
   the Maks Ops mark.
   ══════════════════════════════════════════════════════════════════════ */

/* The fragments: where they sit (wide, narrow), and what is on them.
   Narrow keeps five; a phone shows fewer things at once. */
const FRAGS = [
  { key: 'sheet', wide: [86, 118, 300], narrow: [14, 96, 236], tilt: -3, Ico: FileSpreadsheet, head: 'orders-FINAL-v3.xlsx',
    body: <span className="ad-cells">{['Customer', 'Item', 'Qty', 'Rate', 'Acme', 'Bracket', '120', '?', 'Orbit', 'Plate', '60', '1,850'].map((c, i) => <i key={i}>{c}</i>)}</span> },
  { key: 'mail', wide: [892, 92, 300], narrow: [176, 196, 230], tilt: 2.5, Ico: Mail, head: 'Re: Re: bracket rates?',
    body: <><small>purchase@acme.example</small><span>Can you confirm the price for 120 by today?</span></> },
  { key: 'pdf', wide: [928, 430, 256], narrow: [196, 478, 212], tilt: -2, Ico: FileText, head: 'deccan-metals.pdf',
    body: <><small>QUOTATION</small><span>SS304 sheet, 2 mm — ₹260 / kg</span></> },
  { key: 'note', wide: [150, 472, 210], narrow: null, tilt: 4, Ico: StickyNote, head: 'Store',
    body: <span className="ad-hand">SS304 — 143 kg?? check</span> },
  { key: 'chat', wide: [498, 566, 270], narrow: [16, 530, 232], tilt: 1.5, Ico: MessageSquare, head: 'Ravi · Acme',
    body: <span className="ad-bubble">Need 120 brackets, brushed. 4 weeks OK?</span> },
  { key: 'job', wide: [520, 104, 236], narrow: null, tilt: -1.5, Ico: ClipboardList, head: 'Job card',
    body: <span>Cut 300 kg sheet — Monday</span> },
  { key: 'inv', wide: [1012, 262, 214], narrow: [200, 616, 196], tilt: 3, Ico: ReceiptText, head: 'INV draft',
    body: <span>GST pending · not sent</span> },
];

const PULL = 3150;          // the moment the thread starts drawing them in

export default function Open({ t, layout }) {
  const [W, H] = pick(layout, [1280, 720], [420, 720]);
  const cx = W / 2, cy = H / 2;
  const frags = FRAGS.filter((f) => f[layout]);
  const hushed = t >= 2900;
  const pulled = t >= PULL;
  const core = t >= 3650;
  const brand = t >= 4000;
  const leaving = t >= 6150;

  const across = pick(layout,
    `M -40 ${cy + 30} C ${W * 0.22} ${cy - 60}, ${W * 0.38} ${cy + 70}, ${cx} ${cy} S ${W * 0.8} ${cy - 50}, ${W + 40} ${cy + 10}`,
    `M -30 ${cy + 40} C 90 ${cy - 30}, 150 ${cy + 50}, ${cx} ${cy} S 340 ${cy - 30}, ${W + 30} ${cy + 20}`);
  const onward = pick(layout,
    `M ${cx} ${cy - 40} C ${cx + 220} ${cy - 40}, ${W - 260} ${cy + 20}, ${W + 40} ${cy + 20}`,
    `M ${cx} ${cy - 30} C ${cx + 80} ${cy - 30}, ${W - 60} ${cy + 10}, ${W + 30} ${cy + 10}`);

  return (
    <div className="ad-act ad-open">
      {frags.map((f, i) => {
        const [left, top, width] = f[layout];
        const fx = left + width / 2, fy = top + 50;
        const style = {
          ...box([left, top, width]),
          '--tilt': `${f.tilt}deg`,
          '--pull': `translate(${cx - fx}px, ${cy - fy}px) scale(0.06) rotate(0deg)`,
          '--i': i,
        };
        return (
          <div key={f.key} style={style}
            className={`ad-frag${t >= 120 + i * 230 ? ' is-on' : ''}${hushed ? ' is-hushed' : ''}${pulled ? ' is-pulled' : ''}`}>
            <div className="ad-frag-in">
              <span className="ad-frag-h"><f.Ico size={13} /> {f.head}</span>
              <span className="ad-frag-b">{f.body}</span>
            </div>
          </div>
        );
      })}

      <Lines layout={layout}>
        <Thread d={across} on={t >= 2850 && !brand} dur={650} />
        <Thread d={onward} on={leaving} dur={700} delay={150} />
      </Lines>
      <Rider d={onward} on={leaving} dur={700} delay={150} />

      {/* the point everything was drawn into, which becomes the mark */}
      <div className={`ad-core${core ? ' is-on' : ''}${brand ? ' is-open' : ''}${leaving ? ' is-gone' : ''}`}
        style={{ left: cx, top: cy - pick(layout, 40, 30) }}>
        <span className="ad-core-dot" />
        <span className="ad-core-mark"><MoMark size={pick(layout, 92, 76)} /></span>
      </div>
      <div className={`ad-word${brand && t >= 4250 ? ' is-on' : ''}${leaving ? ' is-gone' : ''}`}
        style={{ left: 0, width: W, top: cy + pick(layout, 34, 30) }}>
        Maks Ops
      </div>
    </div>
  );
}
