/* ══════════════════════════════════════════════════════════
   dates — one definition of "today" for every form.

   Every document form initialised its date field to '', so a person filling
   in a quotation, invoice or challan and pressing Create produced an undated
   document unless they happened to notice the empty box. On this database
   that was 4 of 4 quotations, 3 of 4 invoices and 2 of 3 challans. An
   undated tax invoice is not a valid one under Rule 46(b).

   The server now floors these to CURRENT_DATE as a safety net, but the field
   should still show the date it is going to use — a form that silently fills
   in a value you cannot see is its own kind of wrong.

   Deliberately NOT toISOString().slice(0, 10): that is UTC, so between
   midnight and 05:30 IST it returns yesterday. An invoice dated a day early
   is a real problem in a GST return. 'en-CA' formats as YYYY-MM-DD — the
   shape <input type="date"> requires — in the browser's own timezone.
   ══════════════════════════════════════════════════════════ */

/** Today, as YYYY-MM-DD in the user's timezone. */
export const today = () => new Date().toLocaleDateString('en-CA');

/** `days` from today, same format. For "valid until" and payment due dates. */
export const daysFromToday = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toLocaleDateString('en-CA');
};
