import { useEffect, useRef, useState } from 'react';
import { beatsOf } from './timeline';
import { sayingTime } from '../voice';

/* ══════════════════════════════════════════════════════════════════════
   The voice-over, driven by the story clock.

   Says the line of the beat on screen, and holds the picture at the end of
   that beat until the line is finished — the story waits for the voice,
   never the other way round. Runs again when:

     · the voice comes on, or back on after a pause, scrolling away or a
       hidden tab — the beat starts again, so words and picture begin
       together
     · a scene is chosen by hand (the clock's `take`)
     · the story moves on by itself to a new scene, beat or closing card

   Under reduced motion nothing moves by itself, so the voice reads the
   whole scene that is chosen.
   ══════════════════════════════════════════════════════════════════════ */

export default function useStoryVoice(clock, { scenes, live, narrator, reduced, closingLine }) {
  const [caption, setCaption] = useState('');
  const { idx, phase, beatIdx, take } = clock;
  const { restartBeat, voiceTarget, holdForVoice, releaseVoice } = clock;
  const closing = phase === 'closing';
  const was = useRef({ live: false, take });

  useEffect(() => {
    const before = was.current;
    was.current = { live, take };
    if (!live) {
      releaseVoice();
      narrator.stop();
      return;
    }
    /* Back to the start of the beat only when the voice has just come on or
       a scene was chosen — not when the story reached a new beat by itself,
       where it already is at the start. */
    if (!reduced && (!before.live || before.take !== take)) restartBeat();

    const now = voiceTarget();
    const sc = scenes[now.idx];
    let line, gate;
    if (now.phase === 'closing') {
      line = closingLine;
    } else if (reduced) {
      line = beatsOf(sc).map((b) => b.voice).filter(Boolean).join(' ');
    } else {
      const beats = beatsOf(sc);
      line = beats[now.beatIdx]?.voice;
      gate = now.beatIdx + 1 < beats.length ? beats[now.beatIdx + 1].at : sc.duration;
    }
    if (!line) { releaseVoice(); narrator.stop(); return; }
    holdForVoice({ until: performance.now() + sayingTime(line), gate });
    narrator.say(line, { onLine: setCaption, onDone: releaseVoice });
  }, [live, idx, beatIdx, closing, take, reduced, narrator, scenes, closingLine,
      restartBeat, voiceTarget, holdForVoice, releaseVoice]);

  return { caption };
}
