import React from 'react';
import { Store, Plus, MessageCircle, Share2, Mail, ExternalLink, Check, Camera } from 'lucide-react';
import { Show, Typed, Cursor } from '../../../flow/kit';
import { PRODUCTS, StudioDefs } from '../../../flow/story';
import { PRODUCT, CATALOGUE_URL } from '../../../data/transaction';
import { ScreenHead } from '../../shell/screen';

/* 03 — CatalogueAddProduct and CatalogueSettings ("The page", "What
   appears", Publish / Live and the share row), in their own words. */
export const Icon = Store;

const F = ({ label, children, hint, wide }) => (
  <label className={`fm-pf-field${wide ? ' is-wide' : ''}`}>
    <small>{label}</small>
    <span className="fm-input is-app">{children}</span>
    {hint && <em className="fm-hint">{hint}</em>}
  </label>
);

function AddProduct({ t }) {
  const art = PRODUCTS[0][2];
  return (
    <div className="fm-screen">
      <ScreenHead icon={Store} title="Add a product" sub="What a customer reads, and what your team calls it." />
      <div className="fm-addprod">
        <div className="fm-photos">
          <small>Photographs</small>
          <div className="fm-photo-row">
            {[0, 1, 2].map((i) => (
              <Show key={i} on={t >= 500 + i * 450} className={`fm-photo${i === 0 ? ' is-main' : ''}`}>
                <span className="fm-cat-img">{art}</span>
                {i === 0 && <em>MAIN</em>}
              </Show>
            ))}
            <span className="fm-photo is-add"><Camera size={16} /></span>
          </div>
        </div>
        <div className="fm-add-form">
          <F label="Name *" wide><Typed text={PRODUCT.name} t={t} start={1800} cps={22} /></F>
          <F label="Code"><Typed text={PRODUCT.code} t={t} start={3000} cps={14} ph="833" /></F>
          <F label="Unit"><Typed text={PRODUCT.unit} t={t} start={3500} cps={10} /></F>
          <F label="Rate ₹"><Typed text={String(PRODUCT.rate)} t={t} start={3900} cps={10} ph="—" /></F>
          <F label="HSN"><Typed text={PRODUCT.hsn} t={t} start={4500} cps={10} ph="7308" /></F>
          <F label="Headline" wide hint="Shown instead of the name above. Leave blank to use the name."><Typed text="2 mm SS304, brushed — for panel and frame mounting" t={t} start={5000} cps={34} /></F>
          <F label="Category" hint="Becomes a filter."><Typed text={PRODUCT.category} t={t} start={6600} cps={14} ph="Line hardware" /></F>
          <F label="Minimum order"><Typed text={String(PRODUCT.moq)} t={t} start={7300} cps={10} ph="100" /></F>
          <F label="Lead time"><Typed text={PRODUCT.leadTime} t={t} start={7700} cps={14} ph="3 weeks from approval" /></F>
          <span className="fm-check"><i className={t >= 8600 ? 'is-on' : ''}>{t >= 8600 && <Check size={11} />}</i> List it straight away.</span>
          <span className="fl-cursor-host is-inline">
            <span className={`fl-btn primary${t >= 9800 && t < 10050 ? ' is-pressed' : ''}`}><Plus size={13} /> Add product</span>
            <Cursor on={t >= 9000 && t < 10500} click={t >= 9800 && t < 10050} />
          </span>
        </div>
      </div>
    </div>
  );
}

function ThePage({ t, live }) {
  const at = t - 11000;
  const published = live && t >= 22600;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Store} title="Catalogue" sub="The products you list here appear on your public page." />
      <div className={`fm-live${published ? ' is-live' : ''}`}>
        <Store size={18} />
        <span className="fm-live-txt">
          <b>{published ? 'Your catalogue is live' : 'Your catalogue is not published'}</b>
          <small>{published ? 'Anyone with the link can see the 6 products you have published, and send you an enquiry.' : 'Nobody outside your business can see it yet.'}</small>
          {published && (
            <span className="fm-share fl-enter-soft">
              <span className="fm-link-pill">{CATALOGUE_URL}</span>
              <span className="fl-cursor-host is-inline">
                <span className={`fl-btn fm-wa-btn${t >= 26300 && t < 26550 ? ' is-pressed' : ''}`}><MessageCircle size={13} /> Share on WhatsApp</span>
                <Cursor on={t >= 25400 && t < 27000} click={t >= 26300 && t < 26550} />
              </span>
              <span className="fl-btn"><Share2 size={13} /> Share</span>
              <span className="fl-btn"><Mail size={13} /> Email</span>
              <span className="fl-btn"><ExternalLink size={13} /> Open</span>
            </span>
          )}
        </span>
        <span className="fl-cursor-host is-inline">
          <span className={`fm-publish${published ? ' is-on' : ''}${live && t >= 22300 && t < 22550 ? ' is-pressed' : ''}`}>{published ? 'Live' : 'Publish'}</span>
          {live && <Cursor on={t >= 21400 && t < 22900} click={t >= 22300 && t < 22550} />}
        </span>
      </div>
      <div className="fm-page-grid">
        <section className="fm-card">
          <b className="fm-card-h">The page</b>
          <F label="Web address"><span className="fm-muted">maksops.co.in/c/</span>{live || at >= 600 ? <Typed text="precision-fab" t={live ? 1e9 : t} start={11600} cps={14} /> : <span className="fm-ph">your-company</span>}</F>
          <F label="Where enquiries should go"><Typed text="sales@precisionfab.example" t={live ? 1e9 : t} start={12700} cps={30} ph="sales@yourcompany.com" /></F>
          <F label="WhatsApp number"><Typed text="98480 55210" t={live ? 1e9 : t} start={13700} cps={16} ph="98866 44456" /></F>
          <F label="Headline"><Typed text="Fabricated steel parts, made to drawing." t={live ? 1e9 : t} start={14300} cps={34} ph="What you make, in your words" /></F>
          <span className="fm-check"><i className={live || t >= 16000 ? 'is-on' : ''}>{(live || t >= 16000) && <Check size={11} />}</i> Show prices publicly.</span>
        </section>
        <section className="fm-card">
          <b className="fm-card-h">What appears — 6 of 6 published</b>
          <StudioDefs />
          {PRODUCTS.map(([name, spec, art], i) => (
            <Show key={name} on={live || at >= 1200 + i * 350} className="fm-list-row">
              <span className="fm-thumb">{art}</span>
              <span className="fm-list-main"><b>{name}</b><small>{spec}</small></span>
              <span className="fm-listed is-on">Listed</span>
              <span className="fm-muted fm-edit">Edit</span>
            </Show>
          ))}
        </section>
      </div>
    </div>
  );
}

export default function Scene({ t, beat }) {
  if (beat.key === 'add') return <AddProduct t={t} />;
  return <ThePage t={t} live={beat.key === 'publish'} />;
}

