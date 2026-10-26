import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import { CHAPTERS, chapterIndex } from '../components/marketing/film/chapters';
import { beatsOf, totalMs, startOf } from '../components/marketing/flow/engine/timeline';
import { MODULES, moduleForPath } from '../lib/navigation';
import { Section, Head, CtaBand } from '../components/marketing/page/parts';
import { FILM_ACTS, CHAPTER_CARDS } from '../components/marketing/page/content';
import usePageMeta from '../hooks/usePageMeta';
import { PAGES } from '../lib/seo';
import './see-maksops.css';

/* ══════════════════════════════════════════════════════════════════════
   /see-maksops — the product film, and its chapters to jump into.

   The film is the page's first screen, on its own dark stage. Under it the
   eighteen chapters, grouped into five acts, are cards — an icon, the
   title, what the chapter shows in one line, and where it starts; pressing
   one plays the film from there (#chapter, which the film follows). They
   are not frames of the film: the film is already on the page. Its full
   text — a paragraph per chapter, where it is in the app, the transcript —
   is folded into one "Read the film as text", for anyone who wants it and
   for search engines.

   The film is its own chunk, loaded after the page. ?mode=film shows only
   the stage, letterboxed, for recording an MP4.
   ══════════════════════════════════════════════════════════════════════ */

const ProductFilm = lazy(() => import('../components/marketing/film/ProductFilm'));
const HANDOFF = 1200;     // the title card between chapters (ProductFilm)
const RUNTIME_MIN = Math.round(totalMs(CHAPTERS, HANDOFF) / 60000);

const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* "Marketing › Enquiries": where each chapter happens, from the app's own
   menu. Chapters on the customer's screen or title cards have none. */
const whereInApp = (ch) => {
  const paths = [ch.path, ...beatsOf(ch).map((b) => b.path)].filter((p) => p && !p.startsWith('/c/'));
  const seen = new Set();
  return paths.map((p) => {
    const m = MODULES.find((x) => x.key === moduleForPath(p));
    const item = m?.items.filter((i) => i.path && (p === i.path || p.startsWith(`${i.path}/`)))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return m && item ? `${m.label} › ${item.label}` : null;
  }).filter((w) => w && !seen.has(w) && seen.add(w));
};

const Placeholder = () => <div className="smk-ph" aria-hidden="true"><Play size={28} /></div>;

export default function SeeMaksOps() {
  const film = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'film';

  usePageMeta(PAGES['/see-maksops'].title, PAGES['/see-maksops'].description, '/see-maksops');

  if (film) {
    return (
      <div className="smk-filmmode">
        <Suspense fallback={null}><ProductFilm mode="film" /></Suspense>
      </div>
    );
  }

  return (
    <div className="mp smk">
      <MarketingNav />

      {/* ── the film ── */}
      <section className="mp-section is-dark mp-hero" aria-label="The product film">
        <div className="mp-wrap">
          <div className="mp-hero-text">
            <span className="mp-eyebrow">Product film · {CHAPTERS.length} chapters · {RUNTIME_MIN} min · sample data</span>
            <h1 className="mp-h1">See Maks Ops <span className="mp-accent">at work.</span></h1>
            <p className="mp-lede">One order from your catalogue to a paid invoice, and everything Maks Ops does on the way.</p>
          </div>
          <div id="the-film" className="mp-film-slot smk-film">
            <Suspense fallback={<Placeholder />}><ProductFilm /></Suspense>
          </div>
        </div>
      </section>

      {/* ── its chapters, to jump into ── */}
      <Section id="chapters" label="Chapters">
        <Head title="Eighteen chapters." accent="Five acts." lede="Press any chapter to watch from there." />
        <div className="mp-acts">
          {FILM_ACTS.map((act, a) => {
            const chs = act.chapters.map((k) => CHAPTERS[chapterIndex(k)]).filter(Boolean);
            const length = chs.reduce((s, c) => s + c.duration, 0);
            return (
              <div key={act.title} className={`mp-act is-${act.tone}`}>
                <div className="mp-act-h">
                  <span>Act {a + 1}</span><b>{act.title}</b>
                  <small>{chs.length} chapters · {clock(length)}</small>
                </div>
                <ol className="mp-chapters">
                  {chs.map((ch) => {
                    const card = CHAPTER_CARDS[ch.key] || {};
                    const from = clock(startOf(CHAPTERS, chapterIndex(ch.key), HANDOFF));
                    return (
                      <li key={ch.key} className="mp-chapter">
                        <a href={`#${ch.key}`} aria-label={`${ch.title}: watch from ${from}`}>
                          <span className="mp-chapter-top">
                            <span className="mp-chapter-ico">{card.Icon && React.createElement(card.Icon, { size: 20, 'aria-hidden': true })}</span>
                            <span className="mp-chapter-play"><Play size={11} fill="currentColor" /> {from}</span>
                          </span>
                          <span className="mp-chapter-meta">
                            <b>{ch.title}</b>
                            {card.line && <span>{card.line}</span>}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>

        {/* everything the film says, as text — folded */}
        <details className="mp-transcript">
          <summary>Read the film as text</summary>
          {CHAPTERS.map((ch) => {
            const where = whereInApp(ch);
            return (
              <section key={ch.key}>
                <h3>{ch.n} · {ch.title}</h3>
                {ch.seo?.body && <p>{ch.seo.body}</p>}
                <p>{beatsOf(ch).map((b) => b.voice).filter(Boolean).join(' ')}</p>
                {where.length > 0 && <p>Where in the app: {where.join(' · ')}</p>}
              </section>
            );
          })}
        </details>
      </Section>

      <CtaBand title="Run your own order through it." line="No credit card. Every module included.">
        <Link to="/login" className="mp-btn is-primary"><Play size={15} fill="currentColor" /> Test Maks Ops</Link>
        <Link to="/platform" className="mp-btn is-ghost">See the platform <ArrowRight size={16} /></Link>
      </CtaBand>

      <MarketingFooter />
    </div>
  );
}
