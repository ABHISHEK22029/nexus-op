/* ══════════════════════════════════════════════════════════════════════
   leadTime — "2–3 weeks" is 21 days.

   The quotation builder suggests "Delivery: within N days of order" from
   the lead times of the products on it. Lead times are free text — "10
   days", "2-3 weeks", "15 working days", "1 month" — so they are read here:

     · a range promises its upper bound — "2-3 weeks" is 3 weeks, not 2;
     · working (business) days are five in seven, so ×7/5, rounded up;
     · weeks ×7, months ×30, hours ÷24, and part days round up;
     · a number on its own ("7-10") is days, but only when the note is
       nothing else — "from Jan 2026" must not become 730 days;
     · several figures in one note, or several lines: the longest, because
       the order ships when its slowest line is ready.

   A copy of backend/shared/leadTime.js; scripts/test-sales-flow.js runs
   both over the same cases so they cannot drift apart.
   ══════════════════════════════════════════════════════════════════════ */

export const MAX_DAYS = 730;   // the column's own CHECK: two years

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const SEP = String.raw`\s*(?:-|–|—|to)\s*`;
const UNIT = String.raw`(working\s*days?|business\s*days?|work\s*days?|days?|d|weeks?|wks?|w|months?|mths?|hours?|hrs?)`;
const WITH_UNIT = new RegExp(`${NUM}(?:${SEP}${NUM})?\\s*${UNIT}\\b`, 'gi');
const BARE = new RegExp(`^\\s*(?:within\\s+)?${NUM}(?:${SEP}${NUM})?\\s*$`, 'i');

const toDays = (n, unit) => {
  const u = String(unit || 'days').toLowerCase().replace(/\s+/g, '');
  let d;
  if (/^(working|business|work)/.test(u)) d = (n * 7) / 5;
  else if (/^w/.test(u)) d = n * 7;
  else if (/^m/.test(u)) d = n * 30;
  else if (/^h/.test(u)) d = n / 24;
  else d = n;
  // 15 × 7 / 5 must be 21, not 21.000000000004 rounded up to 22.
  return Math.min(MAX_DAYS, Math.ceil(Math.round(d * 1000) / 1000));
};

/** "2-3 weeks" → 21. null when the note says no number of days. */
export function leadTimeDays(text) {
  if (text == null) return null;
  const s = String(text);
  let best = null;
  for (const m of s.matchAll(WITH_UNIT)) {
    const hi = Number(m[2] ?? m[1]);
    if (!Number.isFinite(hi)) continue;
    const d = toDays(hi, m[3]);
    if (best == null || d > best) best = d;
  }
  if (best != null) return best;
  const bare = s.match(BARE);
  if (bare) return toDays(Number(bare[2] ?? bare[1]), 'days');
  return null;
}

/** The longest of several notes: { days, note, from } or null. */
export function suggestDeliveryDays(notes) {
  let best = null;
  for (const n of notes || []) {
    const note = typeof n === 'string' ? n : n?.note;
    const days = leadTimeDays(note);
    if (days == null) continue;
    if (!best || days > best.days) best = { days, note, from: typeof n === 'string' ? null : (n.label || null) };
  }
  return best;
}
