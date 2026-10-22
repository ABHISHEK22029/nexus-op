import { AD_SEEK, AD_SOUND } from '../ad/util';
import { FLOW_GOTO, FLOW_VOICE } from '../flow/events';

/* Bring an element into view, unless it is most of the way there already. */
const reveal = (id) => {
  const el = typeof document !== 'undefined' && document.getElementById(id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < -r.height * 0.4 || r.top > window.innerHeight * 0.5) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
};

/** Play the homepage ad from `ms`, bringing it into view. */
export const playAd = (ms) => {
  window.dispatchEvent(new CustomEvent(AD_SEEK, { detail: ms }));
  reveal('the-film');
};

/** The ad from the top with its narrator — called inside the click, which
    is what lets the browser start the sound. */
export const playAdWithSound = () => {
  window.dispatchEvent(new CustomEvent(AD_SOUND));
  reveal('the-film');
};

/** Play a stage of the walkthrough (How It Works), bringing it into view. */
export const playStage = (i) => {
  window.dispatchEvent(new CustomEvent(FLOW_GOTO, { detail: i }));
  reveal('the-walkthrough');
};

/** The walkthrough with its voice-over on — inside the click, for the sound. */
export const playWalkthroughWithVoice = () => {
  window.dispatchEvent(new CustomEvent(FLOW_VOICE));
  reveal('the-walkthrough');
};
