/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial: the panel of steps, the coach card that
   follows a person from screen to screen, and the pulse on the button they
   should press next. State in context/TutorialContext; steps in
   lib/tutorial.

   The panel opens from the ▶ at the top of the menu rail (and by itself on
   a first sign-in). "Show me" opens the step's screen, points at the button
   to press, and leaves a small card in the corner saying what to do; the
   card turns green when the step is done and offers the next one.

   It asks for about three minutes: the first sale. When that is done the
   card says so and offers to stop there; the rest waits in the panel.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, X, Check, ArrowRight, Film, MousePointerClick, ListChecks, PartyPopper } from 'lucide-react';
import { useTutorial } from '../context/TutorialContext';
import { CHAPTERS, CORE } from '../lib/tutorial';

const SPOT = 'tut-spot';
const clearSpot = () => document.querySelectorAll(`.${SPOT}`).forEach(el => el.classList.remove(SPOT));
/* When the pointed-at button was last pressed: the screen needs a moment to
   show the result before the pointer looks again, or it lands back on the
   same button (Receive GRN, before the list refreshes) and invites a second press. */
let pressedAt = 0;

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
  el.addEventListener('click', () => { pressedAt = Date.now(); clearSpot(); }, { once: true });
  return true;
}

export default function Tutorial() {
  const t = useTutorial();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const step = t?.steps.find(s => s.key === t.active) || null;

  /* Point at the button once the step's screen has drawn (it may still be
     loading: try a few times). */
  useEffect(() => {
    if (!step || step.isDone || !step.target || !pathname.startsWith(step.path)) { clearSpot(); return undefined; }
    const timers = [250, 900, 1800, 3200].map(ms => setTimeout(() => spotlight(step.target), ms));
    /* A step of several presses, or whose button shows only after a click:
       whenever nothing is pointed at, look again. */
    const poll = step.follow
      ? setInterval(() => {
          if (!document.querySelector(`.${SPOT}`) && Date.now() - pressedAt > 2500) spotlight(step.target);
        }, 1000)
      : null;
    return () => { timers.forEach(clearTimeout); if (poll) clearInterval(poll); };
  }, [step?.key, step?.isDone, pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearSpot(), []);

  /* Going to a step: its card appears once its screen has. (Set at once,
     a page still loading showed "Take me there" for a moment.) */
  const arriving = useRef(null);
  const setActive = t?.setActive;
  const go = (s) => {
    if (window.location.pathname.startsWith(s.href)) {
      setActive(s.key);
      setTimeout(() => spotlight(s.target), 200);
      return;
    }
    arriving.current = s;
    navigate(s.href);
    setTimeout(() => { if (arriving.current === s) { arriving.current = null; setActive(s.key); } }, 4000);
  };
  useEffect(() => {
    const s = arriving.current;
    if (s && pathname.startsWith(s.href)) { arriving.current = null; setActive(s.key); }
  }, [pathname, setActive]);

  /* In the first sale a ticked step moves on by itself after a moment:
     six small steps, and no Next to press between them. */
  const upNext = step?.isDone && CORE.has(step.chapter) && t?.next && CORE.has(t.next.chapter) ? t.next : null;
  useEffect(() => {
    if (!upNext) return undefined;
    const id = setTimeout(() => go(upNext), 1800);
    return () => clearTimeout(id);
  }, [upNext?.key, upNext?.href]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* The panel behaves like one: Escape closes it, and opening it puts the
     keyboard there; closing it returns to the Guide button. */
  const panelRef = useRef(null);
  const isOpen = !!t?.open;
  const setOpen = t?.setOpen;
  useEffect(() => {
    if (!isOpen) return undefined;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (document.activeElement === document.body || panel?.contains(document.activeElement)) {
        document.querySelector('.nav-rail-guide')?.focus();
      }
    };
  }, [isOpen, setOpen]);

  if (!t) return null;

  const showMe = (s) => {
    t.setIntro(false);
    t.setOpen(false);
    go(s);
  };
  const stop = () => { arriving.current = null; t.setActive(null); clearSpot(); };
  const allDone = t.ready && t.total > 0 && t.doneCount === t.total;
  /* Progress as the person sees it: the first sale until it is done, then everything. */
  const shown = t.coreComplete ? { done: t.doneCount, total: t.total } : t.core;
  /* "Step 2 of 6": counted within the step's own chapter. */
  const place = (s) => {
    const list = t.steps.filter(x => x.chapter === s.chapter);
    return { n: list.indexOf(s) + 1, of: list.length };
  };
  const justFinishedSale = step?.isDone && CORE.has(step.chapter) && t.coreComplete && t.hasSale;

  return (
    <>
      {t.open && (
        <>
          <div className="tut-backdrop" onClick={() => t.setOpen(false)} aria-hidden="true" />
          <section className="tut-panel" role="dialog" aria-modal="false" aria-label="Getting started" ref={panelRef} tabIndex={-1}>
            <header className="tut-head">
              <span className="tut-head-icon"><Play size={16} fill="currentColor" /></span>
              <div style={{ minWidth: 0 }}>
                <h2>Getting started</h2>
                <p>{t.hasSale ? 'Your first sale, in about 3 minutes' : 'Your part, step by step'}</p>
              </div>
              <button className="tut-x" onClick={() => t.setOpen(false)} aria-label="Close the tutorial"><X size={16} /></button>
            </header>

            {t.ready && shown.total > 0 && (
              <div className="tut-progress" aria-label={`${shown.done} of ${shown.total} steps done`}>
                <div className="tut-progress-bar"><span style={{ width: `${(shown.done / shown.total) * 100}%` }} /></div>
                <span>{shown.done} of {shown.total} done{!t.coreComplete && t.hasSale ? ' · first sale' : ''}</span>
              </div>
            )}

            <div className="tut-body">
              {t.ready && t.intro && !t.coreComplete && t.total > 0 && (
                <div className="tut-intro">
                  {t.hasSale
                    ? <><b>Welcome to Maks Ops.</b> Make your first sale in about 3 minutes: a customer, a product, a quotation, the order, its invoice and the payment.</>
                    : <><b>Welcome to Maks Ops.</b> Here is your part of it, a minute or two each.</>}
                  {' '}Each step opens the right screen, points at the button to press, and ticks itself off.
                  <div className="tut-intro-actions">
                    {t.next && <button className="btn-primary btn-sm" onClick={() => showMe(t.next)}><Play size={14} fill="currentColor" /> Start</button>}
                    <button className="btn-secondary" onClick={() => { t.setIntro(false); t.setOpen(false); }}>Look around first</button>
                  </div>
                  <small>You can come back to this any time: press <b>▶ Guide</b> at the top left.</small>
                </div>
              )}

              {t.ready && t.coreComplete && (t.intro ? (
                /* Someone joining a company that already runs: a map, not a to-do list. */
                <div className="tut-intro is-done">
                  <b>Welcome to Maks Ops.</b> Your company already runs the whole flow below, from quotation to payment and from purchase order to goods received.
                  Press <b>Open</b> on any step to see the screen where it happens.
                </div>
              ) : allDone ? (
                <div className="tut-intro is-done">
                  <PartyPopper size={18} style={{ color: '#16a34a' }} />
                  <b> Every step is done: the whole flow has run.</b> Quote to cash, buying and the team: everything else in Maks Ops builds on these. Open any step to go back to its screen.
                </div>
              ) : (
                <div className="tut-intro is-done">
                  <PartyPopper size={18} style={{ color: '#16a34a' }} />
                  <b> {t.hasSale ? 'Your first sale is done.' : 'Your first steps are done.'}</b> The rest is below, a minute or two each, whenever you need it.
                </div>
              ))}

              {t.ready && CHAPTERS.map(ch => {
                const list = t.steps.filter(s => s.chapter === ch.key);
                if (!list.length) return null;
                return (
                  <div key={ch.key} className="tut-chapter">
                    <div className="tut-chapter-title">{ch.title} <span className="tut-chapter-note">· {ch.note}</span></div>
                    {list.map((s, i) => {
                      const isNext = t.next?.key === s.key;
                      return (
                        <div key={s.key} className={`tut-step${s.isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}${t.active === s.key ? ' is-active' : ''}`}>
                          <span className="tut-dot" aria-hidden="true">{s.isDone ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
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
          {justFinishedSale ? (
            <>
              <div className="tut-coach-top"><PartyPopper size={14} /> Your first sale is done</div>
              <p>Customer, quotation, order, invoice and payment: that is the core of Maks Ops. Before a real invoice goes out, add your GSTIN and bank details.</p>
              <div className="tut-coach-actions">
                <button className="btn-primary btn-sm" onClick={stop}>Finish for now</button>
                {t.next && <button className="tut-link" onClick={() => showMe(t.next)}>Keep going: {t.next.title} <ArrowRight size={13} /></button>}
              </div>
            </>
          ) : step.isDone ? (
            <>
              <div className="tut-coach-top"><Check size={14} strokeWidth={3} /> Done: {step.title}</div>
              {t.next
                ? <button className="btn-primary btn-sm" onClick={() => showMe(t.next)}>Next: {t.next.title} <ArrowRight size={14} /></button>
                : <button className="btn-primary btn-sm" onClick={() => { stop(); t.setOpen(true); }}>See what you have done <ArrowRight size={14} /></button>}
              {upNext && <p className="tut-muted" style={{ margin: '6px 0 0' }}>Moving on in a moment…</p>}
            </>
          ) : (
            <>
              <div className="tut-coach-top">
                {CORE.has(step.chapter) ? 'Step' : 'When you are ready ·'} {place(step).n} of {place(step).of} · {step.title}
              </div>
              <p>{step.how}</p>
              <div className="tut-coach-actions">
                {!pathname.startsWith(step.href)
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
