/* ══════════════════════════════════════════════════════════
   format — numbers for tiles, cards and tables, the Indian way.

   A tester entered real-sized invoices and "₹1,60,34,50,00,000" ran out of
   its summary tile, and a stock card's quantity pushed its status pill
   outside the card. A tile has room for a headline, not for every digit:

     fmtCompactINR(1603450)        → ₹16.03 L
     fmtCompactINR(16034500000000) → ₹16,03,450 Cr
     fmtCompactQty(321231)         → 3.21 L

   Below one lakh the full figure is short enough and is shown as it is.
   The exact value always goes in the tile's tooltip and aria-label (fmtINR /
   fmtQty), and tables keep exact values throughout.
   ══════════════════════════════════════════════════════════ */

const num = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
};

/** ₹1,60,34,50,00,000 — every digit, Indian grouping, up to 2 decimals. */
export const fmtINR = (n, { decimals = 2 } = {}) => {
  const x = num(n);
  return `${x < 0 ? '-' : ''}₹${Math.abs(x).toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;
};

/** 32,43,242 — a quantity in full, Indian grouping, up to 3 decimals. */
export const fmtQty = (n) => num(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/* Lakh and crore, two decimals, trailing zeros dropped (₹16 L, not ₹16.00 L). */
function compact(x) {
  const a = Math.abs(x);
  const short = (v, unit) => `${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}`;
  if (a >= 1e7) return short(Math.round((a / 1e7) * 100) / 100, 'Cr');
  if (a >= 1e5) return short(Math.round((a / 1e5) * 100) / 100, 'L');
  return a.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** ₹16.03 L · ₹1,603.45 Cr · ₹95,000 — for a tile. */
export const fmtCompactINR = (n) => {
  const x = num(n);
  return `${x < 0 ? '-' : ''}₹${compact(x)}`;
};

/** 3.21 L · 1.32 Cr · 4,234 — a quantity for a tile or a card. */
export const fmtCompactQty = (n) => {
  const x = num(n);
  return `${x < 0 ? '-' : ''}${compact(x)}`;
};

/** True when the compact form hides digits, so a tooltip is worth showing. */
export const isCompacted = (n) => Math.abs(num(n)) >= 1e5;
