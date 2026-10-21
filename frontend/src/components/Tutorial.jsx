/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial: the panel of steps, the coach card that
   follows a person from screen to screen, and the pulse on the button they
   should press next. State in context/TutorialContext; steps in
   lib/tutorial.

   The panel opens from the ▶ at the top of the menu rail (and by itself on
   a first sign-in). "Show me" opens the step's screen, points at the button
   to press, and leaves a small card in the corner saying what to do; the
   card turns green when the step is done and offers the next one.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, X, Check, ArrowRight, Film, MousePointerClick, ListChecks, PartyPopper } from 'lucide-react';
import { useTutorial } from '../context/TutorialContext';
import { CHAPTERS } from '../lib/tutorial';

const SPOT = 'tut-spot';
const clearSpot = () => document.querySelectorAll(`.${SPOT}`).forEach(el => el.classList.remove(SPOT));

/* The button a step points at: the first visible one on the page (not in
   the menus) whose text matches. */
function spotlight(target) {
  clearSpot();
  if (!target) return false;
  const page = document.querySelector('.app-page') || document.body;
  const el = [...page.querySelectorAll('button, a')]
    .find(b => b.offsetParent && target.test((b.textContent || '').trim()));
  if (!el) return false;
  el.classList.add(SPOT);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.addEventListener('click', clearSpot, { once: true });
  return true;
}

export default function Tutorial() {
  const t = useTutorial();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const step = t?.steps.find(s => s.key === t.active) || null;
  const idx = step ? t.steps.indexOf(step) : -1;

  /* Point at the button once the step's screen has drawn (it may still be
     loading: try a few times). */
  useEffect(() => {
    if (!step || step.isDone || !step.target || !pathname.startsWith(step.path)) { clearSpot(); return undefined; }
    const timers = [250, 900, 1800, 3200].map(ms => setTimeout(() => spotlight(step.target), ms));
    return () => { timers.forEach(clearTimeout); };
  }, [step?.key, step?.isDone, pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearSpot(), []);

  if (!t) return null;

  const showMe = (s) => {
    t.setActive(s.key);
    t.setIntro(false);
    t.setOpen(false);
    if (!pathname.startsWith(s.path)) navigate(s.path);
    else setTimeout(() => spotlight(s.target), 200);
  };
  const stop = () => { t.setActive(null); clearSpot(); };
  const allDone = t.ready && t.total > 0 && t.doneCount === t.total;

  return (
    <>
      {t.open && (
        <>
          <div className="tut-backdrop" onClick={() => t.setOpen(false)} aria-hidden="true" />
          <section className="tut-panel" role="dialog" aria-modal="false" aria-label="Getting started">
            <header className="tut-head">
              <span className="tut-head-icon"><Play size={16} fill="currentColor" /></span>
              <div style={{ minWidth: 0 }}>
                <h2>Getting started</h2>
                <p>Your first order, step by step</p>
              </div>
              <button className="tut-x" onClick={() => t.setOpen(false)} aria-label="Close the tutorial"><X size={16} /></button>
            </header>

            <div className="tut-progress" aria-label={`${t.doneCount} of ${t.total} steps done`}>
              <div className="tut-progress-bar"><span style={{ width: `${t.total ? (t.doneCount / t.total) * 100 : 0}%` }} /></div>
              <span>{t.doneCount} of {t.total} done</span>
            </div>

            <div className="tut-body">
              {t.intro && !allDone && t.total > 0 && (
                <div className="tut-intro">
                  <b>Welcome to Maks Ops.</b> In about ten minutes you can make your first real order on your own screens:
                  a customer and a product, a quotation, the order, its invoice and the payment.
                  Each step opens the right screen and points at the button to press, and ticks itself off when it is done.
                  <div className="tut-intro-actions">
                    {t.next && <button className="btn-primary btn-sm" onClick={() => showMe(t.next)}><Play size={14} fill="currentColor" /> Start</button>}
                    <button className="btn-secondary" onClick={() => { t.setIntro(false); t.setOpen(false); }}>Look around first</button>
                  </div>
                  <small>You can come back to this any time: press <b>▶ Guide</b> at the top left.</small>
                </div>
              )}

              {allDone && (
                <div className="tut-intro is-done">
                  <PartyPopper size={18} style={{ color: '#16a34a' }} />
                  <b> You have run the whole flow.</b> Quote to cash, buying and your team: everything else in Maks Ops builds on these.
                </div>
              )}

              {CHAPTERS.map(ch => {
                const list = t.steps.filter(s => s.chapter === ch.key);
                if (!list.length) return null;
                return (
                  <div key={ch.key} className="tut-chapter">
                    <div className="tut-chapter-title">{ch.title}</div>
                    {list.map(s => {
                      const n = t.steps.indexOf(s) + 1;
                      const isNext = t.next?.key === s.key;
                      return (
                        <div key={s.key} className={`tut-step${s.isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}${t.active === s.key ? ' is-active' : ''}`}>
                          <span className="tut-dot" aria-hidden="true">{s.isDone ? <Check size={13} strokeWidth={3} /> : n}</span>
                          <div className="tut-step-text">
                            <div className="tut-step-title">{s.title}{s.isDone && <span className="sr-only"> (done)</span>}</div>
                            {!s.isDone && <div className="tut-step-line">{s.line}</div>}
                          </div>
                          {s.isDone
                            ? <button className="tut-link" onClick={() => { t.setOpen(false); navigate(s.path); }}>Open</button>
                            : <button className={isNext ? 'btn-primary btn-sm tut-go' : 'tut-link'} onClick={() => showMe(s)}>Show me</button>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {!t.ready && <p className="tut-muted">Checking what you have done so far…</p>}
              {t.ready && t.total === 0 && (
                <p className="tut-muted">Your role lets you look around and read. The people who run your company in Maks Ops make the changes; the film below shows the whole flow.</p>
              )}
            </div>

            <footer className="tut-foot">
              <a href="/see-maksops" target="_blank" rel="noreferrer"><Film size={14} /> Prefer to watch first? The 7-minute product film</a>
            </footer>
          </section>
        </>
      )}

      {/* The coach card: what to do on this screen, while a step is followed. */}
      {!t.open && step && (
        <aside className={`tut-coach${step.isDone ? ' is-done' : ''}`} aria-live="polite" aria-label="Tutorial step">
          {step.isDone ? (
            <>
              <div className="tut-coach-top"><Check size={14} strokeWidth={3} /> Done: {step.title}</div>
              {t.next
                ? <button className="btn-primary btn-sm" onClick={() => showMe(t.next)}>Next: {t.next.title} <ArrowRight size={14} /></button>
                : <button className="btn-primary btn-sm" onClick={() => { stop(); t.setOpen(true); }}>See what you have done <ArrowRight size={14} /></button>}
            </>
          ) : (
            <>
              <div className="tut-coach-top">Step {idx + 1} of {t.total} · {step.title}</div>
              <p>{step.how}</p>
              <div className="tut-coach-actions">
                {!pathname.startsWith(step.path)
                  ? <button className="btn-primary btn-sm" onClick={() => showMe(step)}>Take me there <ArrowRight size={14} /></button>
                  : step.target && <button className="tut-link" onClick={() => spotlight(step.target)}><MousePointerClick size={13} /> Point to it</button>}
                <button className="tut-link" onClick={() => t.setOpen(true)}><ListChecks size={13} /> All steps</button>
              </div>
            </>
          )}
          <button className="tut-x tut-coach-x" onClick={stop} aria-label="Stop the tutorial"><X size={14} /></button>
        </aside>
      )}
    </>
  );
}
