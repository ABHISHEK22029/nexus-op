/* ══════════════════════════════════════════════════════════
   docNumber — document series belong to the business, not to us.

   Purchase orders were numbered by string literal, in two places:

       const poNumber = `Kirashi/FY2026-27/${seq}`;

   So every organisation using this product issued purchase orders with
   another company's name in the number, on a document that goes to their
   vendors — and stamped with a financial year that was never going to roll
   over. In April 2027 every PO would still have said FY2026-27.

   The prefix now comes from the organisation's own profile, and the
   financial year is computed from the document's date against the year start
   the business has configured (April in India, but it is a setting).

   Nothing here invents a fallback company name. If a business has not told
   us what it is called yet, the series is just "PO" — anonymous is correct;
   somebody else's trade name is not.
   ══════════════════════════════════════════════════════════ */

/** Month names as stored in company_profile.fyStart. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The financial year a date falls in, as "FY2026-27".
 *
 * With an April start, 31 March 2027 is FY2026-27 and 1 April 2027 is
 * FY2027-28. Computed rather than hardcoded, because a hardcoded year is
 * wrong for at most twelve months and then wrong forever.
 */
function financialYear(date = new Date(), fyStartMonth = 'April') {
  const startIdx = Math.max(0, MONTHS.indexOf(fyStartMonth));   // 0-based; April = 3
  const y = date.getFullYear();
  const m = date.getMonth();
  const startYear = m >= startIdx ? y : y - 1;
  /* A year starting in January is a calendar year — "FY2026-27" would be a
     lie, so it is rendered as "FY2026". */
  if (startIdx === 0) return `FY${startYear}`;
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * A short, document-safe prefix for this business.
 *
 * Prefers an explicitly configured prefix, then the trade name, then the
 * legal name — initials for a multi-word name, so "Steelco Fabrication
 * Private Limited" becomes SFPL rather than a 31-character document number.
 * Strips anything that would be awkward in a filename or a URL.
 */
function orgPrefix(profile = {}) {
  const explicit = (profile.doc_prefix || '').trim();
  if (explicit) return sanitise(explicit);

  const source = (profile.tradeName || profile.name || '').trim();
  if (!source) return 'PO';                    // anonymous, never borrowed

  const cleaned = source.replace(/\b(private|pvt|limited|ltd|llp|inc|co|company)\b\.?/gi, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return sanitise(words[0]).slice(0, 12);
  return sanitise(words.map(w => w[0]).join('')).slice(0, 6);
}

const sanitise = (s) => String(s).replace(/[^A-Za-z0-9-]/g, '').toUpperCase();

/**
 * Build a document number: PREFIX/FY2026-27/007
 *
 * `series` lets one business run separate sequences per document type
 * without them colliding — PO, INV, DC and so on.
 */
function docNumber({ profile = {}, seq, series = null, date = new Date(), pad = 3 }) {
  const parts = [orgPrefix(profile)];
  if (series) parts.push(sanitise(series));
  parts.push(financialYear(date, profile.fyStart || 'April'));
  parts.push(String(seq).padStart(pad, '0'));
  return parts.join('/');
}

/** Read the singleton profile once per call site. Cheap, and always current. */
async function loadProfile(db) {
  try {
    const { rows } = await db.query(
      'SELECT name, "tradeName", "fyStart", doc_prefix FROM company_profile LIMIT 1');
    return rows[0] || {};
  } catch {
    /* A missing doc_prefix column (migration not yet run) must not stop
       anyone raising a purchase order. */
    try {
      const { rows } = await db.query('SELECT name, "tradeName", "fyStart" FROM company_profile LIMIT 1');
      return rows[0] || {};
    } catch { return {}; }
  }
}

module.exports = { docNumber, financialYear, orgPrefix, loadProfile };
