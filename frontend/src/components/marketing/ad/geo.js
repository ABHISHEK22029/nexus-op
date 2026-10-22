/* Canvas geometry the player needs: the ad is drawn on a 1280 × 720
   canvas at every width (film/shell/Stage scales it). */

/** A box in canvas pixels, [left, top, width, height], as a style. */
export const box = ([left, top, width, height]) => ({ left, top, width, height });

/* The closing call to action — a real link, laid over the canvas by
   ProductAd so it can be clicked, tabbed to and read out. It arrives with
   the finale's line (acts/Finale.jsx, 4 s into the act). */
export const CTA_AT = [510, 470, 260, 58];
export const CTA_FROM = 86000 + 4000;
