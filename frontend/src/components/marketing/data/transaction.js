/* ══════════════════════════════════════════════════════════════════════
   The one sample transaction the marketing pages show.

   The homepage walkthrough and the product film tell the same story with
   the same numbers: one customer, one bracket, one order, carried through
   every stage. They read it from here, and so do the checks that keep the
   story honest (scripts/check-film.mjs), which is why this is plain
   JavaScript with no JSX and no React.

   Document numbers are in the app's own formats — the ones a visitor
   would see if they signed up and did this themselves:
     ENQ-0042          catalogue enquiry           (CatalogueController)
     QT- CO- DC- INV-  4 digits                    (shared/docSeries)
     PFW/FY2026-27/018 purchase order: the company's initials, the
                       financial year, a 3-digit counter (shared/docNumber)
     GRN-00031         goods receipt, 5 digits     (routes/grn)
     PROD-0005         production order            (ProductionController)

   The financial year in the PO number follows the date it is drawn for, as
   the app's does, so the homepage never shows last year's number. The film
   pins its date (FILM_DATE) so a recording is the same every time.
   ══════════════════════════════════════════════════════════════════════ */

export const FILM_DATE = new Date(2026, 9, 7);   // 7 Oct 2026, FY2026-27

/** "FY2026-27" for a date, April start — the same rule as shared/docNumber. */
export const financialYear = (date = new Date()) => {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `FY${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/** A date `offset` days from `base`, as a document prints it: 07 Oct 2026. */
export const makeDay = (base = new Date()) => (offset = 0) => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const SELLER = {
  name: 'Precision Fab Works', initials: 'PFW', city: 'Hyderabad', state: 'Telangana',
  stateCode: '36', gstin: '36AAMCK2569F1Z9',
};
export const CUSTOMER = {
  name: 'Acme Engineering Pvt. Ltd.', short: 'Acme Engineering', contact: 'Ravi Kumar',
  email: 'purchase@acme.example', city: 'Hyderabad', state: 'Telangana',
};
export const CATALOGUE_URL = 'maksops.co.in/c/precision-fab';

export const PRODUCT = {
  name: 'SS304 Mounting Bracket', slug: 'ss304-mounting-bracket', code: 'BRK-304',
  hsn: '7326', unit: 'nos', rate: 2320, moq: 50, leadTime: '2 weeks', category: 'Brackets',
};
export const MATERIAL = { name: 'SS304 sheet, 2 mm', unit: 'kg', perPiece: 2.5 };

/* The order and its money. 120 × ₹2,320 = ₹2,78,400; CGST 9% + SGST 9%
   (Telangana to Telangana) = ₹50,112; ₹3,28,512, rounded off by −₹12. */
export const QTY = 120;
export const RATE = PRODUCT.rate;
export const SUB = QTY * RATE;                      // 278400
export const HALF_GST = Math.round(SUB * 0.09);     // 25056
export const ROUND_OFF = -12;
export const TOTAL = SUB + HALF_GST * 2 + ROUND_OFF; // 328500

/* The material behind it. Open orders need 323 kg; 143 kg is on hand, so
   180 kg is short. On hand alone builds 57 of the 120 brackets (143 ÷ 2.5,
   rounded down — the order-readiness rule in MaterialRequirements). */
export const STOCK = { needed: 323, onHand: 143, short: 180, after: 323, buildable: 57 };

/* Three vendors quote the 180 kg. Deccan is lowest like for like. */
export const VENDORS = [
  { name: 'Apex Steel Traders', file: 'apex-quote.xlsx', kind: 'excel', rate: 283 },
  { name: 'Deccan Metals', file: 'deccan-metals.pdf', kind: 'pdf', rate: 260, best: true },
  { name: 'Sunrise Alloys', file: 'sunrise-quotation.docx', kind: 'word', rate: 276 },
];
export const PO_VALUE = STOCK.short * 260;          // ₹46,800 before GST
export const APPROVAL_THRESHOLD = 40000;            // so it is held for sign-off

export const YIELD = { issued: 300, made: QTY, scrap: 17.4, yieldPct: 94.2, costPerPiece: 642 };

/** The transaction's record numbers, for a date. */
export const makeIds = (date = new Date()) => ({
  enq: 'ENQ-0042',
  qt: 'QT-0007',
  co: 'CO-0012',
  po: `${SELLER.initials}/${financialYear(date)}/018`,
  grn: 'GRN-00031',
  prod: 'PROD-0005',
  dc: 'DC-0009',
  inv: 'INV-0147',
});

/** What each kind of number must look like — the tests check against these. */
export const ID_PATTERNS = {
  enq: /^ENQ-\d{4}$/,
  qt: /^QT-\d{4}$/,
  co: /^CO-\d{4}$/,
  po: /^[A-Z0-9-]+\/FY\d{4}(-\d{2})?\/\d{3,}$/,
  grn: /^GRN-\d{5}$/,
  prod: /^PROD-\d{4}$/,
  dc: /^DC-\d{4}$/,
  inv: /^INV-\d{4}$/,
};
