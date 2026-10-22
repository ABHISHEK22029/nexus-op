import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import CatalogueShowcase from '../components/marketing/CatalogueShowcase';
import usePageMeta from '../hooks/usePageMeta';
import { Section, Head, AdBand, CtaBand } from '../components/marketing/page/parts';
import Diagram from '../components/marketing/page/Diagrams';
import RolesBand from '../components/marketing/page/RolesBand';
import { LANES, ALSO_INSIDE, BEFORE_AFTER, NEWS } from '../components/marketing/page/content';
import { playAd, playAdWithSound } from '../components/marketing/page/hooks';

/* ══════════════════════════════════════════════════════════════════════
   The homepage: the promise and the 92-second ad, then what the ad showed,
   in the order it happens — never as paragraphs, and never as the ad again.

     · the hero is one line and the ad, with chips under it that play the
       ad from any feature;
     · one order, start to finish: three lanes (Sell, Buy, Make & get paid)
       of three stages, read across and then down. Each stage is a diagram
       of what it does, its name, a few words and the record it leaves;
       pressing it plays that part of the ad. What sits around the flow is
       named underneath, and no more;
     · the catalogue a customer browses, to try; the patchwork it replaces,
       as a table; who does what; what's new; and one closing band.
   The step-by-step walkthrough lives on How It Works, the full film on
   See Maks Ops.
   ══════════════════════════════════════════════════════════════════════ */

const Welcome = () => {
  usePageMeta(
    'Maks Ops — From catalogue to cash',
    'Quotes, stock, purchasing, production and GST invoices, connected in one place for growing manufacturers.',
  );

  return (
    <div className="mp">
      <MarketingNav />

      {/* ── the promise, and the film ── */}
      <section className="mp-section is-dark mp-hero" aria-label="Maks Ops">
        <div className="mp-wrap">
          <div className="mp-hero-text">
            <span className="mp-eyebrow">Operations software for manufacturers</span>
            <h1 className="mp-h1">From catalogue <span className="mp-accent">to cash.</span></h1>
            <p className="mp-lede">
              Quotes, stock, purchasing, production and GST invoices, connected in one place for growing manufacturers.
            </p>
            <div className="mp-btns">
              <Link to="/login" className="mp-btn is-primary">Test Maks Ops <ArrowRight size={17} /></Link>
              <button type="button" className="mp-btn is-ondark" onClick={playAdWithSound}>
                <Play size={15} fill="currentColor" /> Watch with sound <small>1:32</small>
              </button>
            </div>
          </div>
          <AdBand />
        </div>
      </section>

      {/* ── one order, start to finish: across, then down ── */}
      <Section id="the-flow" label="One order, start to finish">
        <Head eyebrow="How it flows" title="One order." accent="Start to finish."
          lede="Press any step to see it in the film." />
        <div className="mp-flow">
          {LANES.map((lane, l) => (
            <div key={lane.key} className={`mp-lane is-${lane.tone}`}>
              <div className="mp-lane-h">
                <b>{lane.title}</b>
                <span>{lane.tag}</span>
              </div>
              <ol className="mp-stages">
                {lane.stages.map((s, i) => (
                  <li key={s.title}>
                    <button type="button" className="mp-stage" onClick={() => playAd(s.play)}
                      aria-label={`${s.title}: ${s.line}. Play this part of the film`}>
                      <Diagram name={s.diagram} />
                      <span className="mp-stage-t"><span className="mp-stage-n">{l * 3 + i + 1}</span>{s.title}</span>
                      <span className="mp-stage-l">{s.line}</span>
                      <span className="mp-stage-r">{s.record}</span>
                      <span className="mp-stage-play" aria-hidden="true"><Play size={12} fill="currentColor" /></span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="mp-also">
          <span className="mp-also-h">Also inside</span>
          {ALSO_INSIDE.map(({ label, Icon }) => (
            <span key={label} className="mp-also-chip">{React.createElement(Icon, { size: 15, 'aria-hidden': true })}{label}</span>
          ))}
          <Link to="/platform" className="mp-textlink">Every module <ArrowRight size={14} /></Link>
        </div>
      </Section>

      {/* ── the catalogue, to try ── */}
      <Section tone="alt" id="catalogue" label="Your public catalogue">
        <Head eyebrow="Your public catalogue" title="A shopfront that brings" accent="real enquiries." />
        <CatalogueShowcase />
      </Section>

      {/* ── the patchwork it replaces ── */}
      <Section label="Before and after">
        <Head title="Leave the patchwork" accent="behind." />
        <div className="mp-vs" role="table" aria-label="Before Maks Ops, and with it">
          <div className="mp-vs-row is-head" role="row">
            <span role="columnheader">Today</span><span aria-hidden="true" /><span role="columnheader">With Maks Ops</span>
          </div>
          {BEFORE_AFTER.map(({ before, B, after, A }) => (
            <div key={before} className="mp-vs-row" role="row">
              <span role="cell" className="mp-vs-cell is-before"><span className="mp-vs-ico">{React.createElement(B, { size: 18 })}</span>{before}</span>
              <ArrowRight size={18} className="mp-vs-arrow" aria-hidden="true" />
              <span role="cell" className="mp-vs-cell is-after"><span className="mp-vs-ico">{React.createElement(A, { size: 18 })}</span>{after}</span>
            </div>
          ))}
        </div>
      </Section>

      <RolesBand />

      {/* ── what's new: proof a beta can honestly give ── */}
      <Section label="What's new">
        <Head eyebrow="What's new" title="In beta," accent="better every week." />
        <ol className="mp-news">
          {NEWS.map((n) => (
            <li key={n.title}>
              <time>{n.date}</time>
              <b>{n.title}</b>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand title="Run your next order through Maks Ops." line="No credit card. Every module included.">
        <Link to="/login" className="mp-btn is-primary"><Play size={15} fill="currentColor" /> Test Maks Ops</Link>
        <Link to="/see-maksops" className="mp-btn is-ghost">Watch the full film</Link>
      </CtaBand>

      <MarketingFooter />
    </div>
  );
};

export default Welcome;
