import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, RotateCcw, Volume2, VolumeX, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import useInView from '../../../hooks/useInView';
import { useStoryClock, useReducedMotion, usePageShown } from '../flow/engine';
import Stage from '../film/shell/Stage';
import { useStageLayout } from '../film/shell/layout';
import { AD_MS, ACTS, SCENES, actAt, sceneAt } from './script';
import { box, CTA_AT, CTA_FROM } from './geo';
import { AD_SEEK, AD_SCENE, AD_SOUND } from './util';
import { soundOn, soundOff, useAdSound, supportsSound } from './sound';
import { VIEWS } from './acts';
import '../film/film.css';
import './ad.css';

/* ══════════════════════════════════════════════════════════════════════
   The homepage ad: Maks Ops in a minute and a half.

   Not a video file. It is drawn live from the same pieces as the app —
   its role permissions, its screens' labels, the walkthrough's one
   transaction — so it is sharp at any size, weighs a few kilobytes, and
   cannot drift from the product without a check failing (script.js
   `TRUTH`, check-film.mjs).

   How it runs
     · One clock (the story engine shared with the walkthrough and the
       product film) counts 0 → 92 s. Everything on screen is a function
       of that one number: the acts (script.js ACTS) draw themselves at
       their own time, and the captions read the scenes (SCENES).
     · It is a 16:9 film at every width — on a phone it plays like a
       video across the screen, its headlines sized to stay readable.
     · It starts by itself the first time most of it is in view, pauses
       when scrolled away or the tab is hidden, and stops on its last
       frame. Pause / Sound / Replay are the only controls.
     · Moving from one act to the next, the old one fades out on top of
       the new one, so a record drawn in the same place by both — the
       order, CO-0012, from the quotation to the buying — simply stays.
     · Reduced motion: the clock still walks the scenes, but each scene is
       shown finished (its `still`), with plain fades between them.
     · Sound is off until asked for (sound.js), and nothing depends on it.
   ══════════════════════════════════════════════════════════════════════ */

const STORY = [{ key: 'ad', duration: AD_MS }];
const FADE_MS = 600;

/* A caption line, its words rising one after another; `accent` in orange. */
function Caption({ line, state }) {
  const words = line.text.split(' ');
  const accent = line.accent ? line.accent.split(' ') : [];
  const from = accent.length ? words.findIndex((w, i) => accent.every((a, k) => words[i + k] === a)) : -1;
  return (
    <p className={`reel-cap is-${state}`}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          <span className={`reel-cap-w${from >= 0 && i >= from && i < from + accent.length ? ' is-accent' : ''}`}
            style={{ '--i': i }}>{w}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

/* a touch screen taller than it is wide — a phone held upright. Touch
   only: a tall desktop monitor is not a phone to be turned sideways. */
function usePortrait() {
  const query = '(orientation: portrait) and (pointer: coarse)';
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setPortrait(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return portrait;
}

function Captions({ ms, layout }) {
  const { scene, t } = sceneAt(ms);
  let cur = -1;
  scene.caption.forEach((l, i) => { if (t >= l.at && (l.until == null || t < l.until)) cur = i; });
  return (
    <div className={`reel-caps is-${scene.place || 'top'} is-${layout}`}>
      {scene.caption.map((l, i) => (
        <Caption key={`${scene.key}-${i}`} line={l} state={i === cur ? 'in' : i < cur || (l.until != null && t >= l.until) ? 'out' : 'wait'} />
      ))}
    </div>
  );
}

function ActLayer({ act, t, layout, leaving }) {
  const View = VIEWS[act.key];
  return (
    <div className={`reel-layer${leaving ? ' is-leaving' : ''}`}>
      <View t={t} layout={layout} />
    </div>
  );
}

/* Outside the ad, a page can jump it to a moment — the feature chips under
   the homepage's hero do — by dispatching `mk-reel-seek` with the time; the ad
   announces each scene it reaches as `mk-reel-scene`, so those chips can show
   where it is. Window events keep the two apart: the ad is loaded lazily,
   and the chips are drawn before it exists. */

export default function ProductAd({ className = '', soundPrompt = false }) {
  const frameRef = useRef(null);
  const [viewRef, seen, visible] = useInView(0.45);
  const layout = useStageLayout(frameRef, { force: 'wide' });
  const reduced = useReducedMotion();
  const pageShown = usePageShown();
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);

  /* starts the first time it is in view; runs only while it is */
  const running = seen && visible && pageShown && !paused;
  const clock = useStoryClock(STORY, {
    running, reduced: false, handoffMs: 0, closingMs: null, atEnd: 'stop',
    speedKey: '__MK_AD_SPEED__', commitMs: 40,
  });
  const { goTo } = clock;
  const ended = clock.phase === 'ended';
  const ms = ended ? AD_MS : clock.t;

  /* what is drawn: the moment itself, or under reduced motion the
     current scene's finished frame */
  const { scene } = sceneAt(ms);
  const viewMs = reduced ? scene.at + scene.still : ms;
  const { idx: actIdx, act, t: actT } = actAt(viewMs);
  const leaving = !reduced && actIdx > 0 && actT < FADE_MS ? ACTS[actIdx - 1] : null;

  useAdSound(ms, { on: sound, playing: running && !ended, ended });

  const toggleSound = () => {
    if (sound) { soundOff(); setSound(false); return; }
    if (soundOn()) setSound(true);
  };
  const replay = () => { goTo(0); setPaused(false); };
  /* "Play with sound" over the picture: from the top, with the narrator */
  const withSound = () => {
    if (soundOn()) setSound(true);
    goTo(0); setPaused(false);
  };

  /* Full screen: the browser's own where it has one, turned to landscape on
     a phone that allows it (Android). An iPhone has no full screen for
     anything but a <video>, so there the film fills the window instead —
     and, held upright, turns itself sideways, as a video player would. */
  const [full, setFull] = useState(false);
  const [fill, setFill] = useState(false);
  const portrait = usePortrait();
  const toggleFull = () => {
    const el = viewRef.current;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    if (fill) { setFill(false); return; }
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (!request) { setFill(true); return; }
    Promise.resolve(request.call(el))
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(() => setFill(true));
  };
  useEffect(() => {
    const on = () => {
      const now = (document.fullscreenElement || document.webkitFullscreenElement) === viewRef.current;
      setFull(now);
      if (!now) try { screen.orientation?.unlock?.(); } catch { /* not supported */ }
    };
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, [viewRef]);
  /* filling the window: the page behind stops scrolling, Escape leaves */
  useEffect(() => {
    if (!fill) return undefined;
    const root = document.documentElement;
    root.classList.add('reel-filling');
    const onKey = (e) => { if (e.key === 'Escape') setFill(false); };
    window.addEventListener('keydown', onKey);
    return () => { root.classList.remove('reel-filling'); window.removeEventListener('keydown', onKey); };
  }, [fill]);
  const fullOn = full || fill;

  /* jumps asked for from outside (the feature chips) */
  useEffect(() => {
    const onSeek = (e) => {
      const to = Number(e.detail);
      if (!Number.isFinite(to)) return;
      goTo(0, { t: Math.max(0, Math.min(AD_MS, to)) });
      setPaused(false);
    };
    /* from the top, with the narrator: sent from inside a click on the page */
    const onSound = () => { if (soundOn()) setSound(true); goTo(0); setPaused(false); };
    window.addEventListener(AD_SEEK, onSeek);
    window.addEventListener(AD_SOUND, onSound);
    return () => { window.removeEventListener(AD_SEEK, onSeek); window.removeEventListener(AD_SOUND, onSound); };
  }, [goTo]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(AD_SCENE, { detail: scene.key }));
  }, [scene.key]);

  /* the tests' handle: where it is, and a way to go anywhere */
  const live = useRef({});
  useEffect(() => {
    live.current = { ms, viewMs, running, ended, started: seen, scene: scene.key, act: act.key, layout, reduced, sound, paused, full, fill };
  });
  useEffect(() => {
    window.__MK_AD__ = {
      duration: AD_MS,
      state: () => ({ ...live.current }),
      seek: (to) => goTo(0, { t: Math.max(0, Math.min(AD_MS, to)) }),
    };
    return () => { delete window.__MK_AD__; };
  }, [goTo]);

  return (
    <div ref={viewRef} className={`reel${full ? ' is-full' : ''}${fill ? ' is-fill' : ''}${fullOn && portrait ? ' is-turned' : ''} ${className}`}
      role="group" aria-roledescription="product film"
      aria-label="Maks Ops in a minute and a half: one order, from a catalogue enquiry to a paid invoice, and the platform around it">
      {/* the frame and its controls: in full screen on an upright phone, this turns sideways */}
      <div className="reel-body">
      <div ref={frameRef} className={`reel-frame is-${layout}${reduced ? ' is-reduced' : ''}${running && !ended ? '' : ' is-paused'}`}>
        <Stage layout={layout}>
          <div className="reel-canvas" aria-hidden="true">
            <div className="reel-grid" />
            {leaving && <ActLayer key={leaving.key} act={leaving} t={viewMs - leaving.at} layout={layout} leaving />}
            <ActLayer key={act.key} act={act} t={actT} layout={layout} />
            {/* a sweep of light across the frame as each act begins */}
            {actIdx > 0 && !reduced && actT < 1400 && <i key={`sweep-${act.key}`} className="reel-sweep" />}
            <Captions ms={viewMs} layout={layout} />
          </div>
          {viewMs >= CTA_FROM && (
            <Link to="/login" className="reel-cta" style={box(CTA_AT)}>
              Test Maks Ops <ArrowRight size={17} />
            </Link>
          )}
        </Stage>
        <i className="reel-progress" style={{ transform: `scaleX(${ms / AD_MS})` }} aria-hidden="true" />
        {soundPrompt && !sound && !ended && supportsSound() && (
          <button type="button" className="reel-play-sound" onClick={withSound}>
            <span className="reel-play-sound-ico"><Play size={16} fill="currentColor" /></span> Play with sound
          </button>
        )}
      </div>

      {/* below the frame, so they never cover what the film is showing */}
      <div className="reel-controls">
        {!ended && (
          <button type="button" className="reel-ctl" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
        )}
        {supportsSound() && (
          <button type="button" className={`reel-ctl${sound ? ' is-on' : ''}`} onClick={toggleSound} aria-pressed={sound} aria-label="Sound">
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}<span>{sound ? 'Sound on' : 'Play sound'}</span>
          </button>
        )}
        <button type="button" className={`reel-ctl is-replay${ended ? ' is-on' : ''}`} onClick={replay} aria-label="Replay">
          <RotateCcw size={14} /><span>Replay</span>
        </button>
        <button type="button" className="reel-ctl is-full-btn" onClick={toggleFull} aria-pressed={fullOn}
          aria-label={fullOn ? 'Exit full screen' : 'Full screen'}>
          {fullOn ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{fullOn ? 'Exit' : 'Full screen'}</span>
        </button>
      </div>
      </div>

      {/* the whole story as text, for screen readers and anyone without the picture */}
      <ol className="reel-sr">
        {SCENES.map((s) => <li key={s.key}>{s.sr}</li>)}
      </ol>
    </div>
  );
}
