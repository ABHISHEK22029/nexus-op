/* ══════════════════════════════════════════════════════════════════════
   What a vendor quotation says beside its prices, and which material each
   quoted line is.

   readTerms(text)  delivery, payment and freight, read from the words of
                    the quotation where it states them. Conservative: a
                    term that is not plainly there comes back null, and a
                    person fills it in when checking the quotation —
                    guessing "freight included" is how the dearer vendor
                    gets picked.

   matchMaterial(description, materials)
                    the company's material a quoted line names, or null.
                    Exact wording first (compared the way a goods receipt
                    compares names, so the same rule links a line here and
                    finds its stock later); otherwise the comparison's own
                    "same item" measure, where sizes must agree — a 6 mm
                    sheet never becomes the 2 mm one. Only a clear winner
                    is linked; a near tie stays unlinked for a person.
   ══════════════════════════════════════════════════════════════════════ */
const { similarity, itemSignature } = require('./quoteParser');

/* the same normalisation the SQL uses: lower case, × as x, anything
   that is not a letter or digit as a space */
const normName = (s) => String(s || '').replace(/[×X]/g, 'x').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matchMaterial(description, materials) {
  const want = normName(description);
  if (!want || !materials?.length) return null;
  const exact = materials.filter((m) => normName(m.name) === want);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const sig = itemSignature(description);
  const scored = materials
    .map((m) => ({ id: m.id, score: similarity(sig, itemSignature(m.name)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < 0.6) return null;
  if (next && best.score - next.score < 0.15) return null;
  return best.id;
}

/* ── the terms ── */
const SEP = '\\s*(?:[:\\-–=,|]|\\bis\\b)?\\s*';
const toDays = (n, unit) => (/^w/i.test(unit) ? n * 7 : n);

function readLeadTime(t) {
  /* "Delivery: 7 days", "Lead time 2-3 weeks", "Dispatch within 10 working days" */
  const range = new RegExp(`(?:delivery|lead\\s*time|dispatch)(?:\\s*(?:period|time|schedule|date))?${SEP}(?:within\\s*|in\\s*)?(\\d{1,3})\\s*(?:-|to|–)?\\s*(\\d{1,3})?\\s*(?:working\\s*)?(days?|weeks?|wks?)\\b`, 'i');
  const m = t.match(range);
  if (m) return toDays(Number(m[2] || m[1]), m[3]);
  /* "Delivery: ex-stock" / "immediate" / "ready stock" */
  if (new RegExp(`(?:delivery|lead\\s*time|dispatch)${SEP}(?:ex[-\\s]?stock|immediate(?:ly)?|ready\\s*stock|from\\s*stock)`, 'i').test(t)) return 0;
  return null;
}

function readPayment(t) {
  /* "Payment terms: 30 days credit", "Payment - 50% advance, balance before dispatch" */
  const m = t.match(new RegExp(`payment(?:\\s*terms?)?${SEP}([^\\n\\r;|]{2,80})`, 'i'));
  if (m) {
    const v = m[1].replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim();
    if (v && !/^\d+(\.\d+)?$/.test(v)) return v.slice(0, 80);
  }
  const credit = t.match(/\b(\d{1,3})\s*days?\s*(?:credit|from\s*(?:the\s*)?(?:date\s*of\s*)?invoice|pdc)\b/i);
  if (credit) return `${credit[1]} days credit`;
  const adv = t.match(/\b(100\s*%\s*advance|advance\s*payment|against\s*(?:proforma|delivery)|cash\s*on\s*delivery|before\s*dispatch)\b/i);
  return adv ? adv[1].replace(/\s+/g, ' ') : null;
}

function readFreight(t) {
  const m = t.match(new RegExp(`(?:freight|transport(?:ation)?)(?:\\s*charges?)?${SEP}(extra|included|inclusive|incl\\.?|in\\s*your\\s*scope|in\\s*our\\s*scope|to\\s*pay|paid|at\\s*actuals?|actuals?|borne\\s*by\\s*(?:us|the\\s*buyer|buyer|you|vendor|supplier)|free)`, 'i'));
  if (m) {
    const w = m[1].toLowerCase();
    if (/incl|free|paid|our\s*scope|by\s*(us|vendor|supplier)/.test(w)) return 'Included';
    return 'Extra';
  }
  if (/\bf\.?\s*o\.?\s*r\.?\s*(?:destination|site|your\s*(?:works|site|stores))\b/i.test(t)) return 'Included';
  if (/\bex[-\s]?works\b/i.test(t)) return 'Extra';
  return null;
}

function readTerms(text) {
  const t = String(text || '').slice(0, 200000);
  return { lead_time_days: readLeadTime(t), payment_terms: readPayment(t), freight: readFreight(t) };
}

/* ── who sent it, and its number and date ──
   An uploaded quotation came back "Not named", with no quote number, though
   both are printed at the top of every one: the vendor's letterhead, and
   "Quote No: FY26-27/003.01", "Date: 05/10/2026". They were only ever taken
   from the upload form. Now they are read from the document, and the form
   (or a vendor picked from the list) still wins. */
const GSTIN = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const COMPANY = /\b(pvt|private|ltd|limited|llp|industries|enterprises?|engineering|engineers|works|traders|trading|steels?|metals?|corporation|corp|company|co\.|agencies|fabricators?|solutions|suppliers?|associates|group|infra|synergies)\b/i;
const HEADING = /^(quotation|quote|tax\s*invoice|invoice|proforma|estimate|offer|purchase\s*order|delivery\s*challan|bill)\b/i;

/** "05/10/2026", "05-10-26", "05.10.2026", "05 Oct 2026", "Oct 5, 2026" → "2026-10-05" (Indian day-first). */
function isoDate(s) {
  const v = String(s || '').trim();
  let d, m, y;
  let r = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (r) { [, d, m, y] = r.map(Number); }
  else if ((r = v.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2,4})$/))) { d = Number(r[1]); m = MONTHS[r[2].slice(0, 4).toLowerCase()] || MONTHS[r[2].slice(0, 3).toLowerCase()]; y = Number(r[3]); }
  else if ((r = v.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) { m = MONTHS[r[1].slice(0, 4).toLowerCase()] || MONTHS[r[1].slice(0, 3).toLowerCase()]; d = Number(r[2]); y = Number(r[3]); }
  if (!d || !m || !y) return null;
  if (y < 100) y += 2000;
  if (m > 12 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

function readHeader(text) {
  const lines = String(text || '').slice(0, 20000).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const top = lines.slice(0, 40);
  /* The number: "Quote No: …", "Quotation No. …", "Offer Ref: …", or a bare
     "No.: …" at the start of a line. It must have a digit in it. */
  let quoteRef = null;
  const REF = /(?:^|\b)(?:quot(?:e|ation)|offer|proposal|estimate)\s*(?:no\.?|number|ref(?:erence)?\.?|#)\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9/\-._]*)/i;
  const BARE = /^(?:no\.?|ref(?:erence)?\s*no\.?|our\s*ref\.?)\s*[:.\-#]\s*([A-Z0-9][A-Z0-9/\-._]*)/i;
  for (const l of top) {
    const m = l.match(REF) || l.match(BARE);
    if (m && /\d/.test(m[1])) { quoteRef = m[1].replace(/[.,;]+$/, '').slice(0, 60); break; }
  }
  /* The date: a line that starts with "Date" (or "Quote date", "Dated"),
     never "Valid until" / "Validity". */
  let quoteDate = null;
  const DATE_AT = /\b(?:quot(?:e|ation)\s*|offer\s*)?dated?\b\s*[:.\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[\s-]+[A-Za-z]{3,9}\.?,?[\s-]+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/gi;
  for (const l of top) {
    for (const m of l.matchAll(DATE_AT)) {
      /* Not the validity, due or delivery date. */
      if (/(valid(ity)?|until|till|upto|due|delivery|expiry|expires?)\s*[:.\-]?\s*$/i.test(l.slice(Math.max(0, m.index - 16), m.index))) continue;
      const iso = isoDate(m[1]);
      if (iso) { quoteDate = iso; break; }
    }
    if (quoteDate) break;
  }
  /* Who sent it: the letterhead — the first of the opening lines that reads
     as a company name (a suffix like Pvt Ltd, Industries, Works), else the
     very first line when it is not a heading or an address. */
  const cleanName = (l) => l.split(/\t|\s{2,}/)[0].replace(/\b(quotation|tax\s*invoice|proforma\s*invoice)\b.*$/i, '').replace(/^m\/s\.?\s*/i, '').trim();
  let vendorName = null;
  for (const l of top.slice(0, 6)) {
    const n = cleanName(l);
    if (n.length >= 3 && n.length <= 90 && COMPANY.test(n) && !HEADING.test(n) && !/\d{3,}/.test(n)) { vendorName = n; break; }
  }
  if (!vendorName && top[0]) {
    const n = cleanName(top[0]);
    if (n.length >= 3 && n.length <= 90 && /[a-z]/i.test(n) && !HEADING.test(n) && !/\d{3,}|@|www\./i.test(n)) vendorName = n;
  }
  /* The letterhead's GSTIN is the first one printed; the buyer's comes later. */
  const g = String(text || '').slice(0, 20000).match(GSTIN);
  return { quote_ref: quoteRef, quote_date: quoteDate, vendor_name: vendorName, vendor_gstin: g ? g[1] : null };
}

module.exports = { readTerms, readHeader, matchMaterial, normName };
