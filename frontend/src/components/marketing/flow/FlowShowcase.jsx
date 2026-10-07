import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pause, Send, FileText, Volume2, VolumeX } from 'lucide-react';
import useInView from '../../../hooks/useInView';
import { Morph, Pill, Cursor } from './kit';
import { SCENES, CHAIN, CATALOGUE_URL, CLOSING_VOICE } from './story';
import useNarrator, { sayingTime, usePageShown } from './voice';
import './flow.css';

/* ══════════════════════════════════════════════════════════════════════
   FlowShowcase — Maks Ops, operating, for about a minute.

   Not a video. There is no player, no scrubber and nothing to press to
   start it. The stage cards are the controller; below them a window holds
   the product, rebuilt from real-looking components, and the product does
   the work: a customer's enquiry arrives from the catalogue and is carried
   — as one record — through quotation, order, purchase, receipt,
   production and invoice.

   How it runs
   ─────────────────────────────────────────────────────────────────────
   One clock. `elapsed` advances on requestAnimationFrame while the section
   is on screen and nobody has paused it, and is committed to React about
   twenty times a second. Each scene renders as a pure function of that
   time (see kit.jsx), so:

     · selecting a card sets the scene and puts the clock at 0
     · hovering a card or the window lets the CURRENT scene finish and then
       HOLDS — it pauses the automatic transition, not the story mid-word
     · keyboard focus inside the section pauses the clock outright
     · under prefers-reduced-motion nothing advances on its own; every
       scene is drawn at its finished state and the cards switch between
       them

   Between scenes the new record's number lifts off the button that created
   it and travels up to the next card — the document physically moving to
   the next stage — before that card takes over.

   Accessibility
   ─────────────────────────────────────────────────────────────────────
   Moving content that starts by itself and runs longer than five seconds
   must be pausable (WCAG 2.2.2). So the window's status chip — "Live
   product walkthrough" — is a real toggle. It is not a play button: the
   walkthrough never waits for it. The simulated application is aria-hidden
   and its controls unfocusable, because a screen reader tabbing into fake
   buttons is worse than useless; a live region states what each scene
   shows instead.

   Voice-over
   ─────────────────────────────────────────────────────────────────────
   Off until asked for — sound that starts by itself is the one thing a
   visitor cannot forgive. The button on the window's top edge turns it on,
   and from then each stage is narrated as it plays:

     · turning it on starts the current stage again, so the words and the
       picture begin together
     · a stage does not hand over until its line has been said; the story
       waits for the voice, never the other way round
     · choosing a card cuts the line short and starts that stage's
     · pausing, scrolling away, keyboard focus or a background tab silence
       it; coming back starts the stage again, with its line
     · the line being spoken is captioned under the window
   ══════════════════════════════════════════════════════════════════════ */

const HANDOFF_MS = 640;     // the record's flight to the next card
const CLOSING_MS = 4200;    // "one enquiry, one connected operation"
const COMMIT_MS = 50;       // how often the clock renders

const usePrefersReducedMotion = () => {
  const q = '(prefers-reduced-motion: reduce)';
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
};

/* The handwritten notes in the margin come from a script face. Loaded only
   here, and only the glyphs the two notes use (Google Fonts' `text=`
   subset), so it costs a few kilobytes on the marketing page and nothing in
   the application. Missing glyphs would fall back to the next font in the
   stack, so changing the notes cannot break them — only make them plainer. */
const NOTE_A = 'A customer asks for a part…';
const NOTE_B = '…and you get paid.';
const useScriptFont = (enabled) => {
  useEffect(() => {
    if (!enabled || document.getElementById('mk-script-font')) return;
    const l = document.createElement('link');
    l.id = 'mk-script-font';
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap&text=${encodeURIComponent(NOTE_A + NOTE_B)}`;
    document.head.appendChild(l);
  }, [enabled]);
};

export default function FlowShowcase({ notes = true }) {
  const reduced = usePrefersReducedMotion();
  const [rootRef, , visible] = useInView(0.12);
  const n = SCENES.length;

  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [phase, setPhase] = useState('play');        // play | handoff | closing
  const [userPaused, setUserPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [kbFocus, setKbFocus] = useState(false);
  const [prev, setPrev] = useState(null);            // the scene leaving, for the cross-fade
  const [take, setTake] = useState(0);               // bumped each time a stage is (re)started by hand
  const [voiceOn, setVoiceOn] = useState(false);
  const [caption, setCaption] = useState('');
  const narrator = useNarrator();
  const pageShown = usePageShown();

  const scene = SCENES[idx];
  const closing = phase === 'closing';
  const shownT = reduced ? scene.duration : t;
  const mode = scene.mode ? scene.mode(shownT) : 'app';

  useScriptFont(notes);

  /* refs the animation loop reads, so it never has to restart */
  const S = useRef({ idx: 0, phase: 'play', elapsed: 0, sub: 0, running: false, hold: false, last: null, lastCommit: 0, lastT: -1, speaking: false, speakUntil: 0 });
  const running = visible && !userPaused && !kbFocus && !reduced;
  S.current.running = running;
  S.current.hold = hold;
  /* when the voice may be heard. Under reduced motion nothing plays by
     itself, so the voice reads whichever stage is chosen. */
  const voiceLive = voiceOn && visible && pageShown && (reduced || (!userPaused && !kbFocus));

  const cardRefs = useRef([]);
  const stripRef = useRef(null);
  const actionRef = useRef(null);
  const flightRef = useRef(null);

  const goTo = useCallback((i, { fromUser = false } = {}) => {
    const s = S.current;
    if (i !== s.idx) setPrev({ idx: s.idx, at: Date.now() });
    s.idx = i; s.phase = 'play'; s.elapsed = 0; s.sub = 0; s.lastT = 0;
    setIdx(i); setPhase('play'); setT(0); setTake((k) => k + 1);
    if (fromUser) setUserPaused(false);
  }, []);

  /* the record lifts off the button that created it and lands on the next
     card. Transform and opacity only, via the Web Animations API, so it runs
     on the compositor. Skipped when the target card is scrolled out of the
     strip (narrow screens) rather than flying somewhere off-screen. */
  const fly = useCallback((toIdx) => {
    const root = rootRef.current, chip = flightRef.current;
    const from = actionRef.current, to = cardRefs.current[toIdx];
    if (!root || !chip || !from || !to || !chip.animate) return;
    const strip = stripRef.current;
    if (strip) {
      const sr = strip.getBoundingClientRect(), tr = to.getBoundingClientRect();
      if (tr.left < sr.left - 4 || tr.right > sr.right + 4) return;
    }
    chip.querySelector('[data-id]').textContent = SCENES[toIdx].id;
    const r = root.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const w = chip.offsetWidth, h = chip.offsetHeight;
    const x0 = a.left - r.left + a.width / 2 - w / 2, y0 = a.top - r.top + a.height / 2 - h / 2;
    const x1 = b.left - r.left + b.width / 2 - w / 2, y1 = b.top - r.top + b.height / 2 - h / 2;
    /* a gentle arc: sample a quadratic curve rather than two straight legs */
    const cx = (x0 + x1) / 2 + (x1 - x0) * 0.15, cy = Math.min(y0, y1) - 60;
    const frames = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, iu = 1 - u;
      const x = iu * iu * x0 + 2 * iu * u * cx + u * u * x1;
      const y = iu * iu * y0 + 2 * iu * u * cy + u * u * y1;
      frames.push({
        transform: `translate(${x}px, ${y}px) scale(${1 - 0.22 * u})`,
        opacity: i === 0 ? 0 : i >= 9 ? 0.15 : 1,
        offset: u,
      });
    }
    chip.animate(frames, { duration: HANDOFF_MS + 80, easing: 'cubic-bezier(.65,0,.35,1)' });
  }, [rootRef]);

  /* ── the clock ── */
  useEffect(() => {
    if (reduced) return undefined;
    let raf;
    const loop = (now) => {
      const s = S.current;
      if (s.last == null) s.last = now;
      /* test hook: the marketing tests run the story fast, or hold it at 0
         until they are ready to watch */
      const v = typeof window !== 'undefined' ? window.__MK_FLOW_SPEED__ : undefined;
      const speed = typeof v === 'number' && v >= 0 ? v : 1;
      /* clamp: a background tab that wakes after a minute should resume, not
         skip three scenes in one frame */
      const dt = Math.min(now - s.last, 100) * speed;
      s.last = now;

      /* a line still being said holds the hand-off, as hovering does —
         up to a ceiling, in case a browser never reports the end */
      const talking = s.speaking && now < s.speakUntil;

      if (s.running) {
        const sc = SCENES[s.idx];
        if (s.phase === 'play') {
          s.elapsed = Math.min(sc.duration, s.elapsed + dt);
          if (s.elapsed >= sc.duration && !s.hold && !talking) {
            if (s.idx < SCENES.length - 1) {
              s.phase = 'handoff'; s.sub = 0; setPhase('handoff'); fly(s.idx + 1);
            } else {
              s.phase = 'closing'; s.sub = 0; setPhase('closing');
            }
          }
        } else if (s.phase === 'handoff') {
          s.sub += dt;
          if (s.sub >= HANDOFF_MS) {
            const next = s.idx + 1;
            setPrev({ idx: s.idx, at: Date.now() });
            s.idx = next; s.phase = 'play'; s.elapsed = 0; s.sub = 0;
            setIdx(next); setPhase('play');
          }
        } else if (s.phase === 'closing') {
          s.sub += dt;
          if (s.sub >= CLOSING_MS && !s.hold && !talking) {
            setPrev({ idx: s.idx, at: Date.now() });
            s.idx = 0; s.phase = 'play'; s.elapsed = 0; s.sub = 0;
            setIdx(0); setPhase('play');
          }
        }
      }
      if (now - s.lastCommit >= COMMIT_MS && s.elapsed !== s.lastT) {
        s.lastCommit = now; s.lastT = s.elapsed; setT(s.elapsed);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, fly]);

  /* the outgoing scene stays for the length of its exit, then goes */
  useEffect(() => {
    if (!prev) return undefined;
    const h = setTimeout(() => setPrev(null), 440);
    return () => clearTimeout(h);
  }, [prev]);

  /* ── the voice ──
     Runs when the voice comes on or goes quiet, when the stage changes
     (by itself or by a card) and when the closing card arrives. A
     hand-off between stages is not a change it hears: that is one stage
     ending, and the next stage's arrival speaks for itself. */
  useEffect(() => {
    const s = S.current;
    if (!voiceLive) {
      s.speaking = false;
      narrator.stop();
      return;
    }
    if (!reduced) {
      /* the words and the picture begin together */
      if (s.phase === 'closing') s.sub = 0;
      else if (s.phase !== 'play' || s.elapsed > 0) {
        s.phase = 'play'; s.elapsed = 0; s.sub = 0; s.lastT = 0;
        setPhase('play'); setT(0);
      }
    }
    const line = s.phase === 'closing' ? CLOSING_VOICE : SCENES[s.idx].voice;
    s.speaking = true;
    s.speakUntil = performance.now() + sayingTime(line);
    narrator.say(line, { onLine: setCaption, onDone: () => { s.speaking = false; } });
  }, [voiceLive, idx, closing, take, reduced, narrator]);

  const toggleVoice = () => {
    if (voiceOn) { setVoiceOn(false); return; }
    narrator.unlock();
    setVoiceOn(true);
    setUserPaused(false);   // asking to hear it is asking to see it
  };

  /* narrow screens: keep the active card centred in its strip — by scrolling
     the strip, never the page */
  useEffect(() => {
    const strip = stripRef.current, card = cardRefs.current[idx];
    if (!strip || !card || strip.scrollWidth <= strip.clientWidth + 2) return;
    strip.scrollTo({ left: card.offsetLeft - (strip.clientWidth - card.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
  }, [idx, reduced]);

  /* keyboard focus pauses; a mouse click does not (or choosing a card would
     stop the very scene it asked for). Nor does the voice button: a
     keyboard user who turns the voice on wants to hear it play. */
  const onFocus = (e) => {
    if (e.target.matches?.(':focus-visible')) setKbFocus(!e.target.closest?.('.fl-voice'));
  };
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKbFocus(false); };

  const stateOf = (i) => {
    if (phase === 'closing') return 'done';
    if (i < idx) return 'done';
    if (i === idx) return 'active';
    return 'next';
  };
  const linkFill = (i) => {
    if (i < idx || phase === 'closing') return 1;
    if (i > idx) return 0;
    return phase === 'handoff' ? 1 : Math.min(1, shownT / scene.duration);
  };

  const [statusLabel, statusTone] = scene.status(shownT);
  const action = [...scene.actions].reverse().find((a) => shownT >= a.from) || scene.actions[0];
  const pressed = shownT >= action.click && shownT < action.click + 220;
  const trail = CHAIN.slice(0, closing ? n : idx + 1);
  const Body = scene.Body;
  const DocView = scene.Doc;
  const prevScene = prev ? SCENES[prev.idx] : null;

  return (
    <div
      ref={rootRef}
      className={`fl-root${visible ? '' : ' is-offscreen'}${reduced ? ' is-reduced' : ''}`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* ── the margin notes ── */}
      {notes && (
        <>
          <div className="fl-note fl-note-a" aria-hidden="true">
            <span>{NOTE_A}</span>
            <svg viewBox="0 0 90 80" width="90" height="80">
              <path className="fl-draw" pathLength="1" d="M10 6 C 34 14, 54 30, 64 66" />
              <path className="fl-draw" pathLength="1" d="M55 57 L 64 68 L 71 55" />
            </svg>
          </div>
          <div className="fl-note fl-note-b" aria-hidden="true">
            <span className={`fl-plane${closing ? ' is-sent' : ''}`}><Send size={18} /></span>
            <svg viewBox="0 0 150 90" width="150" height="90">
              <path className="fl-draw" pathLength="1" d="M8 82 C 40 76, 90 60, 128 18" />
              <path className="fl-draw" pathLength="1" d="M114 20 L 129 16 L 126 31" />
            </svg>
            <span>{NOTE_B}</span>
          </div>
        </>
      )}

      {/* ── the stages: the controller ── */}
      <div
        className="fl-strip"
        ref={stripRef}
        role="list"
        aria-label="Seven stages of one order"
        onMouseEnter={() => setHold(true)}
        onMouseLeave={() => setHold(false)}
      >
        {SCENES.map((s, i) => {
          const st = stateOf(i);
          return (
            <React.Fragment key={s.key}>
              <div role="listitem" className="fl-strip-item">
                <button
                  type="button"
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className={`fl-card is-${st}`}
                  aria-current={st === 'active' ? 'step' : undefined}
                  aria-label={`Stage ${i + 1}, ${s.title}: ${s.sub}${st === 'done' ? ', done' : st === 'active' ? ', showing now' : ''}`}
                  onClick={() => goTo(i, { fromUser: true })}
                >
                  <span className="fl-card-glow" aria-hidden="true" />
                  <span className="fl-card-n">{s.n}</span>
                  <span className="fl-card-icon">
                    <s.Icon size={19} />
                    {st === 'active' && !reduced && <i className="fl-card-ping" />}
                  </span>
                  <span className="fl-card-title">{s.title}</span>
                  <span className="fl-card-sub">{s.sub}</span>
                  <span className={`fl-card-state is-${st}`}>
                    {st === 'done' ? <><Check size={10} strokeWidth={3} /> Done</> : st === 'active' ? <><i /> In progress</> : 'Upcoming'}
                  </span>
                </button>
              </div>
              {i < n - 1 && (
                <span className={`fl-link${i < idx || closing ? ' is-done' : ''}`} aria-hidden="true">
                  <span className="fl-link-fill" style={{ transform: `scaleX(${linkFill(i)})` }} />
                  <span className="fl-link-head">›</span>
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── the product ── */}
      <div className="fl-stage">
        <button
          type="button"
          className={`fl-voice${voiceOn ? ' is-on' : ''}${voiceLive ? ' is-live' : ''}`}
          aria-pressed={voiceOn}
          aria-label={narrator.supported ? 'Voice-over' : 'Captions'}
          onClick={toggleVoice}
        >
          {voiceOn
            ? <span className="fl-eq" aria-hidden="true"><i /><i /><i /><i /></span>
            : <VolumeX size={14} aria-hidden="true" />}
          {narrator.supported ? 'Voice-over' : 'Captions'}
          <b aria-hidden="true">{voiceOn ? 'On' : 'Off'}</b>
        </button>

        <div
          className="fl-window"
          onMouseEnter={() => setHold(true)}
          onMouseLeave={() => setHold(false)}
        >
          <div className="fl-titlebar">
            <span className="fl-lights" aria-hidden="true"><i /><i /><i /></span>
            <div className="fl-trail" aria-hidden="true">
              {mode === 'customer' ? (
                <span className="fl-url">
                  <span className="fl-url-who">Customer’s view</span>
                  {CATALOGUE_URL}{shownT >= 1300 ? '/ss304-mounting-bracket' : ''}
                </span>
              ) : (
                <span className="fl-chain">
                  {trail.map((id, i) => (
                    <span key={id} className={`fl-chain-id${i === trail.length - 1 ? ' is-head' : ''}`}>
                      {i > 0 && <em>›</em>}{id}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <span className="fl-sample" aria-hidden="true">Sample data</span>
            {!reduced && (
              <button
                type="button"
                className={`fl-live${userPaused ? ' is-paused' : ''}`}
                aria-pressed={userPaused}
                aria-label={userPaused ? 'Resume the product walkthrough' : 'Pause the product walkthrough'}
                onClick={() => setUserPaused((p) => !p)}
              >
                {userPaused ? <><Pause size={11} /> Paused</> : <><i /> Live product walkthrough</>}
              </button>
            )}
          </div>

          <div className={`fl-app is-${mode}`} aria-hidden="true">
            {/* the customer's own screen, for the first scene */}
            {mode === 'customer' && scene.Customer && (
              <div className="fl-cust-wrap fl-enter"><scene.Customer t={shownT} /></div>
            )}

            {mode === 'app' && (
              <div className="fl-shell fl-enter-soft">
                <aside className="fl-side">
                  <span className="fl-side-hl" style={{ transform: `translateY(${idx * 36}px)` }} />
                  {SCENES.map((s, i) => (
                    <span key={s.key} className={`fl-side-item is-${stateOf(i)}`} onClick={() => goTo(i, { fromUser: true })}>
                      <s.Icon size={15} />
                      {s.title}
                      {i === 0 && idx === 0 && shownT < 6500 && <b className="fl-side-badge">1</b>}
                      {stateOf(i) === 'done' && <Check size={12} strokeWidth={3} className="fl-side-check" />}
                    </span>
                  ))}
                </aside>

                <section className="fl-main">
                  <header className="fl-head">
                    <span className="fl-head-icon"><Morph k={scene.key}><scene.Icon size={17} /></Morph></span>
                    <h4><Morph k={scene.key}>{scene.title}</Morph></h4>
                    <span className="fl-id"><Morph k={scene.id}>{scene.id}</Morph></span>
                    <span className="fl-status">
                      <Morph k={statusLabel}><Pill tone={statusTone} dot>{statusLabel}</Pill></Morph>
                    </span>
                  </header>
                  <p className="fl-desc"><Morph k={scene.key}>{scene.desc}</Morph></p>

                  <div className="fl-body">
                    {prevScene && prevScene.key !== scene.key && (
                      <div className="fl-pane is-out" key={`out-${prevScene.key}`}>
                        <prevScene.Body t={prevScene.duration} />
                      </div>
                    )}
                    <div className="fl-pane is-in" key={`in-${scene.key}`}>
                      <Body t={shownT} />
                    </div>
                  </div>

                  <div className="fl-actions">
                    <span className="fl-cursor-host is-inline" ref={actionRef}>
                      <button type="button" tabIndex={-1} className={`fl-btn primary${pressed ? ' is-pressed' : ''}`}>
                        <Morph k={action.label}>{action.label}</Morph> <span aria-hidden="true">→</span>
                      </button>
                      {!reduced && <Cursor on={shownT >= action.cursor && shownT < action.click + 650} click={pressed} />}
                    </span>
                    <button type="button" tabIndex={-1} className="fl-btn">{scene.secondary}</button>
                    <button type="button" tabIndex={-1} className="fl-btn is-icon">···</button>
                  </div>
                </section>

                <section className="fl-docpane">
                  <div className="fl-docpane-h">
                    <FileText size={13} /> Document
                    <span className="fl-view">View</span>
                  </div>
                  <div className="fl-docpane-body">
                    {prevScene && prevScene.key !== scene.key && (
                      <div className="fl-pane is-out" key={`dout-${prevScene.key}`}>
                        <prevScene.Doc t={prevScene.duration} />
                      </div>
                    )}
                    <div className="fl-pane is-in" key={`din-${scene.key}`}>
                      <DocView t={shownT} />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* the closing card: the whole transaction, as the records it made */}
            {closing && (
              <div className="fl-closing">
                <b>One enquiry. One connected operation.</b>
                <span className="fl-closing-chain">
                  {CHAIN.map((id, i) => (
                    <span key={id} className="fl-unit">
                      {i > 0 && <em className="fl-sep" style={{ animationDelay: `${i * 110}ms` }}>›</em>}
                      <span className="fl-chip" style={{ animationDelay: `${i * 110}ms` }}>{id}</span>
                    </span>
                  ))}
                </span>
                <small>Seven documents · one record · nothing retyped</small>
              </div>
            )}
          </div>

          {/* what a screen reader is told instead of watching */}
          <p className="fl-sr" aria-live="polite">{closing ? 'One enquiry became seven linked documents.' : scene.sr}</p>
        </div>

        {/* the line being spoken. Hidden from screen readers, which already
            have the live region above and would read every line twice. */}
        {voiceOn && (
          <p className="fl-caption" aria-hidden="true">
            <Volume2 size={14} />
            <span key={caption} className="fl-caption-line">{voiceLive ? caption : 'Voice-over paused'}</span>
          </p>
        )}
      </div>

      {/* the record in flight between stages */}
      <span className="fl-flight" ref={flightRef} aria-hidden="true">
        <FileText size={12} /><span data-id />
      </span>
    </div>
  );
}
