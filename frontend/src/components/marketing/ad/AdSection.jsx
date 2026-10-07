import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════
   The homepage section that holds the ad.

   This file is all the homepage loads up front: the heading, and an empty
   frame of the right shape. The ad itself (ProductAd and everything it
   draws) is fetched only when the visitor scrolls within reach of it, so
   a visitor who never gets this far never downloads it, and nothing above
   it waits for it.
   ══════════════════════════════════════════════════════════════════════ */

const ProductAd = lazy(() => import('./ProductAd'));

/* true once the element is within `margin` of the viewport */
const useNear = (margin = '400px') => {
  const ref = useRef(null);
  /* no IntersectionObserver (old webviews): load it, rather than never */
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near];
};

export default function AdSection() {
  const [ref, near] = useNear();
  return (
    <section className="section mk-ad-section" aria-labelledby="mk-ad-h">
      <div className="container">
        <div className="mk-ad-head">
          <span className="pill pill-amber"><Sparkles size={12} /> The Maks Ops difference</span>
          <h2 id="mk-ad-h">Your entire operation. <span className="gradient-text-amber">Connected.</span></h2>
          <p>
            From the first customer enquiry to inventory, procurement, production and payment —
            Maks Ops keeps everything moving together.
          </p>
        </div>
        <div ref={ref} className="mk-ad-slot">
          {near
            ? <Suspense fallback={<div className="mk-ad-ph" />}><ProductAd /></Suspense>
            : <div className="mk-ad-ph" />}
        </div>
      </div>
    </section>
  );
}
