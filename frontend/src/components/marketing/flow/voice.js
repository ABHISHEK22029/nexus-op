import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CLIPS from './voice-clips.json';
import { sentences, clipName, CLIP_DIR } from './narration';

/* ══════════════════════════════════════════════════════════════════════
   The walkthrough's voice-over.

   Recorded clips, one per sentence of the script (narration.js), made
   with a neural voice by scripts/voiceover/make.mjs and served from
   /voice/. Every visitor hears the same natural voice whatever their
   browser — the browsers' own voices range from good to robotic, and
   on Windows Chrome the default is the robotic one.

   One <audio> element plays them all, in turn. iOS Safari allows sound
   only from an element that was first played inside a tap, so the same
   element is unlocked on the click that turns the voice on and reused.

   A sentence with no clip — the script changed and nobody re-recorded
   it — or a clip that fails to load is read by the browser's speech
   synthesis instead, so the narration never stops on a missing file.

   Sentence by sentence also gives the captions their cue.
   ══════════════════════════════════════════════════════════════════════ */

export { sentences };

export const canSpeak = () =>
  typeof window !== 'undefined'
  && 'speechSynthesis' in window
  && typeof window.SpeechSynthesisUtterance === 'function';

const canPlay = () => typeof window !== 'undefined' && typeof window.Audio === 'function';

/* A ceiling, not a cue: if the end of a line is never reported, the
   walkthrough waits this long for it and then carries on regardless. */
export const sayingTime = (text) => String(text || '').split(/\s+/).length * 450 + 3500;

const hasClip = (s) => Boolean(CLIPS.clips?.[clipName(s)]);

/* ── the fallback voice: the best English one the browser has ── */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox/;
const rank = (v) => {
  const name = String(v.name || '').toLowerCase();
  const lang = String(v.lang || '').toLowerCase().replace('_', '-');
  if (!lang.startsWith('en') || NOVELTY.test(name)) return -1;
  let s = 0;
  if (/natural|neural|online|premium|enhanced/.test(name)) s += 6;
  else if (/google/.test(name)) s += 4;
  if (lang === 'en-in') s += 3;
  else if (lang === 'en-gb' || lang === 'en-us') s += 1;
  return s;
};
const pickVoice = (voices) => {
  let best = null, top = -1;
  for (const v of voices) { const r = rank(v); if (r > top) { best = v; top = r; } }
  return best;
};

/* a tenth of a second of silence, to unlock the audio element on a tap */
const SILENCE = (() => {
  const n = 800, b = new Uint8Array(44 + n), d = new DataView(b.buffer);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); d.setUint32(4, 36 + n, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true);
  tag(36, 'data'); d.setUint32(40, n, true); b.fill(128, 44);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return typeof btoa === 'function' ? `data:audio/wav;base64,${btoa(s)}` : '';
})();

export default function useNarrator() {
  const [supported] = useState(() => canPlay() || canSpeak());
  const audio = useRef(null);
  const voice = useRef(null);
  const turn = useRef(0);
  /* Chrome can garbage-collect a queued utterance and then never fire its
     end event; holding on to it prevents that. */
  const held = useRef(null);
  const warmed = useRef(false);

  useEffect(() => {
    const counter = turn;   // a counter, not a node: read it when cleaning up
    const synth = canSpeak() ? window.speechSynthesis : null;
    const load = () => { voice.current = pickVoice(synth?.getVoices?.() || []); };
    if (synth) { load(); synth.addEventListener?.('voiceschanged', load); }
    return () => {
      counter.current++;
      synth?.removeEventListener?.('voiceschanged', load);
      synth?.cancel();
      const a = audio.current;
      if (a) { a.onended = a.onerror = null; a.pause(); }
    };
  }, []);

  const element = () => {
    if (!audio.current && canPlay()) {
      audio.current = new window.Audio();
      audio.current.preload = 'auto';
    }
    return audio.current;
  };

  const stop = useCallback(() => {
    turn.current++;
    const a = audio.current;
    if (a) { a.onended = a.onerror = null; a.pause(); }
    if (canSpeak()) window.speechSynthesis.cancel();
    held.current = null;
  }, []);

  /* the browser's voice reads one sentence, then `next` */
  const speakOne = useCallback((text, live, next) => {
    if (!canSpeak()) { setTimeout(() => { if (live()) next(); }, sayingTime(text) - 3500); return; }
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume();
    const u = new window.SpeechSynthesisUtterance(text);
    const v = voice.current;
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-IN';
    u.onend = u.onerror = () => { if (live()) next(); };
    held.current = u;
    synth.speak(u);
  }, []);

  /* Says `text`, replacing whatever was being said. `onLine` gets each
     sentence as it starts (the first at once, so the caption is up even
     before the sound); `onDone` fires once, after the last sentence. */
  const say = useCallback((text, { onLine, onDone } = {}) => {
    stop();
    const mine = turn.current;
    const live = () => turn.current === mine;
    const parts = sentences(text);
    onLine?.(parts[0] || '');
    let i = 0;
    const next = () => {
      if (!live()) return;
      if (i >= parts.length) { onDone?.(); return; }
      const p = parts[i++];
      onLine?.(p);
      const a = element();
      if (!a || !hasClip(p)) { speakOne(p, live, next); return; }
      let fellBack = false;
      const fallBack = () => { if (live() && !fellBack) { fellBack = true; speakOne(p, live, next); } };
      a.onended = () => { if (live()) next(); };
      a.onerror = fallBack;
      a.src = `${CLIP_DIR}${clipName(p)}`;
      const played = a.play();
      /* an interrupted play() rejects too — that one is not a failure */
      played?.catch?.((e) => { if (e?.name !== 'AbortError') fallBack(); });
    };
    next();
  }, [stop, speakOne]);

  /* Called inside the click that turns the voice on: unlocks the audio
     element for iOS, and fetches the clips ahead of time (a few hundred
     kilobytes) so no sentence waits on the network. */
  const unlock = useCallback(() => {
    const a = element();
    if (a && SILENCE) {
      a.src = SILENCE;
      a.play()?.catch?.(() => {});
    }
    if (!warmed.current && typeof fetch === 'function') {
      warmed.current = true;
      for (const name of Object.keys(CLIPS.clips || {})) {
        fetch(`${CLIP_DIR}${name}`, { priority: 'low' }).catch(() => {});
      }
    }
  }, []);

  return useMemo(() => ({ supported, say, stop, unlock }), [supported, say, stop, unlock]);
}

/* A tab in the background is not listening either. */
export const usePageShown = () => {
  const [shown, setShown] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setShown(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return shown;
};
