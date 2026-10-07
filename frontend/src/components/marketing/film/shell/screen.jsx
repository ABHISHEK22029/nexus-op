import React from 'react';

/* The pieces every app screen in the film is made of, in the app's own
   shape: a title with its one-line explanation, the summary tiles, filter
   chips and rows. Scenes compose these rather than drawing screens from
   scratch, so the film's screens look like one product — because they are
   copies of one product's screens. */

export const ScreenHead = ({ icon: Icon, title, sub, right }) => (
  <div className="fm-sh">
    <div className="fm-sh-top">
      <h4>{Icon && <Icon size={20} />}{title}</h4>
      {right}
    </div>
    {sub && <p>{sub}</p>}
  </div>
);

/** [label, value, tone?] — tone: info | ok | amber | danger | violet */
export const Tiles = ({ items }) => (
  <div className="fm-tiles">
    {items.map(([label, value, tone]) => (
      <div key={label} className={`fm-tile${tone ? ` tone-${tone}` : ''}`}>
        <small>{label}</small>
        <b>{value}</b>
      </div>
    ))}
  </div>
);

export const Chips = ({ items, on }) => (
  <div className="fm-chips">
    {items.map((c) => <span key={c} className={`fm-chip${c === on ? ' is-on' : ''}`}>{c}</span>)}
  </div>
);

export const Button = ({ primary, pressed, children, icon: Icon }) => (
  <span className={`fl-btn${primary ? ' primary' : ''}${pressed ? ' is-pressed' : ''}`}>
    {Icon && <Icon size={13} />}{children}
  </span>
);
