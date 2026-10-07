import React, { useEffect, useRef } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw, Volume2, VolumeX, Captions, CaptionsOff,
  ListOrdered, Maximize, Minimize,
} from 'lucide-react';
import { beatsOf } from '../../flow/engine/timeline';

/* ══════════════════════════════════════════════════════════════════════
   The film's controls. Real buttons, each with its name — the stage above
   them is a picture and is hidden from assistive technology; this is how
   the film is operated.

   The timeline is the chapters, each a segment as long as the chapter
   runs, with a tick where each beat starts. Pressing a segment goes to
   that chapter.
   ══════════════════════════════════════════════════════════════════════ */

const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Timeline({ chapters, idx, t, phase, onJump }) {
  return (
    <div className="fm-timeline" role="group" aria-label="Chapters">
      {chapters.map((c, i) => {
        const fill = i < idx || phase === 'ended' ? 1 : i > idx ? 0 : phase === 'handoff' ? 1 : Math.min(1, t / c.duration);
        return (
          <button key={c.key} type="button" className={`fm-seg${i === idx ? ' is-on' : ''}`}
            style={{ flexGrow: c.duration }} onClick={() => onJump(i)}
            aria-label={`Chapter ${c.n}, ${c.title}`} aria-current={i === idx ? 'step' : undefined}>
            <span className="fm-seg-bar" aria-hidden="true">
              <span className="fm-seg-fill" style={{ transform: `scaleX(${fill})` }} />
              {beatsOf(c).slice(1).map((b) => <i key={b.key} style={{ left: `${(b.at / c.duration) * 100}%` }} />)}
            </span>
            <span className="fm-seg-tip" aria-hidden="true">{c.n} · {c.title}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChapterMenu({ chapters, idx, onJump, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="true"]')?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const away = (e) => { if (ref.current && !ref.current.parentElement.contains(e.target)) onClose(); };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', away); };
  }, [onClose]);
  return (
    <div className="fm-menu" ref={ref} role="menu" aria-label="Go to a chapter">
      {chapters.map((c, i) => (
        <button key={c.key} type="button" role="menuitem" className={`fm-menu-item${i === idx ? ' is-on' : ''}`}
          aria-current={i === idx ? 'true' : undefined} onClick={() => onJump(i)}>
          <span className="fm-menu-n">{c.n}</span>
          <span className="fm-menu-t"><b>{c.title}</b><small>{c.kicker}</small></span>
          <span className="fm-menu-d">{mmss(c.duration)}</span>
        </button>
      ))}
    </div>
  );
}

export default function Controls({
  chapters, idx, lastN, playing, ended, voiceOn, cc, full, menuOpen,
  onPlay, onPrev, onNext, onRestart, onVoice, onCc, onFull, onMenu, onJump, onMenuClose,
}) {
  const ch = chapters[idx];
  return (
    <div className="fm-controls">
      <button type="button" className="fm-ctl is-play" onClick={onPlay}
        aria-label={ended ? 'Watch again' : playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={18} /> : ended ? <RotateCcw size={18} /> : <Play size={18} />}
      </button>
      <button type="button" className="fm-ctl" onClick={onPrev} disabled={idx === 0} aria-label="Previous chapter"><SkipBack size={16} /></button>
      <button type="button" className="fm-ctl" onClick={onNext} disabled={idx === chapters.length - 1} aria-label="Next chapter"><SkipForward size={16} /></button>
      <button type="button" className="fm-ctl" onClick={onRestart} aria-label="Start this chapter again"><RotateCcw size={15} /></button>
      <span className="fm-ctl-label" aria-live="off">
        <b>{ch.n}</b><span> / {lastN}</span> — {ch.title}
      </span>
      <span className="fm-ctl-gap" />
      <button type="button" className={`fm-ctl${voiceOn ? ' is-on' : ''}`} onClick={onVoice}
        aria-pressed={voiceOn} aria-label="Voice-over" title="Voice-over (M)">
        {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      <button type="button" className={`fm-ctl${cc ? ' is-on' : ''}`} onClick={onCc}
        aria-pressed={cc} aria-label="Captions" title="Captions (C)">
        {cc ? <Captions size={16} /> : <CaptionsOff size={16} />}
      </button>
      <span className="fm-menu-host">
        <button type="button" className="fm-ctl is-text" onClick={onMenu}
          aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Chapters">
          <ListOrdered size={15} /> <span>Chapters</span>
        </button>
        {menuOpen && <ChapterMenu chapters={chapters} idx={idx} onJump={onJump} onClose={onMenuClose} />}
      </span>
      <button type="button" className="fm-ctl" onClick={onFull} aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
        {full ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
    </div>
  );
}
