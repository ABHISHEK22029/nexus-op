import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { beatsOf, beatIndexAt } from './timeline';

/* ══════════════════════════════════════════════════════════════════════
   The story clock — one for the homepage walkthrough and the product film.

   One requestAnimationFrame loop advances `elapsed` while the story is
   allowed to run, and commits it to React about twenty times a second.
   Scenes are drawn as pure functions of that time, so jumping, pausing and
   restarting are just changes to one number.

   Phases: play → handoff (the record flies to the next card) → play …
   and after the last scene either `closing` (a closing card, then loop or
   stop) or straight to `ended`.

   What holds the story where it is:
     · `running` false — paused, off-screen, keyboard focus: nothing moves
     · `hold` — the scene plays to its end and waits there (hovering)
     · a line being spoken — the picture waits at the end of the beat being
       spoken until the voice has finished it. A scene without beats is
       one beat, so on the homepage this waits at the end of the scene,
       exactly as it always has.

   window[speedKey] is the tests' throttle: 0 freezes, 12 runs twelve
   times as fast. Read every frame, so a test can change it at will.
   ══════════════════════════════════════════════════════════════════════ */

export default function useStoryClock(scenes, {
  running = true, reduced = false, hold = false,
  handoffMs = 640, closingMs = null, atEnd = 'loop',
  onHandoff, speedKey = '__MK_FLOW_SPEED__', commitMs = 50,
  initial = { idx: 0, t: 0 },         // where to open — the film opens on a #chapter link
} = {}) {
  const [idx, setIdx] = useState(initial.idx);
  const [t, setT] = useState(initial.t);
  const [phase, setPhase] = useState('play');     // play | handoff | closing | ended
  const [prev, setPrev] = useState(null);         // the scene leaving, for the cross-fade
  const [take, setTake] = useState(0);            // bumped each time a scene is started by hand

  /* everything the loop reads, so it never has to restart */
  const S = useRef({
    idx: initial.idx, phase: 'play', elapsed: initial.t, sub: 0, running: false, hold: false,
    last: null, lastCommit: 0, lastT: -1, speaking: false, speakUntil: 0, gate: Infinity,
  });
  const opts = useRef({});
  /* restarts the loop after it has gone to sleep (see below) */
  const wake = useRef(() => {});
  useLayoutEffect(() => {
    S.current.running = running && !reduced;
    S.current.hold = hold;
    opts.current = { scenes, handoffMs, closingMs, atEnd, onHandoff, speedKey, commitMs };
    if (S.current.running) wake.current();
  });

  const enter = useCallback((i, at = 0) => {
    const s = S.current;
    if (i !== s.idx) setPrev({ idx: s.idx, at: Date.now() });
    s.idx = i; s.phase = 'play'; s.elapsed = at; s.sub = 0; s.lastT = at;
    setIdx(i); setPhase('play'); setT(at);
  }, []);

  /** Start scene i (at time t), as a person choosing it. */
  const goTo = useCallback((i, { t: at = 0 } = {}) => {
    enter(i, at);
    setTake((k) => k + 1);
  }, [enter]);

  /** Back to the start of the beat now playing — so the words and the
      picture begin together when the voice comes (back) on. */
  const restartBeat = useCallback(() => {
    const s = S.current;
    if (s.phase === 'closing') { s.sub = 0; return; }
    const sc = opts.current.scenes[s.idx];
    const at = beatsOf(sc)[beatIndexAt(sc, s.elapsed)].at;
    if (s.phase !== 'play' || s.elapsed !== at) {
      s.phase = 'play'; s.elapsed = at; s.sub = 0; s.lastT = at;
      setPhase('play'); setT(at);
    }
  }, []);

  /** What the voice should be saying now: the scene, and its beat. */
  const voiceTarget = useCallback(() => {
    const s = S.current;
    const sc = opts.current.scenes[s.idx];
    return { idx: s.idx, phase: s.phase, beatIdx: beatIndexAt(sc, s.elapsed) };
  }, []);

  /** Hold the picture at `gate` (the end of the beat being spoken) until
      releaseVoice(), or `until` (a ceiling), whichever comes first. */
  const holdForVoice = useCallback(({ until, gate = Infinity }) => {
    const s = S.current;
    s.speaking = true; s.speakUntil = until; s.gate = gate;
  }, []);
  const releaseVoice = useCallback(() => { S.current.speaking = false; }, []);

  /* ── the loop ──
     It runs only while the story may move. Paused, off-screen or in a
     background tab, it commits the last frame and stops asking for frames
     at all, and `running` turning true again wakes it. */
  useEffect(() => {
    if (reduced) return undefined;
    let raf = null;
    const loop = (now) => {
      const s = S.current;
      const o = opts.current;
      if (s.last == null) s.last = now;
      const v = typeof window !== 'undefined' ? window[o.speedKey] : undefined;
      const speed = typeof v === 'number' && v >= 0 ? v : 1;
      /* clamp: a background tab that wakes after a minute should resume, not
         skip three scenes in one frame */
      const dt = Math.min(now - s.last, 100) * speed;
      s.last = now;

      /* a line still being said holds the picture — up to a ceiling, in
         case a browser never reports the end of it */
      const talking = s.speaking && now < s.speakUntil;

      if (s.running) {
        const list = o.scenes;
        const sc = list[s.idx];
        if (s.phase === 'play') {
          /* -1: stopping exactly on the next beat's start would begin that
             beat — and its line — before this one has been said */
          const cap = talking && s.gate < sc.duration ? s.gate - 1 : sc.duration;
          s.elapsed = Math.max(s.elapsed, Math.min(cap, s.elapsed + dt));
          if (s.elapsed >= sc.duration && !s.hold && !talking) {
            if (s.idx < list.length - 1) {
              if (o.handoffMs > 0) {
                s.phase = 'handoff'; s.sub = 0; setPhase('handoff');
                o.onHandoff?.(s.idx, s.idx + 1);
              } else enter(s.idx + 1);
            } else if (o.closingMs != null) {
              s.phase = 'closing'; s.sub = 0; setPhase('closing');
            } else if (o.atEnd === 'loop') {
              enter(0);
            } else if (s.phase !== 'ended') {
              s.phase = 'ended'; setPhase('ended');
            }
          }
        } else if (s.phase === 'handoff') {
          s.sub += dt;
          if (s.sub >= o.handoffMs) enter(s.idx + 1);
        } else if (s.phase === 'closing') {
          s.sub += dt;
          if (s.sub >= o.closingMs && !s.hold && !talking) {
            if (o.atEnd === 'loop') enter(0);
            else { s.phase = 'ended'; setPhase('ended'); }
          }
        }
      }
      if (now - s.lastCommit >= o.commitMs && s.elapsed !== s.lastT) {
        s.lastCommit = now; s.lastT = s.elapsed; setT(s.elapsed);
      }
      if (s.running || s.elapsed !== s.lastT) raf = requestAnimationFrame(loop);
      else { raf = null; s.last = null; }
    };
    wake.current = () => { if (raf == null) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      wake.current = () => {};
    };
  }, [reduced, enter]);

  /* the outgoing scene stays for the length of its exit, then goes */
  useEffect(() => {
    if (!prev) return undefined;
    const h = setTimeout(() => setPrev(null), 440);
    return () => clearTimeout(h);
  }, [prev]);

  const scene = scenes[idx];
  const shownT = reduced ? scene.duration : t;
  return {
    idx, t, shownT, phase, prev, take,
    beatIdx: beatIndexAt(scene, shownT),
    goTo, restartBeat, voiceTarget, holdForVoice, releaseVoice,
  };
}
