import React, { Suspense, lazy, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, ArrowRight, Play } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import { CHAPTERS } from '../components/marketing/film/chapters';
import { beatsOf, totalMs } from '../components/marketing/flow/engine/timeline';
import { MODULES, moduleForPath } from '../lib/navigation';
import './see-maksops.css';

/* ══════════════════════════════════════════════════════════════════════
   /see-maksops — the product film.

   The homepage walkthrough is the minute-long version: one order, seven
   stages. This is the whole of it, in chapters — catalogue, customer,
   enquiry, quotation, stock, vendors, purchasing, receipt, production,
   dispatch, invoice, money, roles — played in the product itself.

   The film is its own chunk, loaded after the page; the chapter index
   below it is plain text built from the same chapter scripts, so the page
   reads (and is found) without the film, and every chapter has a link.

   ?mode=film shows only the stage, letterboxed, for recording an MP4.
   ══════════════════════════════════════════════════════════════════════ */
const ProductFilm = lazy(() => import('../components/marketing/film/ProductFilm'));

const RUNTIME_MIN = Math.round(totalMs(CHAPTERS, 1200) / 60000);

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

  useEffect(() => {
    const prev = document.title;
    document.title = 'See Maks Ops — the product film';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    meta?.setAttribute('content', `Maks Ops at work, start to finish: catalogue, enquiry, quotation, stock, vendor quotes, purchasing, goods receipt, production, dispatch and the GST invoice — a ${RUNTIME_MIN}-minute film played in the product itself.`);
    return () => { document.title = prev; if (meta && prevDesc) meta.setAttribute('content', prevDesc); };
  }, []);

  if (film) {
    return (
      <div className="smk-filmmode">
        <Suspense fallback={null}><ProductFilm mode="film" /></Suspense>
      </div>
    );
  }

  return (
    <div className="smk">
      <MarketingNav />

      <section className="smk-hero">
        <div className="smk-wrap">
          <span className="pill pill-amber"><Clapperboard size={12} /> Product film · {RUNTIME_MIN} min · sample data</span>
          <h1>See Maks Ops <span className="gradient-text-amber">at work.</span></h1>
          <p>
            One customer’s order, from your catalogue to a paid invoice — and everything the platform does on the
            way. Not a video: the product itself, playing through a real transaction with sample data.
          </p>
          <a className="smk-skip" href="#chapters">Jump to a chapter <ArrowRight size={14} /></a>
        </div>
      </section>

      <section className="smk-theatre" aria-label="The product film">
        <div className="smk-wrap is-wide">
          <Suspense fallback={<Placeholder />}><ProductFilm /></Suspense>
        </div>
      </section>

      <section className="smk-index" id="chapters">
        <div className="smk-wrap">
          <h2>Every chapter</h2>
          <p className="smk-lede">Each one is a part of the product you can use today. Start the film from any of them.</p>
          <ol className="smk-list">
            {CHAPTERS.map((ch) => {
              const where = whereInApp(ch);
              return (
                <li key={ch.key} className="smk-ch">
                  <span className="smk-n">{ch.n}</span>
                  <div className="smk-ch-body">
                    <h3>{ch.title} <small>{ch.kicker}</small></h3>
                    <p>{ch.seo?.body}</p>
                    {where.length > 0 && <p className="smk-where">Where in the app: {where.join(' · ')}</p>}
                    <details>
                      <summary>Transcript</summary>
                      <p>{beatsOf(ch).map((b) => b.voice).filter(Boolean).join(' ')}</p>
                    </details>
                  </div>
                  <a className="smk-watch" href={`#${ch.key}`}><Play size={13} /> Watch from here</a>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="smk-cta">
        <div className="smk-wrap">
          <h2>Run your own order through it.</h2>
          <p>Put your products in a catalogue, take an enquiry, and follow it to the invoice.</p>
          <div className="smk-cta-btns">
            <Link to="/login" className="btn-primary">Test Beta <ArrowRight size={15} /></Link>
            <Link to="/platform" className="btn-secondary">See the platform</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
