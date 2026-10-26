import React from 'react';
import { MousePointer2 } from 'lucide-react';
import { box, GLIDE } from './util';

/* ══════════════════════════════════════════════════════════════════════
   The pieces every act of the ad is made of.

   Everything is placed in canvas pixels on a 1280 × 720 canvas, and the
   Stage scales the canvas, so a position written here is the same picture
   at every screen size.

   Movement is CSS: an act decides, from its time `t`, which state each
   thing is in (`on`, `off`, a value), and the transitions carry it there
   on the compositor. React re-renders a few dozen times a second; the
   motion runs at the display's own rate. The recorder holds every
   transition at the frame's moment, so a recording matches the page.

   The thread is the ad's one recurring device: an orange line from one
   record to the next, so a viewer follows a single order rather than a
   sequence of screens.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Something that enters (and maybe leaves).
 * fx: rise · pop · left · right · drop · fade · flip · stamp · zoom
 */
export const In = ({ on, off = false, fx = 'rise', d = 0, at, className = '', style, as = 'div', children, ...rest }) => {
  const Tag = as;
  return (
    <Tag className={`reel-in fx-${fx}${on ? ' is-on' : ''}${off ? ' is-off' : ''} ${className}`}
      style={{ ...(at ? { position: 'absolute', ...box(at) } : null), '--d': `${d}ms`, ...style }} {...rest}>
      {children}
    </Tag>
  );
};

/** The SVG layer threads are drawn on, the size of the canvas. */
export const Lines = ({ children, style }) => (
  <svg className="reel-svg" viewBox="0 0 1280 720" width={1280} height={720} style={style} aria-hidden="true">
    {children}
  </svg>
);

/** The thread along `d`, drawn when `on`. */
export const Thread = ({ d, on, dur = 900, delay = 0, tone = 'amber', off = false }) => (
  <g className={`reel-thread tone-${tone}${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}
    style={{ '--dur': `${dur}ms`, '--delay': `${delay}ms` }}>
    <path className="reel-thread-glow" d={d} pathLength="1" />
    <path className="reel-thread-line" d={d} pathLength="1" />
  </g>
);

/** Something riding the thread — its glowing head, or a record in flight. */
export const Rider = ({ d, on, dur = 900, delay = 0, className = 'reel-head', children, style }) => (
  <div className={`reel-rider ${className}${on ? ' is-on' : ''}`}
    style={{ offsetPath: `path("${d}")`, '--dur': `${dur}ms`, '--delay': `${delay}ms`, ...style }}>
    {children}
  </div>
);

/**
 * The pointer: glides from one waypoint to the next and clicks where told.
 * path: [{ at, x, y, click? }] in act time (`at` is when it sets off); it
 * shows from the first waypoint until `until`.
 */
export const Cursor = ({ t, path, until = Infinity, tone = 'dark' }) => {
  if (!path.length || t < path[0].at - 250 || t >= until) return null;
  let cur = path[0];
  for (const p of path) if (t >= p.at) cur = p;
  const clicks = path.filter((p) => p.click);
  const clicking = clicks.findIndex((p) => t >= p.at + GLIDE && t < p.at + GLIDE + 480);
  const pressed = clicks.some((p) => t >= p.at + GLIDE && t < p.at + GLIDE + 160);
  return (
    <div className={`reel-cursor tone-${tone}${t >= path[0].at ? ' is-on' : ''}${pressed ? ' is-pressed' : ''}`}
      style={{ transform: `translate(${cur.x}px, ${cur.y}px)` }} aria-hidden="true">
      {clicking >= 0 && <i key={clicking} className="reel-ripple" />}
      <MousePointer2 size={26} strokeWidth={1.6} />
    </div>
  );
};

/** A circular gauge: `value` 0…1 of the ring, its colour by `tone`. */
export const Ring = ({ size = 120, stroke = 10, value = 0, tone = 'amber', dur = 900, spin = false, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={`reel-ring tone-${tone}${spin ? ' is-spin' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="reel-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="reel-ring-bar" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - value), transitionDuration: `${dur}ms` }} />
      </svg>
      <div className="reel-ring-in">{children}</div>
    </div>
  );
};

/** A burst of sparks from the centre of its box, once `on`. */
export const Burst = ({ on, n = 14, tone = 'amber', size = 160 }) => (
  <div className={`reel-burst tone-${tone}${on ? ' is-on' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ '--a': `${(360 / n) * i}deg`, '--r': `${size / 2 - 8 + (i % 3) * 10}px` }} />
    ))}
  </div>
);
