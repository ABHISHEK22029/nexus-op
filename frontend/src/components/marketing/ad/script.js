/* ══════════════════════════════════════════════════════════════════════
   The homepage ad — its whole timeline in one place.

   Fifty-eight seconds, one transaction: the walkthrough's customer, bracket
   and record numbers (data/transaction.js), carried from a catalogue to
   cash. Plain JavaScript, no JSX, so scripts/check-film.mjs can read it.

   SCENES are what a viewer reads: a caption, and a line for the transcript.
   Each belongs to an ACT — a stretch drawn by one component that stays on
   screen across its scenes, so a record can move from one scene to the
   next instead of a cut. Times are milliseconds from the start of the ad;
   an act's component is given time from the start of the act.

   To retime the ad, change `at` here; to reword it, change `caption` and
   `sr`. A scene's `still` is the moment shown, finished, to visitors who
   ask for reduced motion.

   `truth` lists app labels the ad shows, each checked against the source
   by check-film.mjs, so a renamed screen fails the build rather than the
   ad quietly describing an app that no longer exists.
   ══════════════════════════════════════════════════════════════════════ */

export const AD_MS = 58000;

export const ACTS = [
  { key: 'open', at: 0 },
  { key: 'front', at: 7000 },
  { key: 'supply', at: 19000 },
  { key: 'make', at: 36500 },
  { key: 'chain', at: 41000 },
  { key: 'org', at: 45500 },
  { key: 'overview', at: 49500 },
  { key: 'finale', at: 52500 },
];

/* caption: lines shown in turn, each from `at` until the next (or `until`),
   ms into the scene; `accent` is a phrase set in orange. `place` puts them
   at the top of the frame (default), its centre, or below the mark. */
export const SCENES = [
  { key: 'chaos', act: 'open', at: 0, still: 2400, place: 'center',
    caption: [{ at: 300, text: 'Too many tools.' }, { at: 1400, text: 'Too much work between them.', until: 2850 }],
    sr: 'Spreadsheets, emails, vendor PDFs, stock counts and invoices, each in its own place.' },
  { key: 'brand', act: 'open', at: 4000, still: 1400, place: 'low',
    caption: [{ at: 500, text: 'One connected operation.', accent: 'connected', until: 2150 }],
    sr: 'Maks Ops pulls them into one connected operation.' },
  { key: 'catalogue', act: 'front', at: 7000, still: 3000,
    caption: [{ at: 200, text: 'Your catalogue becomes your front door.' }],
    sr: 'Precision Fab Works shares its catalogue at maksops.co.in/c/precision-fab. Acme Engineering finds the SS304 Mounting Bracket, asks for 120 with a brushed finish in 4 weeks, and sends the enquiry.' },
  { key: 'enquiry', act: 'front', at: 12000, still: 2400,
    caption: [{ at: 200, text: 'Customer requests. Maks Ops captures.' }],
    sr: 'The enquiry, ENQ-0042, arrives in Maks Ops by itself: who asked, what they want, and their note.' },
  { key: 'quotation', act: 'front', at: 15000, still: 3600,
    caption: [{ at: 200, text: 'Quote in seconds.' }],
    sr: 'It becomes quotation QT-0007, already filled in: 120 at ₹2,320, GST added, ₹3,28,500. It goes to the customer by email with the PDF attached, is accepted, and becomes order CO-0012.' },
  { key: 'inventory', act: 'supply', at: 19000, still: 8800, hero: true,
    caption: [{ at: 300, text: 'Can we actually fulfil this?' }, { at: 6400, text: 'Know what you can actually fulfil.', accent: 'actually fulfil.' }],
    sr: 'Smart Inventory works it out: each bracket takes 2.5 kg of SS304 sheet, so the order needs 300 kg, and other open orders 23 kg more — 323 kg. 143 kg is in stock. That builds 57 of the 120: blocked by SS304 sheet, 180 kg short.' },
  { key: 'vendors', act: 'supply', at: 28500, still: 4300,
    caption: [{ at: 200, text: 'Compare vendor quotes.' }, { at: 2100, text: 'Choose smarter.' }],
    sr: 'Three vendors quote for the 180 kg, in Excel, PDF and Word. Side by side, Deccan Metals is lowest like for like at ₹260 a kg. One click raises the purchase order, PFW/FY2026-27/018 for ₹46,800, and Finance signs it off.' },
  { key: 'grn', act: 'supply', at: 33000, still: 3300,
    caption: [{ at: 300, text: 'Goods in. Stock updated.' }],
    sr: 'Goods receipt GRN-00031 brings in the 180 kg. Stock goes from 143 to 323 kg, and the order turns ready: all 120 can be built with stock on hand.' },
  { key: 'production', act: 'make', at: 36500, still: 4300,
    caption: [{ at: 200, text: 'From material to finished work.' }],
    sr: 'Production order PROD-0005 issues 300 kg from stock and makes the 120 brackets, with 17.4 kg of sellable scrap: a 94.2% yield, and ₹642 of material in each bracket.' },
  { key: 'trace', act: 'chain', at: 41000, still: 4300,
    caption: [{ at: 1500, text: 'Every step stays connected.', accent: 'connected.' }, { at: 3000, text: 'Nothing gets lost.' }],
    sr: 'Invoice INV-0147 is paid. Every record links to the one before it: enquiry, quotation, order, purchase order, goods receipt, production, delivery challan and invoice.' },
  { key: 'roles', act: 'org', at: 45500, still: 3800,
    caption: [{ at: 200, text: 'One organisation. The right access for everyone.' }],
    sr: 'One organisation, five roles, each able to do only what the role allows: Sales sends quotations and raises invoices, Procurement raises purchase orders and receives goods, Production runs production, and only Finance and the Owner sign off a purchase order.' },
  { key: 'overview', act: 'overview', at: 49500, still: 2900,
    caption: [{ at: 200, text: 'See the whole operation.' }],
    sr: 'The owner sees the business in one place: sales invoiced, money owed, purchases, expenses and margin, and what is waiting on someone.' },
  { key: 'finale', act: 'finale', at: 52500, still: 5400,
    caption: [],
    sr: 'From catalogue to cash. Run your business, not your spreadsheets.' },
];

/* ── The sound (played by sound.js) ──
   Generated in the browser, not recorded: the same on every visit, and
   nothing to download. Two layers:

   SCORE — the music. 96 beats a minute; one chord a bar (2.5 s), cycling
   through `chords`; `groove` is how hard the beat drives:
     none     pads only                      (the mark, the finale)
     tension  notification blips, a rising drone, no beat   (the chaos)
     pulse    bass on the eighths, kick on 1 and 3, soft hats
     drive    kick every beat, snare on 2 and 4, hats on the sixteenths
     open     half-time and airy                (the chain, roles, overview)
   It is quiet for the mark, drives through Smart Inventory, goes dark at
   the shortage (E major, the chord that wants to go home), lifts when the
   goods arrive, and resolves to C major for "From catalogue to cash".

   CUES — the accents on the picture: clicks on buttons, a whoosh as a
   window moves, a chime when something lands, the warning at the
   shortage, the rise as stock refills, the brand chime at the end. */
export const TEMPO = 96;
export const SCORE = [
  { from: 0, to: 2900, chords: [], groove: 'tension' },
  { from: 3900, to: 7000, chords: ['Cmaj9'], groove: 'none' },
  { from: 7000, to: 19000, chords: ['Am7', 'Fmaj7', 'C', 'G'], groove: 'pulse' },
  { from: 19000, to: 25300, chords: ['Am7', 'Dm7', 'Am7'], groove: 'drive' },
  { from: 25300, to: 28500, chords: ['E', 'Fmaj7'], groove: 'pulse' },
  { from: 28500, to: 33000, chords: ['Fmaj7', 'G'], groove: 'drive' },
  { from: 33000, to: 36500, chords: ['G', 'Cmaj7'], groove: 'pulse' },
  { from: 36500, to: 41000, chords: ['C', 'G'], groove: 'drive' },
  { from: 41000, to: 52500, chords: ['Fmaj7', 'G', 'Am7', 'Fmaj7', 'C'], groove: 'open' },
  { from: 52500, to: 58000, chords: ['Cmaj9'], groove: 'none' },
];
export const CUES = [
  ...[150, 520, 860, 1240, 1450, 1600, 1980, 2150, 2350, 2600].map((at) => ({ at, name: 'blip' })),
  { at: 2900, name: 'hush' },
  { at: 3150, name: 'whoosh' },
  { at: 4050, name: 'brand' },
  { at: 6550, name: 'whoosh' },
  { at: 7600, name: 'click' },
  { at: 8400, name: 'click' },
  { at: 10450, name: 'click' },
  { at: 10650, name: 'whoosh' },
  { at: 12050, name: 'land' },
  { at: 12650, name: 'chime' },
  { at: 14350, name: 'click' },
  { at: 16900, name: 'click' },
  { at: 17700, name: 'chime' },
  { at: 18350, name: 'click' },
  { at: 18600, name: 'land' },
  { at: 25500, name: 'warn' },
  { at: 28000, name: 'whoosh' },
  { at: 28550, name: 'click' },
  { at: 31150, name: 'click' },
  { at: 32200, name: 'chime' },
  { at: 33000, name: 'whoosh' },
  { at: 33400, name: 'rise' },
  { at: 35300, name: 'chime' },
  { at: 36600, name: 'whoosh' },
  { at: 40000, name: 'chime' },
  { at: 41700, name: 'click' },
  { at: 41900, name: 'land' },
  { at: 42400, name: 'whoosh' },
  { at: 45600, name: 'whoosh' },
  { at: 49600, name: 'whoosh' },
  { at: 52600, name: 'resolve' },
  { at: 55600, name: 'brand' },
];

/* App labels the ad shows, checked against the source (check-film.mjs). */
export const TRUTH = [
  ['pages/PublicCatalogue.jsx', 'Add to enquiry'],
  ['pages/PublicCatalogue.jsx', 'Send enquiry'],
  ['pages/Enquiries.jsx', 'People who found your catalogue and asked for something.'],
  ['pages/Enquiries.jsx', 'Convert to quotation'],
  ['pages/SalesQuotations.jsx', 'From enquiry'],
  ['pages/SalesQuotationDoc.jsx', 'Convert to Order'],
  ['components/EmailDocumentModal.jsx', 'Please find attached our quotation'],
  ['components/OrderReadiness.jsx', 'blocked by'],
  ['components/OrderReadiness.jsx', 'can be built with stock on hand'],
  ['pages/MaterialRequirements.jsx', 'Raise purchase orders'],
  ['pages/VendorQuotations.jsx', 'Side by side'],
  ['pages/VendorQuotations.jsx', 'Lowest like for like'],
  ['pages/VendorQuotations.jsx', 'Raise PO'],
  ['pages/PurchaseOrders.jsx', 'Needs sign-off'],
  ['pages/GRN.jsx', 'Generate GRN'],
  ['pages/ProductionOrder.jsx', 'Raw Material Consumed'],
  ['pages/ProductionOrder.jsx', 'Yield & Material Balance'],
  ['pages/Reports.jsx', 'Total Sales Invoiced'],
  ['pages/Reports.jsx', 'Operational Margin'],
  ['lib/navigation.js', 'awaiting approval'],
  ['lib/navigation.js', 'not yet read'],
];

/** The act playing at time `ms`, and the time into it. */
export const actAt = (ms) => {
  let i = 0;
  for (let k = 0; k < ACTS.length; k++) if (ms >= ACTS[k].at) i = k;
  return { idx: i, act: ACTS[i], t: ms - ACTS[i].at };
};

/** The scene playing at time `ms`, and the time into it. */
export const sceneAt = (ms) => {
  let i = 0;
  for (let k = 0; k < SCENES.length; k++) if (ms >= SCENES[k].at) i = k;
  return { idx: i, scene: SCENES[i], t: ms - SCENES[i].at };
};

/** Where a scene ends: the next one's start, or the end of the ad. */
export const sceneEnd = (i) => (i + 1 < SCENES.length ? SCENES[i + 1].at : AD_MS);
