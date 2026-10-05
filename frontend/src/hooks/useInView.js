import { useState, useRef, useEffect } from 'react';

/* Fire once when an element first scrolls into view.
   Lifted out of Welcome.jsx, which had it inline — every marketing component
   that reveals on scroll needs it, and three private copies would drift.

   Once it has fired it DISCONNECTS. A reveal that re-runs every time you
   scroll past makes a page feel broken rather than alive, and an observer
   left attached to an unmounted node is a leak. */
export default function useInView(threshold = 0.1, { once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* No IntersectionObserver (old Safari, some in-app webviews) means the
       choice is "animate blindly" or "show the content". Show the content:
       these wrappers start at opacity 0, so failing closed would leave the
       page blank — the one outcome worse than no animation. */
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        });
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
