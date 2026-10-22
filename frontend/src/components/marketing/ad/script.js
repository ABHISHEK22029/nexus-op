/* ══════════════════════════════════════════════════════════════════════
   The homepage ad — its whole timeline in one place.

   Ninety-two seconds: the chaos it replaces, the mark, then one order
   carried through everything Maks Ops does (catalogue, enquiry, quotation,
   order, buying, stock, production, invoice, payment), the thread that
   connects it all, the platform around it, and the close. The numbers and
   record numbers are the walkthrough's one transaction (data/transaction.js).
   Plain JavaScript, no JSX, so scripts/check-film.mjs can read it.

   SCENES are what a viewer reads: a short headline, and a line for the
   transcript. Each belongs to an ACT — a stretch drawn by one component
   that stays on screen across its scenes, so a record can move from one
   scene to the next instead of a cut. Times are milliseconds from the
   start of the ad; an act's component is given time from the start of
   the act.

   To retime the ad, change `at` here (and the act's own moments, written
   in act time in its file); to reword it, change `caption` and `sr`. A
   scene's `still` is the moment shown, finished, to visitors who ask for
   reduced motion.

   `TRUTH` lists app labels the ad shows, each checked against the source
   by check-film.mjs, so a renamed screen fails the build rather than the
   ad quietly describing an app that no longer exists.
   ══════════════════════════════════════════════════════════════════════ */

export const AD_MS = 92000;

export const ACTS = [
  { key: 'open', at: 0 },
  { key: 'sell', at: 11500 },
  { key: 'quote', at: 22000 },
  { key: 'source', at: 34500 },
  { key: 'stock', at: 49500 },
  { key: 'make', at: 55000 },
  { key: 'thread', at: 67000 },
  { key: 'run', at: 73000 },
  { key: 'finale', at: 86000 },
];

/* caption: lines shown in turn, each from `at` until the next (or `until`),
   ms into the scene; `accent` is a phrase set in orange. `place`: 'top'
   (the default, a headline at the top left), 'center' or 'low' (centred). */
export const SCENES = [
  { key: 'chaos', act: 'open', at: 0, still: 5600, place: 'center',
    caption: [
      { at: 300, text: 'Orders on WhatsApp.', until: 1550 },
      { at: 1650, text: 'Stock in a notebook.', until: 2950 },
      { at: 3050, text: 'Quotes in PDFs.', until: 4350 },
      { at: 4520, text: 'Bills in Excel.', until: 5580 },
      { at: 5650, text: 'Nothing talks to each other.', accent: 'Nothing', until: 7200 },
    ],
    sr: 'Orders arrive on WhatsApp, stock lives in a notebook, quotes in PDFs and bills in Excel, and nothing talks to anything else.' },
  { key: 'brand', act: 'open', at: 7600, still: 2600, place: 'low',
    caption: [{ at: 1100, text: 'Every operation. One flow.', accent: 'One flow.', until: 3500 }],
    sr: 'Maks Ops: every operation in one flow.' },

  { key: 'catalogue', act: 'sell', at: 11500, still: 4800,
    caption: [{ at: 200, text: 'Your catalogue. Online in minutes.', accent: 'Online in minutes.' }],
    sr: 'Precision Fab Works puts the SS304 Mounting Bracket in its catalogue — ₹2,320 a piece, 50 minimum — publishes it at maksops.co.in/c/precision-fab and shares it on WhatsApp.' },
  { key: 'enquiry', act: 'sell', at: 17000, still: 4200,
    caption: [{ at: 200, text: 'Enquiries land by themselves.', accent: 'land by themselves.' }],
    sr: 'Acme Engineering adds 120 brackets to an enquiry and sends it. Enquiry ENQ-0042 lands in Maks Ops on its own, and the menu shows it is not yet read.' },

  { key: 'quote', act: 'quote', at: 22000, still: 4400,
    caption: [{ at: 200, text: 'One click. A full quotation.', accent: 'A full quotation.' }],
    sr: 'One click converts the enquiry to quotation QT-0007: 120 at ₹2,320, CGST and SGST at 9% each, ₹3,28,500 in all.' },
  { key: 'approve', act: 'quote', at: 27000, still: 3000,
    caption: [{ at: 200, text: 'Approved online.', accent: 'Approved' }],
    sr: 'Shared for approval, the customer opens it and presses Accept quotation.' },
  { key: 'order', act: 'quote', at: 30500, still: 3600,
    caption: [{ at: 200, text: 'Accepted. Now an order.', accent: 'Now an order.' }],
    sr: 'The accepted quotation becomes order CO-0012, and Maks Ops checks the stock behind it: 57 of the 120 can be built, blocked by SS304 sheet.' },

  { key: 'needs', act: 'source', at: 34500, still: 3500,
    caption: [{ at: 200, text: 'Know exactly what to buy.', accent: 'what to buy.' }],
    sr: 'Open orders need 323 kg of SS304 sheet; 143 kg is in stock; 180 kg is short. One button raises the purchase orders.' },
  { key: 'quotes', act: 'source', at: 38500, still: 4000,
    caption: [{ at: 200, text: 'Vendor quotes, compared for you.', accent: 'compared for you.' }],
    sr: 'Three vendors quote in Excel, PDF and Word. Maks Ops reads them and lines them up: Apex at ₹283 a kg, Deccan Metals at ₹260, Sunrise at ₹276. Deccan is lowest like for like.' },
  { key: 'po', act: 'source', at: 43000, still: 3000,
    caption: [{ at: 200, text: 'Best price. One click to order.', accent: 'One click' }],
    sr: 'Raise PO makes the purchase order for 180 kg from Deccan Metals, ₹46,800 — over the limit, so it needs sign-off.' },
  { key: 'signoff', act: 'source', at: 46500, still: 2600,
    caption: [{ at: 200, text: 'Signed off in a tap.', accent: 'Signed off' }],
    sr: 'Finance signs it off.' },

  { key: 'grn', act: 'stock', at: 49500, still: 5000,
    caption: [{ at: 200, text: 'Goods in. Stock up.', accent: 'Stock up.' }],
    sr: 'Goods receipt GRN-00031 brings in the 180 kg: stock goes from 143 to 323 kg, and all 120 brackets can be built with stock on hand.' },

  { key: 'production', act: 'make', at: 55000, still: 5000,
    caption: [{ at: 200, text: 'From sheet to finished parts.', accent: 'finished parts.' }],
    sr: 'Production order PROD-0005 turns 300 kg of sheet into the 120 brackets: a 94.2% yield, ₹642 of material in each.' },
  { key: 'deliver', act: 'make', at: 60500, still: 6000,
    caption: [{ at: 200, text: 'Dispatched. Invoiced. Paid.', accent: 'Paid.' }],
    sr: 'Delivery challan DC-0009 sends them out, tax invoice INV-0147 bills ₹3,28,500 with CGST and SGST, and the payment is recorded: paid.' },

  { key: 'thread', act: 'thread', at: 67000, still: 5400, place: 'low',
    caption: [{ at: 1900, text: 'Every step. Connected.', accent: 'Connected.' }],
    sr: 'Every record links to the one before it: enquiry, quotation, order, purchase order, goods receipt, production, delivery challan, invoice.' },

  { key: 'roles', act: 'run', at: 73000, still: 3200,
    caption: [{ at: 200, text: 'The right access for everyone.', accent: 'for everyone.' }],
    sr: 'Each person gets a role: the Owner does everything, Sales quotes and invoices, Procurement buys and receives, Finance signs off purchase orders and keeps the expenses.' },
  { key: 'ai', act: 'run', at: 76500, still: 3200,
    caption: [{ at: 200, text: 'Ask your business anything.', accent: 'anything.' }],
    sr: 'Ask AI answers questions about the business in plain words, like what is overdue this week.' },
  { key: 'numbers', act: 'run', at: 80000, still: 2700,
    caption: [{ at: 200, text: 'Your numbers, live.', accent: 'live.' }],
    sr: 'Reports show sales invoiced, receivables outstanding and the operational margin as they happen.' },
  { key: 'alerts', act: 'run', at: 83000, still: 2700,
    caption: [{ at: 200, text: 'Nothing slips through.', accent: 'slips through.' }],
    sr: 'The menu counts what is waiting: purchase orders awaiting approval, enquiries not yet read.' },

  { key: 'everything', act: 'finale', at: 86000, still: 2200, place: 'low',
    caption: [{ at: 300, text: 'One platform. Every operation.', accent: 'Every operation.', until: 2300 }],
    sr: 'Catalogue, enquiries, quotations, orders, inventory, vendor quotes, purchasing, goods receipt, production, delivery, invoicing, reports, roles and Ask AI: one platform.' },
  { key: 'finale', act: 'finale', at: 88500, still: 3300,
    caption: [],
    sr: 'Maks Ops. From catalogue to cash.' },
];

/* ── The voice-over ──
   What the narrator says, and when (ms from the start of the ad). One
   line per beat, written to be heard: short, warm, encouraging, and
   finished before the next beat begins (check-film.mjs measures every
   recorded clip against the next line). Each line is one recorded clip
   (scripts/voiceover/make-ad.mjs → public/voice/ad/, lengths in
   ./voice-clips.json); sound.js plays them on the music's own clock and
   lowers the music while they speak.

   The captions stay the short version of the same idea, for the many who
   watch muted. */
export const VOICE = [
  { at: 300, text: 'Orders on WhatsApp.' },
  { at: 1650, text: 'Stock in a notebook.' },
  { at: 3050, text: 'Quotes in PDFs.' },
  { at: 4520, text: 'Bills in Excel.' },
  { at: 5720, text: 'Sound familiar?' },
  { at: 8300, text: 'Meet Maks Ops. Your whole business, in one flow.' },
  { at: 12000, text: 'Put your products online in minutes, and share your catalogue on WhatsApp.' },
  { at: 17400, text: 'When a customer asks, the enquiry lands right where you work.' },
  { at: 22400, text: 'One click turns it into a complete quotation, GST and all.' },
  { at: 27300, text: 'Your customer approves it online.' },
  { at: 30800, text: 'It becomes an order, and your stock is checked right away.' },
  { at: 34900, text: 'Short on material? You will know exactly what to buy.' },
  { at: 38900, text: 'Drop in your vendors’ quotes, and see the best deal side by side.' },
  { at: 43300, text: 'One click raises the purchase order.' },
  { at: 46800, text: 'Approvals take a single tap.' },
  { at: 49900, text: 'Goods arrive, stock updates itself, and your order is ready to build.' },
  { at: 55400, text: 'Follow production from raw sheet to finished parts, yield and cost included.' },
  { at: 60900, text: 'Then dispatch, invoice, and get paid, all in the same place.' },
  { at: 67600, text: 'Every step connected, so nothing gets lost along the way.' },
  { at: 73300, text: 'Give everyone on your team the right access.' },
  { at: 76800, text: 'Ask your business anything, in plain words.' },
  { at: 80300, text: 'See your numbers, live.' },
  { at: 83300, text: 'And never let anything slip through.' },
  { at: 86300, text: 'One platform for every operation.' },
  { at: 89300, text: 'Maks Ops. From catalogue to cash.' },
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
     open     half-time and airy                (the thread, the platform)
   Quiet for the mark, a steady pulse through selling, darker at the
   shortage (E major, the chord that wants to go home), driving through the
   buying, lifting as the stock fills, wide and open over the thread, and
   resolving to C major for "From catalogue to cash".

   CUES — the accents on the picture, at the moments the acts draw them:
   clicks on buttons, a whoosh as a record travels, a land as it arrives,
   a chime when something completes, the warning at the shortage, the rise
   as stock pours in, the brand chime for the mark. */
export const TEMPO = 96;
export const SCORE = [
  { from: 0, to: 6600, chords: [], groove: 'tension' },
  { from: 7600, to: 11500, chords: ['Cmaj9'], groove: 'none' },
  { from: 11500, to: 22000, chords: ['Am7', 'Fmaj7', 'C', 'G'], groove: 'pulse' },
  { from: 22000, to: 30500, chords: ['Am7', 'Fmaj7', 'C', 'G'], groove: 'drive' },
  { from: 30500, to: 34500, chords: ['E', 'Fmaj7'], groove: 'pulse' },
  { from: 34500, to: 46500, chords: ['Am7', 'Dm7', 'Fmaj7', 'G'], groove: 'drive' },
  { from: 46500, to: 49500, chords: ['G'], groove: 'pulse' },
  { from: 49500, to: 67000, chords: ['C', 'G', 'Am7', 'Fmaj7'], groove: 'drive' },
  { from: 67000, to: 73000, chords: ['Fmaj7', 'G', 'Am7'], groove: 'open' },
  { from: 73000, to: 86000, chords: ['Fmaj7', 'C', 'G', 'Am7'], groove: 'pulse' },
  { from: 86000, to: 88500, chords: ['Fmaj7', 'G'], groove: 'drive' },
  { from: 88500, to: 92000, chords: ['Cmaj9'], groove: 'none' },
];
export const CUES = [
  ...[300, 1650, 3050, 4520].map((at) => ({ at, name: 'blip' })),
  ...[5250, 5480, 5700, 5920, 6140, 6360].map((at) => ({ at, name: 'blip' })),
  { at: 6600, name: 'hush' },
  { at: 6700, name: 'whoosh' },
  { at: 7600, name: 'brand' },
  // sell
  { at: 11800, name: 'land' },
  { at: 14100, name: 'whoosh' },
  { at: 15800, name: 'click' },
  { at: 16000, name: 'whoosh' },
  { at: 17500, name: 'click' },
  { at: 18400, name: 'click' },
  { at: 18700, name: 'whoosh' },
  { at: 19500, name: 'land' },
  { at: 19700, name: 'chime' },
  // quote
  { at: 22700, name: 'click' },
  { at: 23000, name: 'whoosh' },
  { at: 25800, name: 'chime' },
  { at: 27200, name: 'click' },
  { at: 27500, name: 'whoosh' },
  { at: 28400, name: 'click' },
  { at: 28700, name: 'land' },
  { at: 30600, name: 'whoosh' },
  { at: 32700, name: 'warn' },
  // source
  { at: 37700, name: 'click' },
  { at: 38800, name: 'land' },
  { at: 39100, name: 'land' },
  { at: 39400, name: 'land' },
  { at: 39800, name: 'whoosh' },
  { at: 41500, name: 'chime' },
  { at: 43200, name: 'click' },
  { at: 43500, name: 'land' },
  { at: 47100, name: 'click' },
  { at: 47400, name: 'land' },
  { at: 47600, name: 'chime' },
  // stock
  { at: 49600, name: 'whoosh' },
  { at: 50200, name: 'rise' },
  { at: 52500, name: 'chime' },
  // make
  { at: 55200, name: 'whoosh' },
  { at: 58200, name: 'chime' },
  { at: 60600, name: 'whoosh' },
  { at: 61500, name: 'land' },
  { at: 63300, name: 'click' },
  { at: 63700, name: 'land' },
  { at: 63800, name: 'chime' },
  // thread
  { at: 67100, name: 'whoosh' },
  { at: 67400, name: 'rise' },
  { at: 69900, name: 'chime' },
  // run
  { at: 73100, name: 'whoosh' },
  ...[73500, 74300, 75100, 75900].map((at) => ({ at, name: 'click' })),
  { at: 76600, name: 'whoosh' },
  { at: 78300, name: 'chime' },
  { at: 80100, name: 'whoosh' },
  { at: 82000, name: 'chime' },
  { at: 83100, name: 'whoosh' },
  { at: 83400, name: 'blip' },
  { at: 83800, name: 'blip' },
  { at: 84200, name: 'blip' },
  // finale
  { at: 86100, name: 'whoosh' },
  { at: 88500, name: 'resolve' },
  { at: 89200, name: 'brand' },
];

/* App labels the ad shows, checked against the source (check-film.mjs). */
export const TRUTH = [
  ['components/CatalogueSettings.jsx', 'Share on WhatsApp'],
  ['pages/PublicCatalogue.jsx', 'Add to enquiry'],
  ['pages/PublicCatalogue.jsx', 'Send enquiry'],
  ['pages/Enquiries.jsx', 'Convert to quotation'],
  ['pages/SalesQuotations.jsx', 'Share for approval'],
  ['pages/PublicQuote.jsx', 'Accept quotation'],
  ['components/OrderReadiness.jsx', 'blocked by'],
  ['components/OrderReadiness.jsx', 'can be built with stock on hand'],
  ['pages/MaterialRequirements.jsx', 'Raise purchase orders'],
  ['pages/VendorQuotations.jsx', 'Lowest like for like'],
  ['pages/VendorQuotations.jsx', 'Raise PO'],
  ['pages/PurchaseOrders.jsx', 'Needs sign-off'],
  ['pages/PurchaseOrders.jsx', 'Sign off'],
  ['pages/PurchaseOrders.jsx', 'Receive GRN'],
  ['pages/ProductionOrder.jsx', 'Yield & Material Balance'],
  ['pages/SalesInvoiceDoc.jsx', 'Record payment'],
  ['components/AskAi.jsx', 'Ask AI'],
  ['pages/Reports.jsx', 'Total Sales Invoiced'],
  ['pages/Reports.jsx', 'Receivables Outstanding'],
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
