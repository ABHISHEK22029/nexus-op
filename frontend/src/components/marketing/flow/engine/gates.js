import { useEffect, useState } from 'react';

/* What decides whether a story may move by itself. */

const RM = '(prefers-reduced-motion: reduce)';

/** The visitor's reduced-motion setting, kept current. */
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(RM).matches);
  useEffect(() => {
    const m = window.matchMedia?.(RM);
    if (!m) return undefined;
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return reduced;
};

/** Keyboard focus inside the story pauses it; a mouse click does not (or
    choosing a card would stop the very scene it asked for). Elements
    matching `exempt` — a voice button — do not pause it either: a keyboard
    user who turns the voice on wants to hear it play. Spread onFocus and
    onBlur on the story's root. */
export const useKeyboardPause = ({ exempt } = {}) => {
  const [kbFocus, setKbFocus] = useState(false);
  const onFocus = (e) => {
    if (e.target.matches?.(':focus-visible')) setKbFocus(!(exempt && e.target.closest?.(exempt)));
  };
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKbFocus(false); };
  return { kbFocus, onFocus, onBlur };
};

export { usePageShown } from '../voice';
