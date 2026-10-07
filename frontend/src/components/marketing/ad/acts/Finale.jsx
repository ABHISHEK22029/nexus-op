import React from 'react';
import { MoMark } from '../../film/shell/marks';
import { Lines, Thread, Rider, Rise } from '../parts';
import { box, pick } from '../geo';

/* ══════════════════════════════════════════════════════════════════════
   Act 8 — from catalogue to cash. (52.5–58 s; from 52.5 s)

   Everything the ad showed, reduced to its line: the thread runs once
   more, the whole way, through the seven things it passed — and each one
   lights as it is reached. Then the line the product is named for, the
   promise under it, the way in, and the mark. It holds.

   The button itself is not drawn here: it is a real link, laid over the
   canvas by ProductAd (see CTA_AT in geo.js), so it can be clicked and
   reached by keyboard and screen reader.
   ══════════════════════════════════════════════════════════════════════ */

const STAGES = ['Catalogue', 'Enquiry', 'Quotation', 'Purchase', 'Inventory', 'Production', 'Invoice'];
const RUN = 150, RUN_MS = 1500;

const L = {
  wide: {
    line: 'M 96 196 L 1184 196',
    stop: (i) => [160 + i * 160, 196],
    head: [0, 268, 1280], sub: [0, 392, 1280], mark: [0, 618, 1280],
  },
  narrow: {
    line: 'M 46 84 L 46 356',
    stop: (i) => [46, 100 + i * 40],
    head: [0, 388, 420], sub: [0, 506, 420], mark: [0, 664, 420],
  },
};

export default function Finale({ t, layout }) {
  const l = L[layout];
  const narrow = layout === 'narrow';
  const headline = pick(layout, [['From', 'catalogue'], ['to', 'cash.']], [['From', 'catalogue'], ['to', 'cash.']]);
  return (
    <div className={`ad-act ad-finale is-${layout}`}>
      <Lines layout={layout}>
        <Thread d={l.line} on={t >= RUN} dur={RUN_MS} />
      </Lines>
      <Rider d={l.line} on={t >= RUN} dur={RUN_MS} />
      {STAGES.map((s, i) => {
        const [x, y] = l.stop(i);
        const frac = narrow ? (y - 84) / (356 - 84) : (x - 96) / (1184 - 96);
        const lit = t >= RUN + frac * RUN_MS - 40;
        return (
          <span key={s} className={`ad-stop${t >= 120 + i * 60 ? ' is-on' : ''}${lit ? ' is-lit' : ''}`} style={{ left: x, top: y }}>
            <i /><b>{s}</b>
          </span>
        );
      })}

      <h3 className={`ad-final-h is-${layout}`} style={box(l.head)}>
        {headline.map((group, g) => (
          <span key={g} className={`ad-final-g${g === 1 ? ' is-accent' : ''}`}>
            {group.map((w, k) => <Rise key={w} on={t >= 1500} delay={(g * 2 + k) * 90}>{w}</Rise>)}
          </span>
        ))}
      </h3>
      <p className={`ad-final-sub${t >= 2200 ? ' is-on' : ''}`} style={box(l.sub)}>
        Run your business.<br className="ad-br" /> Not your spreadsheets.
      </p>
      <div className={`ad-final-mark${t >= 3100 ? ' is-on' : ''}`} style={box(l.mark)}>
        <MoMark size={narrow ? 30 : 34} /><b>Maks Ops</b>
      </div>
    </div>
  );
}
