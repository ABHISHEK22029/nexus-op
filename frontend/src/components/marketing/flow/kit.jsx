import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════
   kit — the primitives the walkthrough is built from.

   Every scene is a PURE FUNCTION OF TIME: given `t` (milliseconds into the
   scene) it returns what the product looks like at that instant. That one
   decision is what makes the rest simple:

     · pausing is "stop advancing t"
     · jumping to a stage is "set t to 0"
     · reduced motion is "render every scene at its final t"
     · a test can ask what the screen shows at any moment

   Two kinds of change, handled differently on purpose:

     · DISCRETE things — characters typed, a number counting, a status
       flipping — are derived from t, which the clock commits ~20 times a
       second. That is plenty for text, and it keeps React's work small.
     · CONTINUOUS things — a bar filling, a panel sliding, a cursor gliding —
       are NOT derived from t frame by frame. Their target is set when t
       crosses a threshold and a CSS transition carries them there on the
       compositor. So they stay perfectly smooth even though React only
       renders 20 times a second, and they cost no main-thread time at all.
   ══════════════════════════════════════════════════════════════════════ */

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const prog = (t, start, dur) => easeOut((t - start) / dur);
export const typed = (text, t, start, cps = 45) =>
  text.slice(0, Math.max(0, Math.floor(((t - start) * cps) / 1000)));
export const counted = (to, t, start, dur, from = 0) => from + (to - from) * prog(t, start, dur);

/* Indian grouping — ₹3,28,500, not ₹328,500. Fabricators read lakhs. */
export const inr = (n, d = 0) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (n, d = 0) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Appears once, on a transition. `from` picks the direction it arrives from,
   so a row carried across from the previous document can slide in sideways
   while a new value rises into place. */
export const Show = ({ on, as: Tag = 'div', from = 'up', className = '', style, children, ...rest }) => (
  <Tag
    className={`fl-show fl-from-${from}${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
    style={style}
    {...rest}
  >
    {children}
  </Tag>
);

/* Text being typed. The caret is solid, not blinking: a blinking caret is an
   infinite animation on every field, and nobody misses the blink. */
export const Typed = ({ text, t, start, cps = 45, ph = '' }) => {
  const s = typed(text, t, start, cps);
  const typing = t >= start && s.length < text.length;
  if (!s) return ph ? <span className="fl-ph">{ph}</span> : null;
  return (
    <>
      {s}
      {typing && <span className="fl-caret" aria-hidden="true" />}
    </>
  );
};

export const Count = ({ to, t, start, dur = 700, from = 0, fmt = (n) => num(Math.round(n)) }) =>
  fmt(counted(to, t, start, dur, from));

/* A bar whose fill is a transform, so it animates on the compositor. */
export const Bar = ({ on, value = 1, tone = 'amber', dur = 900, delay = 0, thin = false, style }) => (
  <span className={`fl-bar${thin ? ' is-thin' : ''}`} style={style}>
    <span
      className={`fl-bar-fill tone-${tone}`}
      style={{
        transform: `scaleX(${on ? value : 0})`,
        transitionDuration: `${dur}ms`,
        transitionDelay: `${delay}ms`,
      }}
    />
  </span>
);

export const Pill = ({ tone = 'neutral', dot = false, children }) => (
  <span className={`fl-pill tone-${tone}`}>
    {dot && <i aria-hidden="true" />}
    {children}
  </span>
);

export const Field = ({ label, children, tall = false, mono = false }) => (
  <div className={`fl-field${tall ? ' is-tall' : ''}`}>
    <span className="fl-field-l">{label}</span>
    <span className={`fl-field-v${mono ? ' is-mono' : ''}`}>{children}</span>
  </div>
);

/* A row that ticks when its condition is met — used for the production
   checklist and the "can we fulfil it" check. */
export const Tick = ({ done, active, children, right }) => (
  <div className={`fl-tick${done ? ' is-done' : active ? ' is-active' : ''}`}>
    <span className="fl-tick-box" aria-hidden="true">{done && <Check size={11} strokeWidth={3} />}</span>
    <span className="fl-tick-label">{children}</span>
    {right && <span className="fl-tick-right">{right}</span>}
  </div>
);

export const FileChip = ({ on, read, name, size, kind, note }) => (
  <Show on={on} className="fl-file">
    <span className={`fl-file-ico k-${kind}`}>{kind.toUpperCase()}</span>
    <span className="fl-file-meta">
      <b>{name}</b>
      <small className={read ? 'is-read' : ''}>
        {read ? <><Check size={10} strokeWidth={3} /> {note}</> : size}
      </small>
    </span>
    <span className="fl-file-load"><Bar on={on} dur={650} thin /></span>
  </Show>
);

/* A pointer that glides to the primary action and presses it. Position is a
   transform with a transition, so the glide is smooth regardless of how often
   React renders. */
export const Cursor = ({ on, click }) => (
  <span className={`fl-cursor${on ? ' is-on' : ''}${click ? ' is-click' : ''}`} aria-hidden="true">
    <span className="fl-cursor-ring" />
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M5 3l13 8.2-6 1.4L9 19z" fill="#14161c" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </span>
);

/* Cross-fade between identities. `k` is what changed (a record ID, a stage);
   while k stays the same the CURRENT children keep updating — so a status
   can count up inside a Morph without retriggering it. */
export const Morph = ({ k, children, className = '' }) => {
  const [items, setItems] = useState(() => [{ k, node: children, out: false }]);
  useEffect(() => {
    setItems((prev) => {
      const cur = prev[prev.length - 1];
      if (cur.k === k) return prev;
      return [{ ...cur, out: true }, { k, node: children, out: false }];
    });
    const h = setTimeout(() => setItems((p) => p.filter((x) => !x.out)), 460);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return (
    <span className={`fl-morph ${className}`}>
      {items.map((it) => (
        <span key={String(it.k)} className={`fl-morph-item ${it.out ? 'is-out' : 'is-in'}`}>
          {it.out ? it.node : children}
        </span>
      ))}
    </span>
  );
};

/* The sample business's letterhead. Documents in Maks Ops print on the USER's
   letterhead, from their company profile — not on a Maks Ops logo — so the
   walkthrough shows the sample company's mark, which is what a customer of
   theirs would actually receive. */
export const SELLER = 'Precision Fab Works';
export const Letterhead = () => (
  <span className="fl-lh">
    <span className="fl-lh-mark" aria-hidden="true">PF</span>
    <span className="fl-lh-name">{SELLER}</span>
  </span>
);

export const Doc = ({ title, id, children }) => (
  <div className="fl-doc">
    <div className="fl-doc-top">
      <Letterhead />
      <span className="fl-doc-addr">Hyderabad</span>
    </div>
    <div className="fl-doc-titlebar">
      <b>{title}</b>
      <small>{id}</small>
    </div>
    {children}
  </div>
);

export const DocMeta = ({ left, right }) => (
  <div className="fl-doc-meta">
    <div>{left}</div>
    <div className="is-right">{right}</div>
  </div>
);

export const DocKV = ({ k, v, strong }) => (
  <div className={`fl-doc-kv${strong ? ' is-strong' : ''}`}>
    <span>{k}</span>
    <b>{v}</b>
  </div>
);
