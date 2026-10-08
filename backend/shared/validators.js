/* ══════════════════════════════════════════════════════════
   validators — what an Indian phone, PAN, GSTIN, IFSC, bank account,
   pincode and email look like.

   A tester saved a vendor with the phone "09885300702xdf", the account
   holder "dfaefa132131231231", the IFSC "XDADA1" and the PAN "SADSAD2323",
   and every one of them was accepted. Those values are printed on purchase
   orders and invoices, and a payment sent to a malformed account or IFSC
   bounces days later, by which time nobody remembers who typed it.

   The same rules live in frontend/src/lib/validators.js so the form can say
   what is wrong as you type. Keep the two in step.

   Two deliberate limits:
   · Only fields that are present and non-empty are checked. Blank is not
     "wrong", it is "not known yet", and every one of these is optional.
   · On an edit, a value that has not changed is not re-checked, so an
     older record holding an odd value can still have its other fields
     corrected. Pass the stored row as `existing` for that.
   ══════════════════════════════════════════════════════════ */

const blank = (v) => v == null || String(v).trim() === '';

/* Mobile: 10 digits starting 6-9, optionally written +91 / 91 / 0 first.
   Landline: STD code and number, written with the 0 or +91 in front —
   "040 2345 6789", "+91-40-23456789". Spaces and hyphens are allowed as
   people write them; nothing else is. */
function phone(v) {
  const s = String(v).trim();
  if (!/^\+?[\d\s-]+$/.test(s)) return 'Use digits only (spaces and hyphens are fine), e.g. 98850 00000';
  const d = s.replace(/[\s-]/g, '');
  if (/^(?:\+91|91|0)?[6-9]\d{9}$/.test(d)) return null;              // mobile
  if (/^(?:\+91|0)[1-9]\d{9}$/.test(d)) return null;                  // landline with STD code
  return 'Enter a 10-digit mobile number, or a landline with its STD code, e.g. 040 2345 6789';
}

/* RFC-lite: one @, no spaces, a dotted domain, and no dot at either end of
   the name part (".pulupula@gmail.com" was accepted). */
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

/* 15 characters: state code (01-38, or 97 for other territory), the PAN,
   an entity number, the letter Z, and a check character. The check
   character itself is not verified, so a mistyped GSTIN that still has the
   right shape gets through. */
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

/* As the bank holds it. Letters in any script, spaces, and . & ' — which
   covers "S. K. Enterprises", "Patel & Sons" and "D'Souza". */
/* Account names as Indian banks print them: "M/s Sharma Enterprises",
   "ABC (OPC) Pvt. Ltd.", "A-1 Traders". Letters must be there; the
   punctuation and digits a business name carries are allowed. */
function accountHolder(v) {
  const s = String(v).trim();
  if (/\d{4,}/.test(s)) return 'That looks like a number — enter the name on the bank account';   // "dfaefa132131231231"
  return /^[\p{L}\p{M}0-9 .&'/()\-,]+$/u.test(s) && (s.match(/\p{L}/gu) || []).length >= 2 && s.length <= 100
    ? null : "Use the name as the bank has it — letters, spaces and . & ' / ( ) - , only";
}

function pincode(v) {
  return /^[1-9][0-9]{5}$/.test(String(v).trim()) ? null : 'A pincode is 6 digits and does not start with 0';
}

const RULES = { phone, email, pan, gstin, ifsc, accountNumber, accountHolder, pincode };

/** The message for one value, or null when it is fine (or blank). */
function check(kind, value) {
  if (blank(value)) return null;
  const rule = RULES[kind];
  return rule ? rule(value) : null;
}

/** When both are given, the PAN inside the GSTIN must be the PAN. */
function gstinPanMismatch(g, p) {
  if (blank(g) || blank(p)) return null;
  const G = String(g).trim().toUpperCase(), P = String(p).trim().toUpperCase();
  if (G.length !== 15 || P.length !== 10) return null;   // the shape checks speak first
  return G.slice(2, 12) === P ? null : `The PAN does not match the GSTIN — the GSTIN holds ${G.slice(2, 12)}`;
}

const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

/**
 * The first problem in a request body, or null.
 *
 * @param {object} body      the request body
 * @param {object} spec      { column: [kind, 'Label'] } — e.g. { contactPhone: ['phone', 'Phone'] }
 * @param {object} [opts]
 * @param {object} [opts.existing]  the stored row; unchanged values are not re-checked
 * @param {[string,string]} [opts.pair]  [gstinColumn, panColumn] to cross-check
 * @returns {{ field: string, error: string } | null}
 */
function firstProblem(body, spec, { existing = null, pair = null } = {}) {
  const b = body || {};
  for (const [col, [kind, label]] of Object.entries(spec)) {
    if (!(col in b) || blank(b[col])) continue;
    if (existing && same(b[col], existing[col])) continue;
    const msg = check(kind, b[col]);
    if (msg) return { field: col, error: `${label}: ${msg}` };
  }
  if (pair) {
    const [gc, pc] = pair;
    /* Either side may come from the stored row when only one is sent. */
    const g = gc in b ? b[gc] : existing?.[gc];
    const p = pc in b ? b[pc] : existing?.[pc];
    const changed = !existing || !same(g, existing[gc]) || !same(p, existing[pc]);
    const msg = changed ? gstinPanMismatch(g, p) : null;
    if (msg) return { field: pc in b ? pc : gc, error: `PAN: ${msg}` };
  }
  return null;
}

/* The columns each record carries, and what to call them in a message. */
const VENDOR_SPEC = {
  contactPhone: ['phone', 'Phone'],
  contactEmail: ['email', 'Email'],
  gstin: ['gstin', 'GSTIN'],
  pan: ['pan', 'PAN'],
  pincode: ['pincode', 'Pincode'],
  account_holder: ['accountHolder', 'Account holder'],
  account_number: ['accountNumber', 'Account number'],
  ifsc_code: ['ifsc', 'IFSC'],
};
const CUSTOMER_SPEC = {
  phone: ['phone', 'Phone'],
  email: ['email', 'Email'],
  gstin: ['gstin', 'GSTIN'],
  pan: ['pan', 'PAN'],
};
const COMPANY_SPEC = {
  phone: ['phone', 'Phone'],
  email: ['email', 'Email'],
  gstin: ['gstin', 'GSTIN'],
  pan: ['pan', 'PAN'],
  bank_account_name: ['accountHolder', 'Account holder name'],
  bank_account_no: ['accountNumber', 'Account number'],
  bank_ifsc: ['ifsc', 'IFSC code'],
};
const PERSON_SPEC = { phone: ['phone', 'Phone'] };

module.exports = {
  check, gstinPanMismatch, firstProblem, RULES,
  VENDOR_SPEC, CUSTOMER_SPEC, COMPANY_SPEC, PERSON_SPEC,
};
