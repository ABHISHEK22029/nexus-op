/* ══════════════════════════════════════════════════════════════════════
   search — every word, anywhere, in any order.

   Searching a product list for one exact substring meant "cross arm 75"
   found nothing when the name was "Cross Arm (V-type) 75x75", and a code,
   an HSN or a category could not be searched at all. People search the way
   they talk: a few words, half of one, in whatever order occurs to them.

   So a query is split into words and a row matches when EVERY word appears
   somewhere in ANY of its fields, ignoring case. The server does the same
   for paged lists (backend/shared/listQuery.js, and the public catalogue);
   this is for lists that are already wholly in the browser.
   ══════════════════════════════════════════════════════════════════════ */

/** The words of a query, lower-cased; at most eight, as on the server. */
export const searchWords = (query) =>
  String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

/** True when every word of `query` is somewhere in `fields`. */
export function matchesWords(query, ...fields) {
  const words = searchWords(query);
  if (!words.length) return true;
  const hay = fields.flat().filter(v => v != null && v !== '').join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}
