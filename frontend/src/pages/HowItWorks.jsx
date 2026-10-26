import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play, Volume2, Check } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import usePageMeta from '../hooks/usePageMeta';
import { PAGES } from '../lib/seo';
import FlowShowcase from '../components/marketing/flow/FlowShowcase';
import { SCENES } from '../components/marketing/flow/story';
import { Section, Head, CtaBand } from '../components/marketing/page/parts';
import Diagram from '../components/marketing/page/Diagrams';
import { PHASES, STEPS } from '../components/marketing/page/content';
import { playStage, playWalkthroughWithVoice } from '../components/marketing/page/hooks';

/* ══════════════════════════════════════════════════════════════════════
   How It Works: one order, step by step — shown by the walkthrough, and
   then the same seven steps set out to be scanned.

   The walkthrough is the page's first screen. Under it the seven steps run
   down one line in three phases: each a small animated diagram of what
   the step does (not a frame of the walkthrough again), its title and one
   line, what it covers as three short tags, the record it makes, and a
   button that plays that stage in the walkthrough above.
   ══════════════════════════════════════════════════════════════════════ */

const HowItWorks = () => {
  usePageMeta(PAGES['/how-it-works'].title, PAGES['/how-it-works'].description, '/how-it-works');

  return (
    <div className="mp">
      <MarketingNav />

      {/* ── the walkthrough, first ── */}
      <section className="mp-section mp-hero" aria-label="How it works">
        <div className="mp-wrap">
          <Head level={1} eyebrow="How it works" title="From enquiry to invoice," accent="in one flow."
            lede="Follow one real order through Maks Ops. Press any step to watch it." />
          <div className="mp-btns" style={{ marginTop: -24 }}>
            <button type="button" className="mp-btn is-primary" onClick={playWalkthroughWithVoice}>
              <Volume2 size={17} /> Watch with voice-over
            </button>
            <Link to="/login" className="mp-btn is-ghost">Test Maks Ops <ArrowRight size={17} /></Link>
          </div>
          <div id="the-walkthrough" className="mp-walkthrough">
            <FlowShowcase />
          </div>
        </div>
      </section>

      {/* ── the seven steps, in three phases, down one line ── */}
      <Section tone="alt" label="The seven steps">
        <Head title="Seven steps." accent="Three phases." lede="What each step does, and the record it leaves behind." />
        <div className="mp-timeline">
          {PHASES.map((ph) => (
            <section key={ph.key} className={`mp-tl-phase is-${ph.tone}`} aria-label={ph.title}>
              <h3 className="mp-tl-phase-h">
                <b>{ph.title}</b>
                <span>{ph.steps.length === 1 ? `Step ${ph.steps[0] + 1}` : `Steps ${ph.steps[0] + 1}–${ph.steps[ph.steps.length - 1] + 1}`}</span>
              </h3>
              {ph.steps.map((i) => {
                const s = STEPS[i], sc = SCENES[i];
                return (
                  <article key={sc.key} className="mp-tl-step">
                    <span className="mp-tl-dot" aria-hidden="true">{sc.n}</span>
                    <div className="mp-tl-card">
                      <Diagram name={s.diagram} className="mp-tl-pic" />
                      <div className="mp-tl-body">
                        <h4 className="mp-h3">{s.title}</h4>
                        <p className="mp-body">{s.line}</p>
                        <ul className="mp-tags">
                          {s.tags.map((t) => <li key={t}><Check size={13} strokeWidth={3} aria-hidden="true" />{t}</li>)}
                        </ul>
                        <div className="mp-tl-foot">
                          <span className="mp-tl-id" title="The record this step makes">{sc.id}</span>
                          <button type="button" className="mp-textlink" onClick={() => playStage(i)}>
                            <Play size={13} fill="currentColor" /> Watch this step
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </Section>

      {/* ── the maths on the invoice the walkthrough ends with ── */}
      <Section label="The invoice maths">
        <Head eyebrow="The maths" title="Every invoice," accent="worked out." lede="The order from the walkthrough, line by line." />
        <div className="mk-math mp-math">
          {[
            ['Sub-total', '#16A34A', '= Qty × Rate', '120 × ₹2,320 = ₹2,78,400'],
            ['CGST (9%)', '#2563EB', '= Sub-total × 0.09', '₹25,056'],
            ['SGST (9%)', '#2563EB', '= Sub-total × 0.09', '₹25,056'],
            ['Round off', '#D97706', 'to the nearest rupee', '−₹12'],
          ].map(([label, tone, rule, eg]) => (
            <React.Fragment key={label}>
              <span style={{ color: tone, fontWeight: 700 }}>{label}</span>
              <span>{rule}</span>
              <span className="mk-math-eg">{eg}</span>
            </React.Fragment>
          ))}
          <span className="mp-math-note">CGST + SGST within your state; IGST (18%) when the place of supply is another state.</span>
          <span className="mp-math-rule" />
          <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>Invoice total</span>
          <span>= Sub-total + GST ± round off</span>
          <span className="mk-math-eg is-total">₹3,28,500</span>
        </div>
        <p className="mp-small" style={{ textAlign: 'center', marginTop: 18 }}>
          Contract work? Running-account bills, with TDS and retention, are in{' '}
          <Link to="/platform?module=projects" style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>Projects &amp; BOQ</Link>.
        </p>
      </Section>

      <CtaBand title="Run your own order." line="No credit card. Every module included.">
        <Link to="/login" className="mp-btn is-primary"><Play size={15} fill="currentColor" /> Test Maks Ops</Link>
        <Link to="/see-maksops" className="mp-btn is-ghost">Watch the full film</Link>
      </CtaBand>

      <MarketingFooter />
    </div>
  );
};

export default HowItWorks;
