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

module.exports = { readTerms, matchMaterial, normName };
