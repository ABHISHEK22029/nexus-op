import React from 'react';
import { SIZES } from '../film/shell/layout';
import { box } from './geo';

/* ══════════════════════════════════════════════════════════════════════
   The pieces every act of the ad is made of.

   Everything is placed in canvas pixels — 1280 × 720 wide, 420 × 720 on a
   phone — and the Stage scales the canvas, so a position written here is
   the same picture at every screen size.

   The thread is the ad's one recurring device: an orange line that runs
   from one record to the next, so a viewer follows a single transaction
   rather than a sequence of screens. It draws as one transition (a path
   with pathLength 1, its dash offset going from 1 to 0), and its head is a
   dot riding the same path with CSS offset-path — both on the compositor,
   neither re-rendered by React while they move.
   ══════════════════════════════════════════════════════════════════════ */

/** A window on the stage — the customer's browser or Maks Ops. */
export const Win = ({ at, className = '', style, children }) => (
  <div className={`ad-win ${className}`} style={{ ...box(at), ...style }}>{children}</div>
);

/** The SVG layer threads are drawn on, the size of the canvas. */
export const Lines = ({ layout, children, style }) => {
  const [W, H] = SIZES[layout] || SIZES.wide;
  return (
    <svg className="ad-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={style} aria-hidden="true">
      {children}
    </svg>
  );
};

/** The thread along `d`, drawn when `on`. */
export const Thread = ({ d, on, dur = 900, delay = 0, tone = 'amber', faint = false }) => (
  <g className={`ad-thread tone-${tone}${on ? ' is-on' : ''}${faint ? ' is-faint' : ''}`}
    style={{ '--dur': `${dur}ms`, '--delay': `${delay}ms` }}>
    <path className="ad-thread-glow" d={d} pathLength="1" />
    <path className="ad-thread-line" d={d} pathLength="1" />
  </g>
);

/** Something riding the thread — its glowing head, or a record in flight. */
export const Rider = ({ d, on, dur = 900, delay = 0, className = 'ad-head', children }) => (
  <div className={`ad-rider ${className}${on ? ' is-on' : ''}`}
    style={{ offsetPath: `path("${d}")`, '--dur': `${dur}ms`, '--delay': `${delay}ms` }}>
    {children}
  </div>
);

/** A word or line that rises into place — the ad's kinetic type. */
export const Rise = ({ on, delay = 0, as = 'span', className = '', children }) => {
  const Tag = as;
  return <Tag className={`ad-rise${on ? ' is-on' : ''} ${className}`} style={{ '--delay': `${delay}ms` }}>{children}</Tag>;
};
