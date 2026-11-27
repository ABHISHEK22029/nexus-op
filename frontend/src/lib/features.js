/* Parts of the app switched off for now, kept whole so they come back with
   one change.

   GUIDE — the getting-started tutorial (▶ Guide at the top of the rail, and
   its first-sign-in pop-up). Off since 26 Nov 2026: in the rail it read as a
   video tour and looked out of place. Everything behind it (the steps, the
   progress, the coach cards, context/TutorialContext, components/Tutorial)
   is untouched. To bring it back for everyone, set the default below to
   true; on one browser, localStorage maks_guide = 'on' turns it on (which
   is how its own tests run). */
const GUIDE_DEFAULT = false;

export const GUIDE_ENABLED = (() => {
  try {
    const v = localStorage.getItem('maks_guide');
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch { /* storage blocked */ }
  return GUIDE_DEFAULT;
})();
