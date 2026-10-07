import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Play, Volume2, Captions } from 'lucide-react';
import useInView from '../../../hooks/useInView';
import useNarrator from '../flow/voice';
import { useStoryClock, useStoryVoice, useReducedMotion, usePageShown } from '../flow/engine';
import { beatsOf, beatIndexAt, totalMs } from '../flow/engine/timeline';
import { CHAPTERS, LAST_N, chapterIndex } from './chapters';
import { SCENES } from './scenes';
import Stage from './shell/Stage';
import { useStageLayout } from './shell/layout';
import AppShell from './shell/AppShell';
import PublicWindow from './shell/PublicWindow';
import TitleCard from './shell/TitleCard';
import { MoMark } from './shell/marks';
import { canFor, canStoreKeeper } from './data/roleViews';
import Controls, { Timeline } from './controls/Controls';
import '../flow/flow.css';
import './film.css';

/* what the voice will say in chapter i and the one after it */
const linesNear = (i) => CHAPTERS.slice(i, i + 2).flatMap((c) => beatsOf(c).map((b) => b.voice).filter(Boolean));

/* ══════════════════════════════════════════════════════════════════════
   The product film — Maks Ops, the whole of it, in chapters.

   The same engine as the homepage walkthrough (flow/engine): one clock,
   chapters drawn as pure functions of time, the voice-over holding the
   picture at the end of each beat until its line is said. What differs:

     · it waits to be started — a seven-minute film does not begin by
       itself; the poster offers it with the voice or without
     · it has a player's controls, and a timeline of its chapters
     · it stops at the end instead of looping
     · each chapter has a link (/see-maksops#customer) and the address
       follows the film as it plays
     · ?mode=film draws only the stage, letterboxed, for screen-recording
       an MP4 of exactly what the page shows

   The stage is a picture: hidden from assistive technology, nothing in it
   focusable. The controls are how the film is operated, and a live region
   says what each chapter shows.
   ══════════════════════════════════════════════════════════════════════ */

const HANDOFF_MS = 1200;           // the next chapter's title card
const RUNTIME = totalMs(CHAPTERS, HANDOFF_MS);

const fromAddress = () => {
  if (typeof window === 'undefined') return { idx: 0, voice: null };
  const q = new URLSearchParams(window.location.search);
  const key = window.location.hash.slice(1) || q.get('from') || '';
  const i = chapterIndex(key);
  return { idx: i >= 0 ? i : 0, voice: q.get('voice') };
};

export default function ProductFilm({ mode = 'page' }) {
  const film = mode === 'film';
  const reduced = useReducedMotion();
  const [rootRef, , visible] = useInView(0.25);
  const pageShown = usePageShown();
  const boxRef = useRef(null);
  const playerRef = useRef(null);
  const layout = useStageLayout(boxRef, { force: film ? 'wide' : undefined });

  const [entry] = useState(fromAddress);
  const [started, setStarted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [cc, setCc] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [full, setFull] = useState(false);
  const narrator = useNarrator();

  /* on screen and in a visible tab — film mode is always "on screen": it
     is being recorded, not read */
  const onScreen = film || (visible && pageShown);
  const running = started && !userPaused && onScreen;
  const clock = useStoryClock(CHAPTERS, {
    running, reduced, handoffMs: HANDOFF_MS, closingMs: null, atEnd: 'stop',
    speedKey: '__MK_FILM_SPEED__', initial: { idx: entry.idx, t: 0 },
  });
  const { idx, phase, shownT, beatIdx, goTo } = clock;
  const voiceLive = voiceOn && started && onScreen && (reduced || !userPaused);
  const { caption } = useStoryVoice(clock, { scenes: CHAPTERS, live: voiceLive, narrator, reduced, closingLine: null });

  /* the voice fetches this chapter's clips and the next one's, as it goes */
  useEffect(() => { if (voiceOn) narrator.prefetch(linesNear(idx)); }, [voiceOn, idx, narrator]);

  const ch = CHAPTERS[idx];
  const beats = beatsOf(ch);
  /* before it starts, the poster shows a finished frame of the chapter
     (its `poster` time) rather than the empty first instant */
  const viewT = started ? shownT : (ch.poster ?? ch.duration);
  const beat = (started ? beats[beatIdx] : beats[beatIndexAt(ch, viewT)]) || beats[0];
  const ended = phase === 'ended';
  const playing = started && !userPaused && !ended && !reduced;

  /* ── starting, and the controls ── */
  const start = useCallback((withVoice) => {
    if (withVoice) narrator.unlock(linesNear(idx));
    setVoiceOn(!!withVoice);
    setStarted(true);
    setUserPaused(false);
  }, [narrator, idx]);

  const jump = useCallback((i) => {
    goTo(Math.max(0, Math.min(CHAPTERS.length - 1, i)));
    setMenuOpen(false);
    setUserPaused(false);
    if (!started) setStarted(true);
  }, [goTo, started]);

  const togglePlay = () => {
    if (!started) { start(voiceOn); return; }
    if (ended) { jump(0); return; }
    setUserPaused((p) => !p);
  };
  const toggleVoice = () => {
    if (!voiceOn) narrator.unlock(linesNear(idx));
    setVoiceOn((v) => !v);
    if (!started) setStarted(true);
  };
  const toggleFull = () => {
    const el = playerRef.current;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFull((f) => !f));
    else setFull((f) => !f);       // iPhone: no element fullscreen — fill the window instead
  };
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  /* shortcuts, only while focus is inside the player (WCAG 2.1.4) */
  const onKeyDown = (e) => {
    if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { if (e.target.tagName === 'BUTTON' && k === ' ') return; e.preventDefault(); togglePlay(); }
    else if (k === 'arrowleft') { e.preventDefault(); jump(idx - 1); }
    else if (k === 'arrowright') { e.preventDefault(); jump(idx + 1); }
    else if (k === 'm') toggleVoice();
    else if (k === 'c') setCc((c) => !c);
    else if (k === 'f') toggleFull();
  };

  /* ── the address follows the film; a #chapter link moves it ── */
  useEffect(() => {
    if (film || !started) return;
    const want = `#${CHAPTERS[idx].key}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [idx, started, film]);
  useEffect(() => {
    const onHash = () => {
      const i = chapterIndex(window.location.hash.slice(1));
      if (i < 0) return;
      jump(i);
      playerRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [jump, reduced]);

  /* film mode starts on a click (sound needs one), with the voice unless
     ?voice=0 */
  const filmVoice = entry.voice !== '0';

  /* a handle for the tests and for recording: where the film is, and a way
     to put it anywhere */
  const live = useRef({});
  useLayoutEffect(() => { live.current = { idx, phase, t: shownT, beat: beat.key, started, voiceOn, cc }; });
  useEffect(() => {
    window.__MK_FILM__ = {
      chapters: CHAPTERS.map((c) => c.key),
      state: () => ({ ...live.current, key: CHAPTERS[live.current.idx]?.key }),
      seek: (key, t = 0) => { const i = chapterIndex(key); if (i >= 0) goTo(i, { t }); },
    };
    return () => { delete window.__MK_FILM__; };
  }, [goTo]);

  /* ── what the stage shows ── */
  const surface = phase === 'handoff' ? 'card' : ended ? 'end' : (beat.surface || ch.surface || 'title');
  const Scene = SCENES[ch.key]?.default;
  const scene = Scene ? (
    <Scene t={viewT} beat={beat} beatT={viewT - (beat.at || 0)} layout={layout} reduced={reduced} />
  ) : null;
  let picture;
  if (surface === 'card') picture = <TitleCard chapter={CHAPTERS[Math.min(idx + 1, CHAPTERS.length - 1)]} last={LAST_N} />;
  else if (surface === 'end') picture = (
    <div className="fm-endcard">
      <MoMark size={84} />
      <b>That was Maks Ops.</b>
      <span>One enquiry, carried from your catalogue to a paid invoice.</span>
    </div>
  );
  else if (surface === 'app') {
    const role = beat.role || ch.role || 'Owner';
    picture = (
      <AppShell path={beat.path || ch.path || '/dashboard'} role={role}
        can={role === 'Store Keeper' ? canStoreKeeper : canFor(role)}
        badges={beat.badges || ch.badges || {}} layout={layout}>{scene}</AppShell>
    );
  }
  else if (surface === 'public') picture = <PublicWindow path={beat.path || ch.path || '/'}>{scene}</PublicWindow>;
  else if (surface === 'bare') picture = <div className="fm-baresurface">{scene}</div>;
  else picture = <div className="fm-titlesurface">{scene}</div>;

  const line = voiceLive ? caption : (cc && started && !ended && phase === 'play' ? beat.voice : '');
  const showCaption = cc && started && !!line;

  return (
    <div ref={rootRef} className={`fl-root fm-film is-${mode}${full ? ' is-pseudo-full' : ''}${started ? ' is-started' : ''}`}>
      <div ref={playerRef} className="fm-player" onKeyDown={onKeyDown}>
        <div ref={boxRef} className="fm-stagebox">
          <Stage layout={layout} fit={film || full ? 'contain' : 'width'}>
            <div className="fm-frame" aria-hidden="true" data-chapter={ch.key} data-beat={beat.key} data-surface={surface}>
              <div key={`${ch.key}:${surface}`} className="fm-surface fl-enter-soft">{picture}</div>
              {film && showCaption && <p className="fm-caption-in">{line}</p>}
            </div>
          </Stage>

          {!started && (
            <div className="fm-poster">
              {film ? (
                <button type="button" className="fm-poster-go" onClick={() => start(filmVoice)}>
                  <Play size={22} /> Click to start
                </button>
              ) : (
                <>
                  <span className="fm-poster-kicker">{CHAPTERS.length} chapters · {Math.round(RUNTIME / 60000)} min · sample data</span>
                  <div className="fm-poster-btns">
                    <button type="button" className="fm-poster-go" onClick={() => start(true)}>
                      <Volume2 size={18} /> Play with voice-over
                    </button>
                    <button type="button" className="fm-poster-alt" onClick={() => start(false)}>
                      <Captions size={16} /> Play muted, with captions
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {!film && (
          <>
            <p className={`fm-caption${showCaption ? '' : ' is-empty'}`} aria-hidden="true">{showCaption ? line : ' '}</p>
            <Controls
              chapters={CHAPTERS} idx={idx} lastN={LAST_N} playing={playing} ended={ended}
              voiceOn={voiceOn} cc={cc} full={full} menuOpen={menuOpen}
              onPlay={togglePlay} onPrev={() => jump(idx - 1)} onNext={() => jump(idx + 1)}
              onRestart={() => jump(idx)} onVoice={toggleVoice} onCc={() => setCc((c) => !c)}
              onFull={toggleFull} onMenu={() => setMenuOpen((o) => !o)} onJump={jump}
              onMenuClose={() => setMenuOpen(false)}
            />
            <Timeline chapters={CHAPTERS} idx={idx} t={shownT} phase={phase} onJump={jump} />
          </>
        )}
      </div>

      {/* what a screen reader is told instead of watching */}
      <p className="fl-sr" aria-live="polite">
        {started ? (ended ? 'The film has ended.' : `Chapter ${ch.n}, ${ch.title}. ${ch.sr}`) : ''}
      </p>
    </div>
  );
}
