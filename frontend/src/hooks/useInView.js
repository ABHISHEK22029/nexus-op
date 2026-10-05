import { useState, useRef, useEffect } from 'react';

/* Fire once when an element first scrolls into view.
   Lifted out of Welcome.jsx, which had it inline — every marketing component
   that reveals on scroll needs it, and three private copies would drift.

   Once it has fired it DISCONNECTS. A reveal that re-runs every time you
   scroll past makes a page feel broken rather than alive, and an observer
   left attached to an unmounted node is a leak. */
/* Returns [ref, seen, visible].

     seen    — true once the element has EVER been in view, and stays true.
               Entrance reveals use this: a reveal that replays every time you
               scroll past makes a page feel broken rather than alive.
     visible — true only while the element is in view right now. Looping
               animations use this.

   Both come from ONE observer, because the two signals are the same
   measurement and two observers on the same node would be waste.

   The distinction matters more than it sounds. Every looping diagram on this
   page used to start when it was first seen and then run FOREVER — twelve
   feature diagrams plus a seven-stage engine still animating while the reader
   is at the footer. On a desktop that is invisible; throttled to a low-end
   phone it was the difference between a smooth page and a stuttering one, and
   on a real phone it is battery. Nothing should animate where nobody is
   looking. */
export default function useInView(threshold = 0.1, { once = false } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* No IntersectionObserver (old Safari, some in-app webviews) means the
       choice is "animate blindly" or "show the content". Show the content:
       these wrappers start at opacity 0, so failing closed would leave the
       page blank — the one outcome worse than no animation. */
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); setVisible(true); return; }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          setVisible(e.isIntersecting);
          if (e.isIntersecting) {
            setSeen(true);
            if (once) io.disconnect();
          }
        });
      },
      /* A generous margin on the vertical axis: start a moment BEFORE the
         element is on screen, so nothing is caught mid-reveal, and stop a
         moment after it leaves rather than the instant its edge passes. */
      { threshold, rootMargin: '140px 0px 140px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, seen, visible];
}
