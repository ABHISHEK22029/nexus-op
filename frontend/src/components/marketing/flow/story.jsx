import React from 'react';
import {
  MessageSquareQuote, FileText, ClipboardCheck, ShoppingCart, Truck, Factory,
  ReceiptText, Lock, Check, AlertTriangle, Mail, Reply, Search, ArrowRight,
} from 'lucide-react';
import {
  Show, Typed, Count, Bar, Pill, Field, Tick, FileChip, Doc, DocMeta, DocKV,
  inr, num, prog, Letterhead, SELLER,
} from './kit';
import { NARRATION } from './narration';

/* ══════════════════════════════════════════════════════════════════════
   The story: one transaction, seven scenes, about sixty seconds.

   A customer finds a product in your public catalogue and asks for 120 of
   it. That single enquiry becomes a quotation, an order, a purchase, a
   goods receipt, a production run and a tax invoice — and the SAME record
   is carried the whole way. The customer, the product, the quantity and
   the money stay on screen from the first scene to the last; only the
   document wrapped around them changes.

   ── Everything shown is something the product actually does ───────────
   This was checked against the code before it was drawn, because a
   fabricator who signs up and cannot find a feature they were shown is a
   worse outcome than never showing it:

     · The catalogue lives at maksops.co.in/c/<slug> — the real route. There
       are no per-company subdomains.
     · Quotations and invoices are EMAILED through a prefilled draft, which
       is what EmailDocumentModal does. Not "sent automatically".
     · Vendor quotes ARRIVE and are read out of their files. The product
       does not send RFQs, so the story does not claim it does.
     · Production records material issued, output, scrap and yield. There
       are no cutting / finishing / QC routing stages, so there are none
       here.
     · "Can we fulfil it?" is the deficiency engine: required across every
       open order, against stock on hand and on order, naming the material
       that blocks.

   ── The numbers add up ────────────────────────────────────────────────
     120 × ₹2,320 = ₹2,78,400 · CGST 9% ₹25,056 · SGST 9% ₹25,056
     round-off −₹12 → ₹3,28,500
     SS304 sheet 2 mm at 2.5 kg a piece = 300 kg for this order; 23 kg is
     already promised to other open orders → 323 kg required; 143 on hand;
     short 180. Received 180 → 323 available, exactly covered.
     Vendor prices are realistic for SS304 sheet (₹260–₹283/kg). A sketch
     that priced 180 kg at ₹1.68 lakh — about ₹930/kg — would have been the
     first thing a fabricator noticed.
   ══════════════════════════════════════════════════════════════════════ */

const NOW = new Date();
const Y = NOW.getFullYear();
/* Dates move with the calendar, so the demo never looks months stale. */
export const day = (offset = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const IDS = {
  enq: `ENQ-${Y}-01842`, qt: `QT-${Y}-00981`, so: `SO-${Y}-00672`, po: `PO-${Y}-00418`,
  grn: `GRN-${Y}-00311`, prod: `PROD-${Y}-00287`, inv: `INV-${Y}-00193`,
};

export const CUSTOMER = 'Acme Engineering Pvt. Ltd.';
const CUSTOMER_SHORT = 'Acme Engineering';
const EMAIL = 'purchase@acme.example';
export const CATALOGUE_URL = 'maksops.co.in/c/precision-fab';
const PRODUCT = 'SS304 Mounting Bracket';
const PRODUCT_SLUG = 'ss304-mounting-bracket';
const MATERIAL = 'SS304 sheet, 2 mm';
const QTY = 120;
const RATE = 2320;
const SUB = 278400;
const HALF_GST = 25056;
const TOTAL = 328500;

/* ── shared pieces ─────────────────────────────────────────────────── */

const LineTable = ({ t, start = 150, rate = true, from = 'left' }) => (
  <div className="fl-table">
    <div className="fl-tr is-head">
      <span>Item</span><span>HSN</span><span className="r">Qty</span>
      {rate && <><span className="r">Rate</span><span className="r">Amount</span></>}
    </div>
    <Show on={t >= start} from={from} className="fl-tr">
      <span className="fl-strong">{PRODUCT}</span>
      <span className="fl-muted">7326</span>
      <span className="r">{QTY} Nos</span>
      {rate && (
        <>
          <span className="r"><Count to={RATE} t={t} start={start + 350} dur={600} fmt={(n) => inr(Math.round(n))} /></span>
          <span className="r fl-strong">{t >= start + 950 ? <Count to={SUB} t={t} start={start + 950} dur={500} fmt={(n) => inr(Math.round(n))} /> : '—'}</span>
        </>
      )}
    </Show>
  </div>
);

const Totals = ({ t, start }) => (
  <div className="fl-totals">
    <Show on={t >= start} className="fl-tot"><span>Subtotal</span><b>{inr(SUB)}</b></Show>
    <Show on={t >= start + 250} className="fl-tot">
      <span>CGST 9% <em className="fl-pos">Telangana → Telangana</em></span><b>{inr(HALF_GST)}</b>
    </Show>
    <Show on={t >= start + 450} className="fl-tot"><span>SGST 9%</span><b>{inr(HALF_GST)}</b></Show>
    <Show on={t >= start + 650} className="fl-tot"><span>Round off</span><b>−₹12</b></Show>
    <Show on={t >= start + 800} className="fl-tot is-total">
      <span>Total</span>
      <b><Count to={TOTAL} t={t} start={start + 800} dur={650} fmt={(n) => inr(Math.round(n))} /></b>
    </Show>
  </div>
);

const DocLine = ({ on, name, qty, amount }) => (
  <Show on={on} from="left" className="fl-doc-line">
    <span>{name}</span><span>{qty}</span>{amount !== undefined && <b>{amount}</b>}
  </Show>
);

/* ══════════════════════════════════════════════════════════════════════
   1 · ENQUIRY — the customer's side first, then yours.
   ══════════════════════════════════════════════════════════════════════ */
const CUSTOMER_UNTIL = 5200;   // the window switches from their screen to yours

/* Catalogue thumbnails. Each product is drawn from its real section,
   extruded — a bracket is an L, a tray support a C-channel, a clamp a hat —
   so one helper turns six short point lists into six shaded solids, instead
   of six hand-drawn pictures or six coloured boxes with an icon in them.

   Oblique projection: the back of the part sits up and to the right by
   `d`. A side face is visible when its outward normal points along d, and
   faces nearer the -d end of the section are further away, so they are
   painted first. */
const METALS = {
  ss: ['#eef1f5', '#c9d0da', '#f6f8fa', '#b9c2ce'], // front light, front dark, top, side
  gi: ['#e2e7ed', '#b4bfcc', '#edf1f5', '#a3afbe'],
  ms: ['#cfd4db', '#9da6b2', '#dde1e6', '#8c96a3'],
};

const StudioDefs = () => (
  <svg className="fl-defs" width="0" height="0" aria-hidden="true">
    <defs>
      {Object.entries(METALS).map(([k, [a, b]]) => (
        <linearGradient key={k} id={`fl-pa-${k}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      ))}
    </defs>
  </svg>
);

const extrude = (pts, [dx, dy]) => {
  const area = pts.reduce((a, [x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return a + x1 * y2 - x2 * y1;
  }, 0);
  const p = area < 0 ? [...pts].reverse() : pts;
  const faces = [];
  p.forEach(([x1, y1], i) => {
    const [x2, y2] = p[(i + 1) % p.length];
    const nx = y2 - y1, ny = x1 - x2;
    if (nx * dx + ny * dy <= 0) return;
    faces.push({
      pts: [[x1, y1], [x2, y2], [x2 + dx, y2 + dy], [x1 + dx, y1 + dy]],
      top: -ny >= Math.abs(nx),
      at: (x1 + x2) * dx + (y1 + y2) * dy,
    });
  });
  return faces.sort((a, b) => a.at - b.at);
};

const poly = (pts) => pts.map((q) => q.join(',')).join(' ');

const Solid = ({ profile, d, metal = 'ss', children }) => {
  const [, , top, side] = METALS[metal];
  const xs = profile.flatMap(([x]) => [x, x + d[0]]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const floor = Math.max(...profile.map(([, y]) => y));
  return (
    <svg viewBox="0 0 120 72" aria-hidden="true">
      <ellipse cx={(lo + hi) / 2} cy={floor + 3} rx={(hi - lo) / 2} ry="3" fill="#000" opacity="0.07" />
      <g stroke="#8d98a7" strokeWidth="0.6" strokeLinejoin="round">
        {extrude(profile, d).map((f, i) => (
          <polygon key={i} points={poly(f.pts)} fill={f.top ? top : side} />
        ))}
        <polygon points={poly(profile)} fill={`url(#fl-pa-${metal})`} />
      </g>
      <g fill="#7f8a9a">{children}</g>
    </svg>
  );
};

/* a slot on a face that runs along d, tilted to lie on it */
const Slot = ({ x, y, d, r = 2.6 }) => (
  <ellipse cx={x} cy={y} rx={r} ry={r * 0.45}
    transform={`rotate(${(Math.atan2(d[1], d[0]) * 180) / Math.PI} ${x} ${y})`} />
);

const ARM = [84, -22];
const PRODUCTS = [
  [PRODUCT, '2 mm SS304 · brushed', (
    <Solid profile={[[22, 14], [32, 14], [32, 56], [88, 56], [88, 64], [22, 64]]} d={[14, -10]}>
      <ellipse cx="55" cy="51" rx="4" ry="1.8" />
      <ellipse cx="77" cy="51" rx="4" ry="1.8" />
      <circle cx="27" cy="28" r="2.2" />
      <circle cx="27" cy="42" r="2.2" />
    </Solid>
  )],
  ['Cable Tray Support', 'MS · hot-dip galvanised', (
    <Solid metal="gi" profile={[[14, 34], [28, 34], [28, 38], [19, 38], [19, 56], [28, 56], [28, 60], [14, 60]]} d={[80, -24]}>
      <Slot x={45} y={26} d={[80, -24]} />
      <Slot x={69} y={19} d={[80, -24]} />
      <Slot x={93} y={11.5} d={[80, -24]} />
    </Solid>
  )],
  ['Solar Module Clamp', 'AL 6063 · mid clamp', (
    <Solid profile={[[18, 30], [40, 30], [44, 48], [70, 48], [74, 30], [96, 30], [96, 35], [78, 35], [73, 54], [41, 54], [36, 35], [18, 35]]} d={[16, -12]}>
      <ellipse cx="65" cy="42" rx="3.4" ry="1.6" />
    </Solid>
  )],
  ['Base Plate', '8 mm MS · laser cut', (
    <Solid metal="ms" profile={[[12, 54], [78, 54], [78, 60], [12, 60]]} d={[28, -26]}>
      <ellipse cx="26" cy="50" rx="3" ry="1.5" />
      <ellipse cx="72" cy="50" rx="3" ry="1.5" />
      <ellipse cx="45" cy="32" rx="3" ry="1.5" />
      <ellipse cx="91" cy="32" rx="3" ry="1.5" />
      <ellipse cx="59" cy="41" rx="7" ry="3.2" />
    </Solid>
  )],
  ['Sheet Metal Enclosure', '1.6 mm CRCA · IP55', (
    <Solid profile={[[36, 18], [78, 18], [78, 62], [36, 62]]} d={[18, -12]}>
      <rect x="39.5" y="21.5" width="35" height="37" rx="1.2" fill="none" stroke="#9aa4b2" strokeWidth="0.8" />
      <rect x="69" y="35" width="2.4" height="9" rx="1" />
      <path d="M44 49h14M44 52h14M44 55h14" stroke="#9aa4b2" strokeWidth="0.9" />
    </Solid>
  )],
  ['Cross Arm', '75 × 40 × 6 · galvanised', (
    <Solid metal="gi" profile={[[12, 34], [18, 34], [18, 48], [32, 48], [32, 54], [12, 54]]} d={ARM}>
      <Slot x={41.8} y={43.6} d={ARM} r={2.2} />
      <Slot x={67} y={37} d={ARM} r={2.2} />
      <Slot x={92.2} y={30.4} d={ARM} r={2.2} />
    </Solid>
  )],
];

/* The product photograph. A catalogue page with a coloured box where the
   product should be looks unfinished; this is the bracket itself — an
   extruded L profile in brushed steel with its fixing holes, drawn as
   flat faces so it stays crisp at any size and costs nothing to render. */
const BracketArt = () => (
  <svg viewBox="0 0 250 170" role="img" aria-label="SS304 mounting bracket">
    <defs>
      <linearGradient id="fl-steel-front" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#eef1f5" />
        <stop offset="0.55" stopColor="#d3d9e1" />
        <stop offset="1" stopColor="#bcc5d0" />
      </linearGradient>
      <linearGradient id="fl-steel-top" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f7f9fb" />
        <stop offset="1" stopColor="#e3e8ee" />
      </linearGradient>
      <linearGradient id="fl-steel-side" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c3cbd6" />
        <stop offset="1" stopColor="#a9b3c0" />
      </linearGradient>
    </defs>
    <ellipse cx="128" cy="152" rx="96" ry="9" fill="#000" opacity="0.07" />
    <g stroke="#97a2b1" strokeWidth="1" strokeLinejoin="round">
      {/* faces of the extrusion, back to front */}
      <polygon points="44,36 68,36 92,20 68,20" fill="url(#fl-steel-top)" />
      <polygon points="68,36 92,20 92,104 68,120" fill="url(#fl-steel-side)" />
      <polygon points="68,120 196,120 220,104 92,104" fill="url(#fl-steel-top)" />
      <polygon points="196,120 220,104 220,126 196,142" fill="url(#fl-steel-side)" />
      <polygon points="44,36 68,36 68,120 196,120 196,142 44,142" fill="url(#fl-steel-front)" />
    </g>
    {/* fixing holes */}
    <g fill="#8792a2">
      <ellipse cx="122" cy="112" rx="8" ry="3.6" />
      <ellipse cx="170" cy="112" rx="8" ry="3.6" />
      <circle cx="56" cy="66" r="4.6" />
      <circle cx="56" cy="96" r="4.6" />
    </g>
    {/* a brushed sheen along the front face */}
    <polygon points="44,36 52,36 52,142 44,142" fill="#fff" opacity="0.35" />
  </svg>
);

const CustomerCatalogue = ({ t }) => {
  const opened = t >= 1300;
  return (
    <div className="fl-cust">
      <StudioDefs />
      <div className="fl-cust-head">
        <Letterhead />
        <span className="fl-cust-nav">Catalogue</span>
        <span className="fl-cust-search"><Search size={12} /> Search products</span>
      </div>

      {!opened ? (
        <div className="fl-cust-grid">
          {PRODUCTS.map(([name, spec, art], i) => (
            <div key={name} className={`fl-cust-card${i === 0 && t >= 1000 ? ' is-pressed' : ''}`}>
              <span className="fl-cust-img">{art}</span>
              <b>{name}</b>
              <small>{spec}</small>
              {i === 0 && <span className="fl-cursor-host"><CursorAt on={t >= 250 && t < 1500} click={t >= 950 && t < 1250} /></span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="fl-cust-detail fl-enter">
          <div className="fl-cust-hero" style={{ background: 'linear-gradient(160deg, var(--bg-elevated), var(--bg-surface) 70%)' }}>
            <BracketArt />
          </div>
          <div className="fl-cust-form">
            <b className="fl-cust-title">{PRODUCT}</b>
            <small className="fl-muted">2 mm SS304 · brushed finish · HSN 7326</small>
            <div className="fl-cust-q">Request a quote</div>
            <Field label="Company"><Typed text={CUSTOMER} t={t} start={1550} cps={42} ph="Your company" /></Field>
            <div className="fl-row2">
              <Field label="Quantity" mono><Typed text={String(QTY)} t={t} start={2300} cps={14} ph="0" /></Field>
              <Field label="Email"><Typed text={EMAIL} t={t} start={2450} cps={48} /></Field>
            </div>
            <Field label="Message"><Typed text="Brushed finish, delivery in 4 weeks." t={t} start={2850} cps={48} /></Field>
            <span className="fl-cursor-host is-inline">
              <button type="button" tabIndex={-1} className={`fl-btn primary${t >= 4050 && t < 4250 ? ' is-pressed' : ''}`}>
                Send enquiry <ArrowRight size={13} />
              </button>
              <CursorAt on={t >= 3600 && t < 4700} click={t >= 4050 && t < 4300} />
            </span>
          </div>
        </div>
      )}

      <Show on={t >= 4300} from="up" className="fl-toast">
        <Check size={13} strokeWidth={3} /> Enquiry sent to {SELLER}
      </Show>
    </div>
  );
};

/* A local cursor, for scenes where the pointer acts on something other than
   the primary action. */
const CursorAt = ({ on, click }) => (
  <span className={`fl-cursor${on ? ' is-on' : ''}${click ? ' is-click' : ''}`} aria-hidden="true">
    <span className="fl-cursor-ring" />
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M5 3l13 8.2-6 1.4L9 19z" fill="#14161c" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </span>
);

const EnquiryInApp = ({ t }) => {
  /* Inbox first — "Maks Ops receives a new enquiry" — then it opens. */
  const open = t >= 6500;
  if (!open) {
    return (
      <div className="fl-inbox">
        <div className="fl-tr is-head"><span>Enquiry</span><span>From</span><span>Product</span><span className="r">Qty</span><span /></div>
        <Show on={t >= CUSTOMER_UNTIL + 250} from="down" className="fl-tr is-new">
          <span className="fl-mono">{IDS.enq}</span>
          <span className="fl-strong">{CUSTOMER_SHORT}</span>
          <span>{PRODUCT}</span>
          <span className="r">{QTY}</span>
          <span className="r"><Pill tone="info" dot>New</Pill></span>
        </Show>
        <div className="fl-tr is-old"><span className="fl-mono">ENQ-{Y}-01841</span><span>Orbit Infra</span><span>Base Plate</span><span className="r">40</span><span className="r"><Pill>Quoted</Pill></span></div>
        <div className="fl-tr is-old"><span className="fl-mono">ENQ-{Y}-01839</span><span>Sunline Solar</span><span>Module Clamp</span><span className="r">600</span><span className="r"><Pill>Quoted</Pill></span></div>
        <Show on={t >= CUSTOMER_UNTIL + 600} className="fl-arrived">
          Arrived from your catalogue — nobody typed it in.
        </Show>
      </div>
    );
  }
  return (
    <div className="fl-stack fl-enter">
      <div className="fl-row2">
        <Field label="Customer">{CUSTOMER}</Field>
        <Field label="Received">{day(0)}</Field>
      </div>
      <Field label="Requirement" tall>
        {PRODUCT} × {QTY} Nos — brushed finish, delivery in 4 weeks.
      </Field>
      <div className="fl-chips">
        <Pill tone="amber">From catalogue · /c/precision-fab/{PRODUCT_SLUG}</Pill>
        <Pill tone="neutral">{EMAIL}</Pill>
      </div>
    </div>
  );
};

const EnquiryBody = ({ t }) => <EnquiryInApp t={t} />;

const EnquiryDoc = ({ t }) => (
  t < 6500 ? <div className="fl-doc-empty">Select an enquiry to see its record</div> : (
    <Doc title="ENQUIRY" id={IDS.enq}>
      <DocMeta
        left={<><small>From</small><b>{CUSTOMER}</b><span>Hyderabad, Telangana</span></>}
        right={<><small>Received</small><b>{day(0)}</b><span>via catalogue</span></>}
      />
      <div className="fl-doc-lines">
        <DocLine on name={PRODUCT} qty={`${QTY} Nos`} />
      </div>
      <p className="fl-doc-note">Brushed finish, delivery in 4 weeks.</p>
    </Doc>
  )
);

/* ══════════════════════════════════════════════════════════════════════
   2 · QUOTATION
   ══════════════════════════════════════════════════════════════════════ */
const QuotationBody = ({ t }) => (
  <div className="fl-split">
    <div className="fl-stack">
      <LineTable t={t} start={150} />
      <Totals t={t} start={1500} />
    </div>
    <div className="fl-thread">
      <div className="fl-thread-h"><Mail size={12} /> Customer</div>
      <Show on={t >= 3550} className="fl-mail">
        <span className="fl-mail-row"><small>To</small>{EMAIL}</span>
        <span className="fl-mail-row"><small>Subject</small>Quotation {IDS.qt} — {PRODUCT}</span>
        <span className="fl-mail-foot">
          {t >= 4200 ? <><Check size={11} strokeWidth={3} /> Emailed · {inr(TOTAL)}</> : 'Draft prefilled from the quotation'}
        </span>
      </Show>
      <Show on={t >= 4900} from="left" className="fl-reply">
        <Reply size={12} />
        <span><b>Re: Quotation {IDS.qt}</b>Approved — please proceed.<small>Purchase, {CUSTOMER_SHORT}</small></span>
      </Show>
    </div>
  </div>
);

const QuotationDoc = ({ t }) => (
  <Doc title="QUOTATION" id={IDS.qt}>
    <DocMeta
      left={<><small>To</small><b>{CUSTOMER}</b><span>Hyderabad, Telangana</span></>}
      right={<><small>Valid until</small><b>{day(30)}</b><span>Ref {IDS.enq}</span></>}
    />
    <div className="fl-doc-lines">
      <DocLine on={t >= 150} name={PRODUCT} qty={`${QTY} × ${inr(RATE)}`} amount={t >= 1100 ? inr(SUB) : '—'} />
    </div>
    <div className="fl-doc-tot">
      <DocKV k="CGST + SGST 18%" v={t >= 1950 ? inr(HALF_GST * 2) : '—'} />
      <DocKV k="Total" v={t >= 2300 ? inr(TOTAL) : '—'} strong />
    </div>
  </Doc>
);

/* ══════════════════════════════════════════════════════════════════════
   3 · ORDER — and the question that matters: can we fulfil it?
   ══════════════════════════════════════════════════════════════════════ */
const OrderBody = ({ t }) => {
  const short = t >= 2600;
  return (
    <div className="fl-stack">
      <Show on={t >= 150} className="fl-banner">
        <Lock size={12} /> Converted from {IDS.qt} — lines locked, value {inr(TOTAL)}, due {day(28)}
      </Show>
      <Show on={t >= 700} className="fl-promise">
        <div className="fl-promise-h">
          <b>Can we fulfil it?</b>
          <span className="fl-muted">{MATERIAL} · 2.5 kg a piece</span>
        </div>
        <div className="fl-ledger">
          <Show on={t >= 1000} className="fl-led">
            <span>Required by open orders<small>this order 300 · already promised 23</small></span>
            <b><Count to={323} t={t} start={1000} dur={600} /> kg</b>
          </Show>
          <Show on={t >= 1550} className="fl-led"><span>On hand</span><b>143 kg</b></Show>
          <Show on={t >= 1850} className="fl-led"><span>On order</span><b>0 kg</b></Show>
          <Show on={short} className="fl-led is-short"><span>Short</span><b>180 kg</b></Show>
        </div>
        <div className="fl-cover">
          <span className="fl-cover-have" style={{ transform: `scaleX(${t >= 1550 ? 143 / 323 : 0})` }} />
          <span className={`fl-cover-gap${short ? ' is-on' : ''}`} />
        </div>
        <div className="fl-chips">
          <Show as="span" on={t >= 3100} className="fl-inline">
            <Pill tone="danger"><AlertTriangle size={11} /> Blocked by {MATERIAL}</Pill>
          </Show>
          <Show as="span" on={t >= 3700} className="fl-inline">
            <Pill tone="amber">Buy 180 kg to cover it</Pill>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const OrderDoc = ({ t }) => (
  <Doc title="SALES ORDER" id={IDS.so}>
    <DocMeta
      left={<><small>Customer</small><b>{CUSTOMER}</b><span>PO ref: ACME/PO/7713</span></>}
      right={<><small>Delivery due</small><b>{day(28)}</b><span>Ref {IDS.qt}</span></>}
    />
    <div className="fl-doc-lines">
      <DocLine on name={PRODUCT} qty={`${QTY} Nos`} amount={inr(SUB)} />
    </div>
    <div className="fl-doc-tot"><DocKV k="Order value" v={inr(TOTAL)} strong /></div>
    <Show on={t >= 3100} className="fl-doc-flag"><AlertTriangle size={11} /> Material short — 180 kg</Show>
  </Doc>
);

/* ══════════════════════════════════════════════════════════════════════
   4 · PURCHASE — quotes arrive as files, and are read, not retyped.
   ══════════════════════════════════════════════════════════════════════ */
const VENDORS = [
  ['Apex Steel Traders', 283, 50940, 'xls', 'apex-quote.xlsx'],
  ['Deccan Metals', 260, 46800, 'pdf', 'deccan-metals.pdf'],
  ['Sunrise Alloys', 276, 49680, 'doc', 'sunrise-quotation.docx'],
];
const PO_PICK = 5000;

const PurchaseBody = ({ t }) => (
  <div className="fl-stack">
    <div className="fl-files">
      {VENDORS.map(([, , , kind, file], i) => (
        <FileChip key={file} on={t >= 150 + i * 250} read={t >= 800 + i * 250} name={file}
          size="uploading…" kind={kind} note="1 line read" />
      ))}
    </div>
    <div className="fl-compare">
      <div className="fl-cmp-h"><span>180 kg · {MATERIAL}</span><span className="r">₹ / kg</span><span className="r">Total</span></div>
      {VENDORS.map(([name, rate, total], i) => {
        const best = i === 1;
        return (
          <Show key={name} on={t >= 1600 + i * 150}
            className={`fl-cmp${best && t >= 2600 ? ' is-best' : ''}${best && t >= PO_PICK ? ' is-picked' : ''}`}>
            <span className="fl-cmp-name">{name}{best && t >= 2600 && <Pill tone="ok">Lowest</Pill>}</span>
            <span className="r fl-mono">{inr(rate)}</span>
            <span className="r fl-strong"><Count to={total} t={t} start={1600 + i * 150} dur={600} fmt={(n) => inr(Math.round(n))} /></span>
            <span className="fl-cmp-bar"><Bar on={t >= 1600 + i * 150} value={total / 52000} tone={best ? 'ok' : 'neutral'} dur={800} /></span>
          </Show>
        );
      })}
    </div>
    <Show on={t >= PO_PICK + 350} className="fl-done">
      <Check size={12} strokeWidth={3} /> {IDS.po} raised on Deccan Metals — 180 kg × ₹260 = {inr(46800)} + GST
    </Show>
  </div>
);

const PurchaseDoc = ({ t }) => {
  const filled = t >= PO_PICK + 350;
  return (
    <Doc title="PURCHASE ORDER" id={filled ? IDS.po : 'Draft'}>
      <DocMeta
        left={<><small>Vendor</small><b>{filled ? 'Deccan Metals' : '—'}</b><span>{filled ? 'Hyderabad, Telangana' : 'awaiting comparison'}</span></>}
        right={<><small>For</small><b>{IDS.so}</b><span>{CUSTOMER_SHORT}</span></>}
      />
      <div className="fl-doc-lines">
        <DocLine on name={MATERIAL} qty="180 kg" amount={filled ? inr(46800) : '—'} />
      </div>
      <div className="fl-doc-tot"><DocKV k="Total incl. GST" v={filled ? inr(55224) : '—'} strong /></div>
    </Doc>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   5 · GOODS RECEIPT — stock moves on the receipt itself.
   ══════════════════════════════════════════════════════════════════════ */
const GrnBody = ({ t }) => (
  <div className="fl-split">
    <div className="fl-stack">
      <Field label="Against">{IDS.po} · Deccan Metals</Field>
      <div className="fl-row2">
        <Field label="Vehicle" mono><Typed text="TS 09 UB 4471" t={t} start={250} cps={20} /></Field>
        <Field label="Batch" mono><Typed text="HT-2219" t={t} start={950} cps={16} /></Field>
      </div>
      <Field label="Received" mono>
        {t >= 1500 ? <><Count to={180} t={t} start={1500} dur={700} /> of 180 kg</> : <span className="fl-ph">0 kg</span>}
        {t >= 2250 && <span className="fl-okmark"><Check size={11} strokeWidth={3} /> matches PO</span>}
      </Field>
    </div>
    <Show on={t >= 2500} className="fl-inv">
      <div className="fl-inv-h">Inventory · {MATERIAL}</div>
      <Show on={t >= 2650} className="fl-led"><span>Before</span><b>143 kg</b></Show>
      <Show on={t >= 2950} className="fl-led is-plus"><span>Received</span><b>+180 kg</b></Show>
      <span className="fl-rule" />
      <Show on={t >= 3250} className="fl-led is-total">
        <span>Available</span><b><Count to={323} from={143} t={t} start={3250} dur={700} /> kg</b>
      </Show>
      <Bar on={t >= 2650} value={t >= 3250 ? 1 : 143 / 323} tone="ok" dur={700} />
      <Show on={t >= 4000} className="fl-verdict">
        <Check size={12} strokeWidth={3} /> Order covered — 120 of 120 can be built
      </Show>
    </Show>
  </div>
);

const GrnDoc = () => (
  <Doc title="GOODS RECEIPT NOTE" id={IDS.grn}>
    <DocMeta
      left={<><small>Vendor</small><b>Deccan Metals</b><span>Ref {IDS.po}</span></>}
      right={<><small>For</small><b>{IDS.so}</b><span>{CUSTOMER_SHORT}</span></>}
    />
    <div className="fl-doc-lines"><DocLine on name={MATERIAL} qty="180 kg" amount="Batch HT-2219" /></div>
    <div className="fl-doc-tot"><DocKV k="Stock after receipt" v="323 kg" strong /></div>
  </Doc>
);

/* ══════════════════════════════════════════════════════════════════════
   6 · PRODUCTION — material in, output and scrap out, cost known.
   ══════════════════════════════════════════════════════════════════════ */
const OUT_START = 900;
const OUT_DUR = 3200;

const ProductionBody = ({ t }) => {
  /* Linear here, not eased: output accrues at a steady rate on a floor, and
     the 68% moment should arrive about two-thirds of the way through. */
  const frac = Math.max(0, Math.min(1, (t - OUT_START) / OUT_DUR));
  const pcs = Math.round(QTY * frac);
  const outDone = frac >= 1;
  return (
    <div className="fl-split">
      <div className="fl-checks">
        <Tick done={t >= 500} active={t < 500} right="300 kg">Material issued — {MATERIAL}</Tick>
        <Tick done={outDone} active={t >= 500 && !outDone} right={`${pcs} / ${QTY}`}>
          Output recorded
          <span className="fl-tick-bar">
            <span className="fl-tick-fill" style={{ transform: `scaleX(${t >= OUT_START ? 1 : 0})`, transitionDuration: `${OUT_DUR}ms` }} />
          </span>
          <small className="fl-muted">{Math.round(frac * 100)}%</small>
        </Tick>
        <Tick done={t >= 4500} active={outDone && t < 4500} right="17.4 kg">
          Scrap logged <small className="fl-muted">9 kg remnant reusable · 8.4 kg scrap</small>
        </Tick>
        <Tick done={t >= 5100} active={t >= 4500 && t < 5100} right={t >= 5100 ? '₹642 / pc' : '—'}>
          Costed
        </Tick>
      </div>
      <Show on={t >= 4700} className="fl-yield">
        <svg viewBox="0 0 80 80" width="96" height="96" aria-hidden="true">
          <circle cx="40" cy="40" r="31" fill="none" stroke="var(--bg-overlay)" strokeWidth="9" />
          <circle cx="40" cy="40" r="31" fill="none" stroke="var(--accent-red)" strokeWidth="9" opacity=".75" />
          <circle cx="40" cy="40" r="31" fill="none" stroke="var(--accent-emerald)" strokeWidth="9"
            strokeLinecap="round" pathLength="1" strokeDasharray="0.942 1" transform="rotate(-90 40 40)"
            className="fl-ring" style={{ strokeDashoffset: t >= 4800 ? 0 : 0.942 }} />
        </svg>
        <span><b>94.2%</b><small>yield · scrap counted</small></span>
      </Show>
    </div>
  );
};

const ProductionDoc = ({ t }) => (
  <Doc title="PRODUCTION ORDER" id={IDS.prod}>
    <DocMeta
      left={<><small>For</small><b>{IDS.so}</b><span>{CUSTOMER_SHORT}</span></>}
      right={<><small>Due</small><b>{day(28)}</b><span>{QTY} Nos</span></>}
    />
    <div className="fl-doc-lines">
      <DocLine on name={`${MATERIAL} issued`} qty="300 kg" />
      <DocLine on={t >= OUT_START} name={`${PRODUCT} produced`} qty={t >= OUT_START + OUT_DUR ? `${QTY} Nos` : 'in progress'} />
    </div>
    <div className="fl-doc-tot">
      <DocKV k="Yield" v={t >= 4800 ? '94.2%' : '—'} />
      <DocKV k="Material cost / pc" v={t >= 5100 ? '₹642' : '—'} strong />
    </div>
  </Doc>
);

/* ══════════════════════════════════════════════════════════════════════
   7 · TAX INVOICE
   ══════════════════════════════════════════════════════════════════════ */
const InvoiceBody = ({ t }) => (
  <div className="fl-split">
    <div className="fl-stack">
      <LineTable t={t} start={150} />
      <Totals t={t} start={1100} />
    </div>
    <div className="fl-stack">
      <Field label="Place of supply">Telangana (36) · intrastate</Field>
      <Field label="E-way bill" mono><Typed text="3410 2876 1952" t={t} start={2300} cps={18} ph="—" /></Field>
      <Show on={t >= 4300} className="fl-sent">
        <Check size={13} strokeWidth={3} />
        <span><b>Sent</b><small>Emailed to {EMAIL}</small></span>
      </Show>
    </div>
  </div>
);

const InvoiceDoc = ({ t }) => (
  <Doc title="TAX INVOICE" id={IDS.inv}>
    <DocMeta
      left={<><small>Bill to</small><b>{CUSTOMER}</b><span>GSTIN 36ABCDE1234F1Z5</span></>}
      right={<><small>Date</small><b>{day(24)}</b><span>Ref {IDS.so}</span></>}
    />
    <div className="fl-doc-lines">
      <DocLine on={t >= 150} name={PRODUCT} qty={`${QTY} × ${inr(RATE)}`} amount={inr(SUB)} />
    </div>
    <div className="fl-doc-tot">
      <DocKV k="CGST 9% + SGST 9%" v={t >= 1600 ? inr(HALF_GST * 2) : '—'} />
      <DocKV k="Round off" v={t >= 1750 ? '−₹12' : '—'} />
      <DocKV k="Total" v={t >= 1900 ? inr(TOTAL) : '—'} strong />
    </div>
    {t >= 4300 && <span className="fl-stamp">SENT</span>}
  </Doc>
);

/* ══════════════════════════════════════════════════════════════════════
   The seven scenes, in order. Durations add up — with the six handoffs and
   the closing card — to about a minute.
   ══════════════════════════════════════════════════════════════════════ */
export const SCENES = [
  {
    key: 'enquiry', n: '01', title: 'Enquiry', sub: 'Via your catalogue', Icon: MessageSquareQuote,
    id: IDS.enq, duration: 9000,
    mode: (t) => (t < CUSTOMER_UNTIL ? 'customer' : 'app'),
    desc: 'A customer finds you in your catalogue and asks. It lands in Maks Ops as a record — nobody types it in.',
    status: (t) => (t >= 8350 ? ['Converting', 'amber'] : ['New', 'info']),
    actions: [{ from: 0, label: 'Convert to quotation', cursor: 7700, click: 8350 }],
    secondary: 'Reply',
    Body: EnquiryBody, Doc: EnquiryDoc, Customer: CustomerCatalogue,
    sr: `${CUSTOMER} finds the ${PRODUCT} in the public catalogue and asks for ${QTY}. The enquiry arrives in Maks Ops as ${IDS.enq}.`,
    voice: NARRATION.enquiry,
  },
  {
    key: 'quotation', n: '02', title: 'Quotation', sub: 'Price it', Icon: FileText,
    id: IDS.qt, duration: 8000,
    desc: 'The enquiry’s line carries across. Price it, and the tax follows the place of supply.',
    status: (t) => (t >= 5600 ? ['Accepted', 'ok'] : t >= 4200 ? ['Sent', 'info'] : ['Draft', 'neutral']),
    actions: [
      { from: 0, label: 'Email quotation', cursor: 3000, click: 3500 },
      { from: 4400, label: 'Convert to order', cursor: 6500, click: 7200 },
    ],
    secondary: 'Download PDF',
    Body: QuotationBody, Doc: QuotationDoc,
    sr: `Quotation ${IDS.qt}: ${QTY} at ${inr(RATE)}, total ${inr(TOTAL)} with CGST and SGST. Emailed, and accepted by the customer.`,
    voice: NARRATION.quotation,
  },
  {
    key: 'order', n: '03', title: 'Order', sub: 'Can we fulfil it?', Icon: ClipboardCheck,
    id: IDS.so, duration: 7000,
    desc: 'Before you promise a date, Maks Ops checks every open order against what you actually hold.',
    status: () => ['Confirmed', 'ok'],
    actions: [{ from: 0, label: 'Raise purchase', cursor: 5300, click: 6000 }],
    secondary: 'Print',
    Body: OrderBody, Doc: OrderDoc,
    sr: `Sales order ${IDS.so}. Open orders need 323 kg of ${MATERIAL}; 143 kg is on hand, so the order is short by 180 kg.`,
    voice: NARRATION.order,
  },
  {
    key: 'purchase', n: '04', title: 'Purchase', sub: 'Buy smarter', Icon: ShoppingCart,
    id: IDS.po, duration: 7500,
    desc: 'Vendor quotes arrive as Excel, PDF and Word. Maks Ops reads them and lines them up.',
    status: (t) => (t >= PO_PICK + 350 ? ['PO raised', 'ok'] : ['Comparing', 'amber']),
    actions: [{ from: 0, label: 'Create PO from lowest', cursor: 4300, click: PO_PICK }],
    secondary: 'Upload quote',
    Body: PurchaseBody, Doc: PurchaseDoc,
    sr: `Three vendor quotes are read and compared. Deccan Metals is lowest at ₹260 a kilo; purchase order ${IDS.po} is raised for 180 kg.`,
    voice: NARRATION.purchase,
  },
  {
    key: 'grn', n: '05', title: 'Goods receipt', sub: 'Stock updates itself', Icon: Truck,
    id: IDS.grn, duration: 6500,
    desc: 'Material lands. Receive it against the PO and the stock moves on the receipt itself.',
    status: (t) => (t >= 2250 ? ['Received', 'ok'] : ['Receiving', 'amber']),
    actions: [{ from: 0, label: 'Start production', cursor: 4900, click: 5600 }],
    secondary: 'Print GRN',
    Body: GrnBody, Doc: GrnDoc,
    sr: `Goods receipt ${IDS.grn}: 180 kg received. Stock goes from 143 kg to 323 kg, and the order is fully covered.`,
    voice: NARRATION.grn,
  },
  {
    key: 'production', n: '06', title: 'Production', sub: 'Output, scrap, cost', Icon: Factory,
    id: IDS.prod, duration: 7500,
    desc: 'Issue the material, record the output and the scrap. Yield and true cost per piece follow.',
    status: (t) => (t >= OUT_START + OUT_DUR ? ['Completed', 'ok'] : ['In production', 'amber']),
    actions: [{ from: 0, label: 'Raise invoice', cursor: 6000, click: 6700 }],
    secondary: 'Log scrap',
    Body: ProductionBody, Doc: ProductionDoc,
    sr: `Production ${IDS.prod}: 300 kg issued, 120 pieces made, 17.4 kg scrap logged, yield 94.2%, material cost ₹642 a piece.`,
    voice: NARRATION.production,
  },
  {
    key: 'invoice', n: '07', title: 'Tax invoice', sub: 'Get paid', Icon: ReceiptText,
    id: IDS.inv, duration: 7000,
    desc: 'The order becomes a GST invoice — numbered in sequence, with the e-way bill on it.',
    status: (t) => (t >= 4300 ? ['Sent', 'ok'] : ['Issued', 'info']),
    actions: [{ from: 0, label: 'Email invoice', cursor: 3300, click: 3950 }],
    secondary: 'Download PDF',
    Body: InvoiceBody, Doc: InvoiceDoc,
    sr: `Tax invoice ${IDS.inv} for ${inr(TOTAL)}, with e-way bill, emailed to the customer.`,
    voice: NARRATION.invoice,
  },
];

/* What the voice-over says over the closing card. */
export const CLOSING_VOICE = NARRATION.closing;

/* The seven numbered records the one transaction produced. */
export const CHAIN = SCENES.map((s) => s.id);
export { num, prog };
