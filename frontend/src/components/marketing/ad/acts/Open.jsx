import React from 'react';
import {
  MessageCircle, StickyNote, FileText, Sheet, PhoneMissed, Mail, BellRing, Clock3, Copy, CircleHelp, Files, TriangleAlert,
} from 'lucide-react';
import { MoMark } from '../../film/shell/marks';
import { Burst } from '../parts';
import { box } from '../util';

/* ══════════════════════════════════════════════════════════════════════
   Act 1 — before, and Maks Ops. (0–11.5 s)

   The day as it is, one line at a time: the order on WhatsApp, the stock
   in a notebook, the quote in a PDF, the bills in Excel. Then the noise
   multiplies — reminders, missed calls, copies of copies — and jitters,
   until all of it is drawn into one point of light, which bursts into the
   Maks Ops mark.
   ══════════════════════════════════════════════════════════════════════ */

const CX = 640, CY = 300;

/* The four things the captions name, each arriving with its line. */
const HERO = [
  { key: 'chat', at: [92, 128, 300], tilt: -4, show: 300 },
  { key: 'note', at: [912, 116, 250], tilt: 5, show: 1650 },
  { key: 'pdf', at: [150, 470, 290], tilt: 3, show: 3050 },
  { key: 'xls', at: [872, 452, 310], tilt: -3, show: 4520 },
];

/* The noise around them: small, many, arriving fast. Kept out of the
   band the centred caption is written in. */
const SWARM = [
  [520, 104, -6, BellRing, 'Reminder'], [720, 196, 4, PhoneMissed, 'Missed call'], [330, 236, -3, Mail, 'Re: Fw: Re:'],
  [1010, 300, 6, Copy, 'v3_final (2)'], [36, 312, 3, CircleHelp, 'Who has it?'], [1140, 150, -5, Clock3, 'Overdue'],
  [430, 586, 5, Files, 'Copy of copy'], [760, 606, -4, TriangleAlert, 'Stock?'], [1080, 620, 3, Mail, '12 unread'],
  [230, 408, -7, PhoneMissed, 'Call back'], [610, 470, 4, CircleHelp, 'Rate?'], [60, 640, -2, BellRing, 'Pending'],
].map((chip, i) => [...chip, i]);

const PULL = 6700;          // everything is drawn into the point
const CORE = 6950;          // the point of light
const BRAND = 7600;         // it bursts into the mark

/* Where a thing must travel to reach the point, as a CSS transform. */
const pullTo = (left, top, width) => `translate(${CX - (left + width / 2)}px, ${CY - (top + 40)}px) scale(0.05)`;

function Hero({ k }) {
  if (k === 'chat') return (
    <>
      <span className="ad-frag-h"><MessageCircle size={14} /> Ravi · Acme</span>
      <span className="ad-bubble">Need 120 brackets, brushed. Price?</span>
      <span className="ad-bubble is-me">Will check stock and revert</span>
    </>
  );
  if (k === 'note') return (
    <>
      <span className="ad-frag-h"><StickyNote size={14} /> Store</span>
      <span className="ad-hand">SS304 — 143 kg??</span>
      <span className="ad-hand is-small">ask Suresh</span>
    </>
  );
  if (k === 'pdf') return (
    <>
      <span className="ad-frag-h"><FileText size={14} /> quote_final_v3.pdf</span>
      <span className="ad-lines"><i /><i /><i style={{ width: '60%' }} /></span>
    </>
  );
  return (
    <>
      <span className="ad-frag-h"><Sheet size={14} /> bills-oct-FINAL.xlsx</span>
      <span className="ad-cells">{['Party', 'Amt', 'GST', 'Paid', 'Acme', '?', '18%', '—', 'Orbit', '64,900', '?', 'no'].map((c, i) => <i key={i}>{c}</i>)}</span>
    </>
  );
}

export default function Open({ t }) {
  const pulled = t >= PULL;
  return (
    <div className="ad-act ad-open">
      {HERO.map((f, i) => (
        <div key={f.key}
          className={`ad-frag is-hero is-${f.key}${t >= f.show ? ' is-on' : ''}${t >= 5200 ? ' is-jitter' : ''}${pulled ? ' is-pulled' : ''}`}
          style={{ ...box(f.at), '--tilt': `${f.tilt}deg`, '--pull': pullTo(...f.at), '--i': i, '--pd': `${i * 40}ms` }}>
          <div className="ad-frag-in"><Hero k={f.key} /></div>
        </div>
      ))}

      {SWARM.map(([left, top, tilt, icon, label, i]) => {
        const Ico = icon;
        return (
        <div key={i}
          className={`ad-frag is-swarm${t >= 5200 + i * 110 ? ' is-on' : ''}${t >= 5200 ? ' is-jitter' : ''}${pulled ? ' is-pulled' : ''}`}
          style={{ left, top, '--tilt': `${tilt}deg`, '--pull': pullTo(left, top, 130), '--i': i + 4, '--pd': `${60 + i * 25}ms` }}>
          <div className="ad-frag-in"><Ico size={13} /> {label}</div>
        </div>
        );
      })}

      {/* the point everything was drawn into, which becomes the mark */}
      <div className={`ad-core${t >= CORE ? ' is-on' : ''}${t >= BRAND ? ' is-open' : ''}`} style={{ left: CX, top: CY }}>
        <span className="ad-core-dot" />
        <span className="ad-core-wave" />
        <span className="ad-core-burst"><Burst on={t >= BRAND} n={18} size={260} /></span>
        <span className="ad-core-mark"><MoMark size={112} /></span>
      </div>
      <div className={`ad-word${t >= BRAND + 450 ? ' is-on' : ''}`} style={{ left: 0, width: 1280, top: CY + 70 }}>
        Maks Ops
      </div>
    </div>
  );
}
