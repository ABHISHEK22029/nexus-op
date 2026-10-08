import React, { useLayoutEffect, useRef } from 'react';

/* A headline number that stays inside its tile.

   Summary tiles are sized for a figure like "₹2,52,235", and a real
   business's "₹1,60,34,50,00,000" ran straight out of the side of one. The
   figure passed in should already be compact (lib/format: ₹16.03 L); this is
   the second line of defence for whatever is still too wide on a narrow
   screen: it scales the text down to the width it has, to no less than
   `min` of its size, and past that it ends in an ellipsis rather than
   spilling. The exact value, when given, is the tooltip and the label a
   screen reader reads. */
export default function FitNumber({ children, exact, style, min = 0.55 }) {
  const box = useRef(null);
  const text = useRef(null);

  useLayoutEffect(() => {
    const b = box.current, t = text.current;
    if (!b || !t) return undefined;
    const fit = () => {
      t.style.fontSize = '1em';
      const natural = t.getBoundingClientRect().width;
      const room = b.clientWidth;
      const scale = natural > room && natural > 0 ? Math.max(min, Math.floor((room / natural) * 100) / 100) : 1;
      t.style.fontSize = `${scale}em`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, [children, min]);

  const label = exact != null && String(exact) !== String(children) ? String(exact) : undefined;
  return (
    <div ref={box} title={label} aria-label={label}
      style={{ ...style, minWidth: 0, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      <span ref={text}>{children}</span>
    </div>
  );
}
