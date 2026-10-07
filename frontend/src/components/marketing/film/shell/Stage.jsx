import React, { useEffect, useRef, useState } from 'react';

/* ══════════════════════════════════════════════════════════════════════
   The film's stage: a fixed canvas, scaled to fit.

   Every chapter is drawn at one logical size — 1280 × 720 wide, 420 × 720
   on a phone — and the whole canvas is scaled to the space it has. A scene
   is laid out once per layout instead of reflowing at every width, and a
   recording made at 1920 × 1080 is the same picture as the page.

   `fit`: 'width' fills the column (the page); 'contain' fits inside the
   viewport with letterboxing (film mode, for recording).
   ══════════════════════════════════════════════════════════════════════ */
import { SIZES } from './layout';

export default function Stage({ layout = 'wide', fit = 'width', children, className = '' }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(null);
  const [W, H] = SIZES[layout] || SIZES.wide;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(fit === 'contain' ? Math.min(w / W, window.innerHeight / H) : w / W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, fit]);

  const s = scale ?? 0;
  return (
    <div ref={ref} className={`fm-stage is-${layout} ${className}`}
      style={{ height: fit === 'contain' ? '100vh' : H * s, visibility: scale == null ? 'hidden' : undefined }}>
      <div className="fm-canvas" style={{ width: W, height: H, transform: `scale(${s})` }}>
        {children}
      </div>
    </div>
  );
}
