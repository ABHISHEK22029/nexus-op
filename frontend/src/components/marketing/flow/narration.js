/* ══════════════════════════════════════════════════════════════════════
   The walkthrough's voice-over script — one line per stage, and one for
   the closing card.

   Plain JavaScript on purpose: the site reads it, and so does the script
   that records it (scripts/voiceover/make.mjs). Each sentence is recorded
   as its own clip, named by a hash of its words, so changing a sentence
   here without recording it again cannot play the old words — the new
   sentence simply has no clip yet, and the browser's own voice reads it
   until `node make.mjs` is run.

   Written to be heard, not read: no record numbers, no "SS304", numbers a
   voice says naturally. Each line fits roughly inside its stage; a stage
   waits for its line to finish before handing over.
   ══════════════════════════════════════════════════════════════════════ */

export const NARRATION = {
  enquiry: 'A customer finds your bracket in your online catalogue, and asks for 120 pieces. The enquiry lands in Maks Ops on its own.',
  quotation: 'Price it once. The GST follows the place of supply, the quotation goes out by email, and the customer accepts.',
  order: 'Before you promise a date, Maks Ops checks your stock. This order is 180 kilos of sheet short.',
  purchase: 'Vendor quotes arrive as Excel, PDF and Word. Maks Ops reads them all, and the lowest wins the order.',
  grn: 'The sheet arrives. Receive it against the order, and your stock updates itself.',
  production: 'Issue the material, log the output and the scrap. Yield and cost per piece follow.',
  invoice: 'Finally, the GST invoice, numbered in sequence with the e-way bill, goes straight to the customer.',
  closing: 'One enquiry. One connected operation. That’s Maks Ops.',
};

export const sentences = (text) =>
  String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/* FNV-1a over the sentence: a stable, short file name for its clip. */
export const clipName = (sentence) => {
  let h = 0x811c9dc5;
  for (const ch of String(sentence)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.mp3`;
};

export const CLIP_DIR = '/voice/';
