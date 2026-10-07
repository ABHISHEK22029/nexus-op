import React from 'react';
import {
  ShoppingBag, MessageCircle, Search, Share2, ArrowLeft, Send, Check, X, Inbox, Clock, Globe,
} from 'lucide-react';
import { Show, Typed, Cursor, Pill } from '../../../flow/kit';
import { PRODUCTS, StudioDefs, BracketArt } from '../../../flow/story';
import {
  SELLER, CUSTOMER, PRODUCT, QTY, SUB, makeIds, FILM_DATE,
} from '../../../data/transaction';
import { ScreenHead, Tiles, Chips } from '../../shell/screen';

/* 04 — the customer, on the public catalogue, as PublicCatalogue.jsx draws
   it: search, category chips, cards with a quantity box, the product page
   with its rate / unit / minimum order / lead time / HSN, "Add to
   enquiry", and the "Your enquiry" drawer. Then the enquiry arriving in
   Maks Ops' Enquiries list. */
export const Icon = Globe;

const IDS = makeIds(FILM_DATE);
const rupee = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const CATEGORY = {
  [PRODUCT.name]: 'Brackets', 'Base Plate': 'Brackets', 'Cable Tray Support': 'Cable trays',
  'Solar Module Clamp': 'Solar', 'Sheet Metal Enclosure': 'Enclosures', 'Cross Arm': 'Structures',
};
const CHIPS = ['Everything', 'Brackets', 'Cable trays', 'Solar', 'Enclosures', 'Structures'];

/* the catalogue's header, as a stranger sees it */
const Header = ({ basket }) => (
  <div className="fm-cat-head">
    <span className="fm-cat-logo">PF</span>
    <span className="fm-cat-co"><b>{SELLER.name}</b><small>6 products · 5 categories</small></span>
    <span className="fm-cat-btn is-icon"><Share2 size={14} /></span>
    <span className="fm-cat-btn"><MessageCircle size={14} className="fm-wa" /> WhatsApp</span>
    <span className={`fm-cat-btn is-basket${basket ? ' is-full' : ''}`}>
      <ShoppingBag size={14} /> Enquiry{basket ? <i>{basket}</i> : null}
    </span>
  </div>
);

function Grid({ t, layout }) {
  const chip = t >= 7300 ? 'Brackets' : 'Everything';
  const query = t >= 8600 ? 'SS304' : '';
  const shown = PRODUCTS.filter(([name]) =>
    (chip === 'Everything' || CATEGORY[name] === chip) && (!query || name.toUpperCase().includes(query)));
  const list = layout === 'narrow' ? shown.slice(0, 4) : shown;
  return (
    <div className="fm-cat-body">
      <div className="fm-cat-hero">
        <small>What we make</small>
        <b>Fabricated steel parts, made to drawing.</b>
        <span>Brackets, supports, clamps and enclosures — cut, bent and finished in {SELLER.city}.</span>
      </div>
      <div className="fm-cat-tools">
        <span className="fl-cursor-host fm-cat-search">
          <Search size={14} />
          {t >= 8600
            ? <span className="fm-typed"><Typed text="SS304" t={t} start={8600} cps={9} /></span>
            : <span className="fm-ph">Search — size, description, code</span>}
          <Cursor on={t >= 8000 && t < 8900} click={t >= 8450 && t < 8650} />
        </span>
      </div>
      <div className="fl-cursor-host">
        <Chips items={CHIPS} on={chip} />
        <span className="fm-chip-cursor"><Cursor on={t >= 6400 && t < 7600} click={t >= 7100 && t < 7350} /></span>
      </div>
      <div className="fm-cat-grid">
        {list.map(([name, spec, art], i) => (
          <div key={name} className={`fm-cat-card${i === 0 && t >= 10900 ? ' is-pressed' : ''}`}>
            <span className="fm-cat-img">{art}</span>
            <b>{name}</b>
            <small>{spec}</small>
            <span className="fm-cat-meta">MOQ 50 · 2 weeks</span>
            <span className="fm-cat-add"><span className="fm-qty">1</span><span className="fm-add">Add</span></span>
            {i === 0 && <span className="fl-cursor-host fm-card-cursor"><Cursor on={t >= 10100 && t < 11500} click={t >= 10800 && t < 11050} /></span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductPage({ t }) {
  const added = t >= 16600;
  return (
    <div className="fm-cat-body fm-prod fl-enter">
      <span className="fm-back"><ArrowLeft size={13} /> All products</span>
      <div className="fm-prod-grid">
        <div className="fm-prod-art"><BracketArt /></div>
        <div className="fm-prod-info">
          <small className="fm-prod-cat">Brackets</small>
          <b className="fm-prod-name">{PRODUCT.name}</b>
          <span className="fm-prod-line">2 mm SS304, brushed — for panel and frame mounting.</span>
          <dl className="fm-prod-dl">
            <dt>Rate</dt><dd>{rupee(PRODUCT.rate)} / {PRODUCT.unit}</dd>
            <dt>Unit</dt><dd>{PRODUCT.unit}</dd>
            <dt>Minimum order</dt><dd>{PRODUCT.moq} {PRODUCT.unit}</dd>
            <dt>Lead time</dt><dd>{PRODUCT.leadTime}</dd>
            <dt>HSN</dt><dd>{PRODUCT.hsn}</dd>
          </dl>
          <span className="fm-prod-ask">How many do you need?</span>
          <div className="fm-prod-buy">
            <span className="fm-qty is-big"><Typed text={String(QTY)} t={t} start={13600} cps={7} ph="1" /></span>
            <span className="fl-cursor-host is-inline">
              <span className={`fm-cat-cta${t >= 16300 && t < 16550 ? ' is-pressed' : ''}${added ? ' is-done' : ''}`}>
                {added ? <><Check size={14} /> Added</> : 'Add to enquiry'}
              </span>
              <Cursor on={t >= 15500 && t < 17200} click={t >= 16300 && t < 16550} />
            </span>
          </div>
          <Show on={t >= 14200} className="fm-prod-est">≈ {rupee(SUB)} for {QTY}</Show>
        </div>
      </div>
    </div>
  );
}

const FIELDS = [
  ['Your name *', CUSTOMER.contact, 18700],
  ['Company', CUSTOMER.name, 19500],
  ['Phone', '98480 12345', 20600],
  ['Email', CUSTOMER.email, 21200],
];

function Drawer({ t }) {
  const sent = t >= 23900;
  return (
    <div className="fm-drawer-wrap">
      <div className="fm-drawer fl-enter">
        <div className="fm-drawer-h">
          <b>{sent ? 'Enquiry sent' : 'Your enquiry'}</b>
          <X size={15} />
        </div>
        {sent ? (
          <div className="fm-sent fl-enter-soft">
            <span className="fm-sent-id"><Check size={18} /> {IDS.enq}</span>
            <p>Thank you — we have your enquiry and someone will be in touch. Quote <strong>{IDS.enq}</strong> if you call.</p>
          </div>
        ) : (
          <>
            <div className="fm-drawer-line">
              <span>{PRODUCT.name}</span>
              <span className="fm-qty">{QTY}</span>
            </div>
            <div className="fm-drawer-total"><span>Indicative total</span><b>{rupee(SUB)}</b></div>
            {FIELDS.map(([ph, value, start]) => (
              <span key={ph} className="fm-input">
                {t >= start ? <Typed text={value} t={t} start={start} cps={28} /> : <span className="fm-ph">{ph}</span>}
              </span>
            ))}
            <span className="fm-input is-tall">
              {t >= 22000
                ? <Typed text="Brushed finish, delivery in 4 weeks. Drawing to follow." t={t} start={22000} cps={34} />
                : <span className="fm-ph">Anything we should know — site, timeline, drawings</span>}
            </span>
            <span className="fl-cursor-host">
              <span className={`fm-cat-cta is-wide${t >= 23550 && t < 23800 ? ' is-pressed' : ''}`}><Send size={14} /> Send enquiry</span>
              <Cursor on={t >= 23000 && t < 24300} click={t >= 23550 && t < 23800} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* The other side: the same enquiry, in Maks Ops. */
function Landed({ t }) {
  const at = t - 24500;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Inbox} title="Enquiries"
        sub="People who found your catalogue and asked for something. Converting one adds them as a customer." />
      <Tiles items={[['Total', at >= 500 ? 3 : 2], ['New', at >= 500 ? 1 : 0, 'info'], ['Quoted', 2, 'violet'], ['Won', 0, 'ok']]} />
      <Chips items={['All', 'New', 'Read', 'Quoted', 'Won', 'Ignored']} on="All" />
      <div className="fm-rows">
        <Show on={at >= 500} from="down" className="fm-row is-new">
          <Pill tone="info">New</Pill>
          <span className="fm-row-main">
            <b>{CUSTOMER.name} <span>· {CUSTOMER.contact}</span></b>
            <small>{IDS.enq} · 1 item · Brushed finish, delivery in 4 weeks. Drawing to follow.</small>
          </span>
          <span className="fm-row-when"><Clock size={11} /> just now</span>
        </Show>
        <div className="fm-row">
          <Pill>Quoted</Pill>
          <span className="fm-row-main"><b>Orbit Infra <span>· Suresh</span></b><small>ENQ-0041 · 2 items · Base plates for the yard canopy</small></span>
          <span className="fm-row-when"><Clock size={11} /> 2 days ago</span>
        </div>
        <div className="fm-row">
          <Pill>Quoted</Pill>
          <span className="fm-row-main"><b>Sunline Solar <span>· Meera</span></b><small>ENQ-0039 · 1 item · Mid clamps, 600</small></span>
          <span className="fm-row-when"><Clock size={11} /> last week</span>
        </div>
      </div>
      <Show on={at >= 1600} className="fm-note-chip">Arrived from your catalogue — nobody typed it in.</Show>
    </div>
  );
}

export default function Scene({ t, beat, layout }) {
  if (beat.key === 'lands') return <Landed t={t} />;
  const onProduct = t >= 11500;
  return (
    <div className="fm-cat">
      <StudioDefs />
      <Header basket={t >= 16700 ? 1 : 0} />
      {onProduct ? <ProductPage t={t} /> : <Grid t={t} layout={layout} />}
      {beat.key === 'send' && <Drawer t={t} />}
    </div>
  );
}
