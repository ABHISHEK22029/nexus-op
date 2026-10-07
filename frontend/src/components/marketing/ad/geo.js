/* Canvas geometry for the ad: every act places things in canvas pixels,
   1280 × 720 wide and 420 × 720 on a phone (film/shell/layout.js). */

/** [wide, narrow] → the one for this layout */
export const pick = (layout, wide, narrow) => (layout === 'narrow' ? narrow : wide);

/** A box in canvas pixels, [left, top, width, height], as a style. */
export const box = ([left, top, width, height]) => ({ left, top, width, height });

/* Where the customer order sits when act 2 hands it to act 3 — both acts
   draw it here, so it stays put across the cut. */
export const ORDER_AT = { wide: [80, 190, 300, 120], narrow: [16, 112, 388, 60] };

/* The closing call to action — a real link, laid over the canvas by
   ProductAd so it can be clicked, tabbed to and read out. */
export const CTA_AT = { wide: [510, 506, 260, 58], narrow: [80, 590, 260, 54] };
export const CTA_FROM = 52500 + 2800;
