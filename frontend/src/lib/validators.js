/* ══════════════════════════════════════════════════════════
   validators — what an Indian phone, PAN, GSTIN, IFSC, bank account,
   pincode and email look like, said next to the field as you type.

   The same rules run on the server (backend/shared/validators.js), which
   refuses a bad value with a 400 naming the field. Keep the two in step.

   Blank is never an error here: every one of these fields is optional, and
   "not known yet" is not "wrong". On an edit, pass the values the record
   was loaded with and an unchanged value is left alone, so an older record
   with an odd value in one field can still be corrected in another.
   ══════════════════════════════════════════════════════════ */

const blank = (v) => v == null || String(v).trim() === '';

function phone(v) {
  const s = String(v).trim();
  if (!/^\+?[\d\s-]+$/.test(s)) return 'Use digits only (spaces and hyphens are fine), e.g. 98850 00000';
  const d = s.replace(/[\s-]/g, '');
  if (/^(?:\+91|91|0)?[6-9]\d{9}$/.test(d)) return null;              // mobile
  if (/^(?:\+91|0)[1-9]\d{9}$/.test(d)) return null;                  // landline with STD code
  return 'Enter a 10-digit mobile number, or a landline with its STD code, e.g. 040 2345 6789';
}

function email(v) {
  const s = String(v).trim();
  if (s.length > 254) return 'That email address is too long';
  const ok = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(s);
  return ok ? null : 'Enter a valid email address, e.g. accounts@company.com';
}

function pan(v) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(v).trim().toUpperCase())
    ? null : 'A PAN is 10 characters: 5 letters, 4 digits, 1 letter, e.g. AABCN1234M';
}

function gstin(v) {
  const s = String(v).trim().toUpperCase();
  if (s.length !== 15) return `A GSTIN is 15 characters; this has ${s.length}`;
  const st = Number(s.slice(0, 2));
  if (!/^\d{2}$/.test(s.slice(0, 2)) || !((st >= 1 && st <= 38) || st === 97)) {
    return 'A GSTIN starts with a state code from 01 to 38 (or 97), e.g. 33 for Tamil Nadu';
  }
  if (pan(s.slice(2, 12))) return 'Characters 3 to 12 of a GSTIN are the PAN (5 letters, 4 digits, 1 letter)';
  if (!/^[1-9A-Z]$/.test(s[12])) return 'The 13th character of a GSTIN is a number 1-9 or a letter';
  if (s[13] !== 'Z') return 'The 14th character of a GSTIN is always Z';
  if (!/^[0-9A-Z]$/.test(s[14])) return 'The last character of a GSTIN is a letter or a digit';
  return null;
}

function ifsc(v) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v).trim().toUpperCase())
    ? null : 'An IFSC is 11 characters: 4 letters, a zero, then 6 letters or digits, e.g. HDFC0001234';
}

function accountNumber(v) {
  return /^\d{9,18}$/.test(String(v).trim()) ? null : 'A bank account number is 9 to 18 digits, with no spaces or letters';
}

/* Account names as Indian banks print them: "M/s Sharma Enterprises",
   "ABC (OPC) Pvt. Ltd.", "A-1 Traders" — the same rule as the server. */
function accountHolder(v) {
  const s = String(v).trim();
  if (/\d{4,}/.test(s)) return 'That looks like a number — enter the name on the bank account';   // "dfaefa132131231231"
  return /^[\p{L}\p{M}0-9 .&'/()\-,]+$/u.test(s) && (s.match(/\p{L}/gu) || []).length >= 2 && s.length <= 100
    ? null : "Use the name as the bank has it — letters, spaces and . & ' / ( ) - , only";
}

function pincode(v) {
  return /^[1-9][0-9]{5}$/.test(String(v).trim()) ? null : 'A pincode is 6 digits and does not start with 0';
}

export const RULES = { phone, email, pan, gstin, ifsc, accountNumber, accountHolder, pincode };

/** The message for one value, or null when it is fine (or blank). */
export function check(kind, value) {
  if (blank(value)) return null;
  const rule = RULES[kind];
  return rule ? rule(value) : null;
}

/** When both are given, the PAN inside the GSTIN must be the PAN. */
export function gstinPanMismatch(g, p) {
  if (blank(g) || blank(p)) return null;
  const G = String(g).trim().toUpperCase(), P = String(p).trim().toUpperCase();
  if (G.length !== 15 || P.length !== 10) return null;
  return G.slice(2, 12) === P ? null : `This PAN does not match the GSTIN, which holds ${G.slice(2, 12)}`;
}

const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

/**
 * Every problem in a form, keyed by field.
 *
 * @param {object} values    the form's current values
 * @param {object} spec      { key: kind } — e.g. { phone: 'phone', ifsc: 'ifsc' }
 * @param {object} [opts]
 * @param {object} [opts.original]  values the record was loaded with; unchanged ones are skipped
 * @param {[string,string]} [opts.pair]  [gstinKey, panKey] to cross-check
 * @returns {object} { key: message }
 */
export function formProblems(values, spec, { original = null, pair = null } = {}) {
  const out = {};
  for (const [key, kind] of Object.entries(spec)) {
    if (original && same(values[key], original[key])) continue;
    const msg = check(kind, values[key]);
    if (msg) out[key] = msg;
  }
  if (pair) {
    const [gk, pk] = pair;
    const changed = !original || !same(values[gk], original[gk]) || !same(values[pk], original[pk]);
    const msg = changed && !out[gk] && !out[pk] ? gstinPanMismatch(values[gk], values[pk]) : null;
    if (msg) out[pk] = msg;
  }
  /* In the order the fields sit on the form, so "fix PAN, Phone" reads top
     to bottom whichever check found them. */
  return Object.fromEntries(Object.keys(spec).filter(k => out[k]).map(k => [k, out[k]]));
}

/** "Fix the 2 fields marked in red: Phone, IFSC" — what a blocked save button says. */
export function fixMessage(problems, labels = {}) {
  const keys = Object.keys(problems);
  if (!keys.length) return '';
  const names = keys.map(k => labels[k] || k);
  return keys.length === 1
    ? `Fix ${names[0]} before saving — it is marked in red`
    : `Fix the ${keys.length} fields marked in red before saving: ${names.join(', ')}`;
}
