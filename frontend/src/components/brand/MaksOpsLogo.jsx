/* ══════════════════════════════════════════════════════════
   The Maks Ops logo — one drawing, used everywhere.

   The mark is a ribbon "M" that ends in a node: work moving through
   connected steps and arriving somewhere. Stroke A rises to a low peak and
   falls into the dip; stroke B climbs out of the dip, over the high arch,
   and down to the node. B passes over A, with a shade where they fold.

     MaksMark      the ribbon on its own, in orange — on any background
     MaksAppIcon   the ribbon in white on an orange tile — tabs, the app
                   rail, anywhere a square is wanted
     MaksOpsLogo   the mark with the wordmark: "Maks" in the logo ink
                   (navy on light, white on dark — --logo-ink in
                   index.css) and "Ops" in orange; the tagline optional

   The same drawing is public/favicon.svg and the PNG icons, so the tab,
   the home screen and the page agree.
   ══════════════════════════════════════════════════════════ */
import React, { useId } from 'react';

const STROKE_A = 'M13 68 L31 41 Q36 33.5 41 41 L50 55';
const STROKE_B = 'M50 55 L67 27 Q75 13 83 27 L96 62';
const FOLD = 'M43.5 44.5 L50 55';
const RATIO = 120 / 84;
export const BRAND_ORANGE = '#F2590D';

/* Gradient ids must be unique per drawing, and useId's ":r1:" is not a
   safe fragment identifier inside url(#…). */
const useSafeId = (prefix) => `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** The ribbon M. `size` is its height in px. */
export function MaksMark({ size = 32, title = 'Maks Ops', decorative = false, style }) {
  const id = useSafeId('mm');
  return (
    <svg viewBox="0 0 120 84" width={Math.round(size * RATIO)} height={size} style={{ display: 'block', flex: 'none', ...style }}
      {...(decorative ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': title })}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="1" x2="0.7" y2="0">
          <stop offset="0" stopColor="#F0560C" /><stop offset="1" stopColor="#FF7A1A" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0.2" y1="1" x2="0.5" y2="0">
          <stop offset="0" stopColor="#F35E0E" /><stop offset="1" stopColor="#FF9B34" />
        </linearGradient>
        <linearGradient id={`${id}n`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9B34" /><stop offset="1" stopColor="#F35E0E" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="19">
        <path d={STROKE_A} stroke={`url(#${id}a)`} />
        <path d={FOLD} stroke="#C9420A" strokeOpacity="0.45" strokeLinecap="butt" />
        <path d={STROKE_B} stroke={`url(#${id}b)`} />
      </g>
      <circle cx="97" cy="66" r="13" fill={`url(#${id}n)`} />
      <circle cx="97" cy="66" r="5.4" fill="#FFE2C6" />
    </svg>
  );
}

/** The app icon: the ribbon in white on an orange tile. `size` is its side in px. */
export function MaksAppIcon({ size = 32, title = 'Maks Ops', decorative = false, radius = 15, className, style }) {
  const id = useSafeId('ma');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} style={{ display: 'block', flex: 'none', ...style }}
      {...(decorative ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': title })}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A1F" /><stop offset="1" stopColor="#F0520A" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={radius} fill={`url(#${id}g)`} />
      <g transform="translate(3 9.5) scale(0.485)">
        <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="19">
          <path d={STROKE_A} /><path d={STROKE_B} />
        </g>
        <circle cx="97" cy="66" r="13" fill="#fff" />
        <circle cx="97" cy="66" r="5.4" fill="#F46A10" />
      </g>
    </svg>
  );
}

/**
 * The full logo. `height` is the mark's height in px; the wordmark is set
 * from it. `tagline` adds FROM CATALOGUE TO CASH under the name.
 */
export default function MaksOpsLogo({ height = 30, tagline = false, title = 'Maks Ops', className, style }) {
  const word = Math.round(height * 0.66);
  return (
    <span className={className} role="img" aria-label={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.24), lineHeight: 1, ...style }}>
      <MaksMark size={height} decorative />
      <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: Math.max(2, Math.round(height * 0.1)) }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: word, letterSpacing: '-0.035em', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--logo-ink)' }}>Maks</span><span style={{ color: BRAND_ORANGE }}>Ops</span>
        </span>
        {tagline && (
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: Math.max(8, Math.round(height * 0.15)), letterSpacing: '0.38em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            FROM CATALOGUE TO CASH
          </span>
        )}
      </span>
    </span>
  );
}
