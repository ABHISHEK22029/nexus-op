import { useEffect, useState } from 'react';

/* The canvas sizes the film is drawn at (Stage.jsx scales them). */
export const SIZES = { wide: [1280, 720], narrow: [420, 720] };

/* 'narrow' below this width of the stage's column, 'wide' above it. */
export const useStageLayout = (ref, { narrowBelow = 640, force } = {}) => {
  const [layout, setLayout] = useState(force || 'wide');
  useEffect(() => {
    if (force) return undefined;
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setLayout(entry.contentRect.width < narrowBelow ? 'narrow' : 'wide'));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, narrowBelow, force]);
  return force || layout;
};
