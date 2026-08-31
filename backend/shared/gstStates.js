/* ══════════════════════════════════════════════════════════
   GST state codes — the first two digits of every GSTIN.

   Why this exists: under GST the CGST+SGST vs IGST split follows the
   PLACE OF SUPPLY (where the goods actually go), not the billing address.
   A fabricator billing a head office in Telangana but delivering to a site
   in Maharashtra must charge IGST. Comparing state *names* typed by hand is
   unreliable ("TN" / "Tamilnadu" / "Tamil Nadu"), so we normalise everything
   to the official 2-digit code and compare those.
   ══════════════════════════════════════════════════════════ */

const GST_STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'],
  ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'],
  ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'],
  ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'],
  ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'],
  ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'],
];

// Common spellings/abbreviations users actually type.
const ALIASES = {
  'jammu & kashmir': '01', 'j&k': '01', 'hp': '02', 'uttarakhand': '05',
  'uttaranchal': '05', 'new delhi': '07', 'nct of delhi': '07', 'up': '09',
  'wb': '19', 'orissa': '21', 'mp': '23', 'daman and diu': '26',
  'dadra and nagar haveli': '26', 'maharastra': '27', 'karnatka': '29',
  'tamilnadu': '33', 'tn': '33', 'pondicherry': '34', 'ap': '37',
  'andhrapradesh': '37', 'telengana': '36', 'telagana': '36',
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const BY_CODE = new Map(GST_STATES);
const BY_NAME = new Map(GST_STATES.map(([code, name]) => [norm(name), code]));

/** Resolve anything (code, name, alias, or a full GSTIN) to a 2-digit code. */
function toStateCode(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // A full GSTIN (15 chars) or a bare 2-digit code
  if (/^\d{2}$/.test(raw)) return BY_CODE.has(raw) ? raw : null;
  if (/^\d{2}[A-Z]/i.test(raw) && raw.length >= 15) {
    const c = raw.substring(0, 2);
    return BY_CODE.has(c) ? c : null;
  }
  const n = norm(raw);
  return BY_NAME.get(n) || ALIASES[n] || null;
}

/** Human-readable state name for a code (or pass-through if already a name). */
function toStateName(value) {
  const code = toStateCode(value);
  return code ? BY_CODE.get(code) : (value ? String(value).trim() : null);
}

/**
 * Is this an inter-state supply?
 * Returns null when it cannot be determined — callers should not guess,
 * because guessing wrong means charging the wrong tax.
 */
function isInterstate(supplierState, placeOfSupplyState) {
  const a = toStateCode(supplierState);
  const b = toStateCode(placeOfSupplyState);
  if (!a || !b) return null;
  return a !== b;
}

module.exports = {
  GST_STATES,
  toStateCode,
  toStateName,
  isInterstate,
  stateList: () => GST_STATES.map(([code, name]) => ({ code, name })),
};
