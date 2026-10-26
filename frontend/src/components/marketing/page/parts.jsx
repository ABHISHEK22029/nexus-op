import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AD_SCENE } from '../ad/util';
import { AD_CHIPS } from './content';
import { playAd } from './hooks';
import './page.css';

/* ══════════════════════════════════════════════════════════════════════
   The pieces the three marketing pages are built from, so they share one
   look: a section and its heading, the homepage's film with the chips
   that jump it to a feature, and the closing band. Each page has one film,
   at its top; nothing under it shows that film again.
   The styles are in page.css (prefix mp-).
   ══════════════════════════════════════════════════════════════════════ */

const ProductAd = lazy(() => import('../ad/ProductAd'));

/** A band of the page. tone: plain (the page colour), alt (a step lighter
    or darker), dark (the film's own navy, in either theme). */
export const Section = ({ id, tone = 'plain', className = '', label, children }) => (
  <section id={id} className={`mp-section is-${tone} ${className}`} aria-label={label}>
    <div className="mp-wrap">{children}</div>
  </section>
);

/** A section's heading: an optional label above, the title with its last
    words in orange (`accent`), and at most one line under it. */
export const Head = ({ eyebrow, title, accent, lede, align = 'center', level = 2 }) => {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className={`mp-head is-${align}`}>
      {eyebrow && <span className="mp-eyebrow">{eyebrow}</span>}
      <H className={level === 1 ? 'mp-h1' : 'mp-h2'}>
        {title}{accent && <> <span className="mp-accent">{accent}</span></>}
      </H>
      {lede && <p className="mp-lede">{lede}</p>}
    </div>
  );
};

/** The homepage's film, and under it the features it shows: each chip
    plays the film from that feature, and lights while it is on screen. */
export function AdBand() {
  const [scene, setScene] = useState(null);
  useEffect(() => {
    const on = (e) => setScene(e.detail);
    window.addEventListener(AD_SCENE, on);
    return () => window.removeEventListener(AD_SCENE, on);
  }, []);
  return (
    <>
      <div id="the-film" className="mk-reel-slot mp-film-slot">
        <Suspense fallback={<div className="mk-reel-ph" />}><ProductAd soundPrompt /></Suspense>
      </div>
      <div className="mp-chips" role="group" aria-label="Play the film from a feature">
        {AD_CHIPS.map(({ label, Icon, at, scenes }) => {
          const on = scenes.includes(scene);
          return (
            <button key={label} type="button" className={`mp-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => playAd(at)}>
              {React.createElement(Icon, { size: 15, 'aria-hidden': true })} {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The page's last word: one line, one or two buttons. */
export const CtaBand = ({ title, line, children }) => (
  <section className="mp-cta">
    <div className="mp-wrap">
      <h2 className="mp-h2">{title}</h2>
      {line && <p className="mp-lede">{line}</p>}
      <div className="mp-cta-row">{children}</div>
    </div>
  </section>
);
