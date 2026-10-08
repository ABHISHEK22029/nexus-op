/* ══════════════════════════════════════════════════════════════════════
   leadTime — "2–3 weeks" is 21 days.

   A product's lead time is free text, typed the way people say it: "10
   days", "2-3 weeks", "15 working days", "1 month". A quotation promises
   delivery as a number of days after the order, so to suggest that number
   the text has to be read.

   The rule, in one place:
     · a range promises its upper bound — "2-3 weeks" is 3 weeks, not 2;
     · working (business) days are five in seven, so ×7/5, rounded up;
     · weeks ×7, months ×30, hours ÷24, and part days round up;
     · a number on its own ("7-10") is days, but only when the note is
       nothing else — "from Jan 2026" must not become 730 days;
     · several figures in one note: the longest.
   Anything it cannot read is null, never a guess. And across the lines of
   a quotation the longest lead time wins, because the order ships when its
   slowest line is ready.

   The same rules are in frontend/src/lib/leadTime.js, which suggests the
   figure in the quotation builder as products are picked.
   scripts/test-sales-flow.js runs both over the same cases.
   ══════════════════════════════════════════════════════════════════════ */

const MAX_DAYS = 730;   // the column's own CHECK: two years

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
  /* 15 × 7 / 5 is 21 exactly; floating point can make it 21.000000000004,
     which would round up to 22. */
  return Math.min(MAX_DAYS, Math.ceil(Math.round(d * 1000) / 1000));
};

/** "2-3 weeks" → 21. null when the note says no number of days. */
function leadTimeDays(text) {
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

/**
 * The delivery to suggest for a set of lead-time notes: the longest.
 * @param {Array<{note:string, label?:string}>|string[]} notes
 * @returns {{days:number, from:string|null, note:string}|null}
 */
function suggestDeliveryDays(notes) {
  let best = null;
  for (const n of notes || []) {
    const note = typeof n === 'string' ? n : n?.note;
    const days = leadTimeDays(note);
    if (days == null) continue;
    if (!best || days > best.days) best = { days, note, from: typeof n === 'string' ? null : (n.label || null) };
  }
  return best;
}

module.exports = { leadTimeDays, suggestDeliveryDays, MAX_DAYS };
