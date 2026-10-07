/* ══════════════════════════════════════════════════════════════════════
   Timeline arithmetic for a story made of scenes, each made of beats.

   Plain functions, no React: the site uses them, and so do the Node scripts
   that record the narration and check the film. A scene is
   { key, duration, beats? } — a scene without beats is one beat that
   lasts the whole scene and says the scene's `voice`, which is how every
   homepage stage is written.
   ══════════════════════════════════════════════════════════════════════ */

/** The beats of a scene, in order. Always at least one, starting at 0. */
export const beatsOf = (scene) => (scene?.beats?.length
  ? scene.beats
  : [{ key: 'all', at: 0, voice: scene?.voice, sr: scene?.sr }]);

/** Which beat is playing at time t. */
export const beatIndexAt = (scene, t) => {
  const beats = beatsOf(scene);
  let i = 0;
  for (let k = 0; k < beats.length; k++) if (t >= beats[k].at) i = k;
  return i;
};

/** Where beat i ends: the next beat's start, or the end of the scene. */
export const gateAfter = (scene, i) => {
  const beats = beatsOf(scene);
  return i + 1 < beats.length ? beats[i + 1].at : scene.duration;
};

/** The whole story's length, with a hand-off between each pair of scenes. */
export const totalMs = (scenes, handoffMs = 0) =>
  scenes.reduce((sum, s) => sum + s.duration, 0) + handoffMs * Math.max(0, scenes.length - 1);

/** When scene idx starts, from the beginning of the story. */
export const startOf = (scenes, idx, handoffMs = 0) => {
  let ms = 0;
  for (let i = 0; i < idx && i < scenes.length; i++) ms += scenes[i].duration + handoffMs;
  return ms;
};

/** The scene and time within it at a point in the whole story. */
export const locate = (scenes, ms, handoffMs = 0) => {
  let left = Math.max(0, ms);
  for (let idx = 0; idx < scenes.length; idx++) {
    const d = scenes[idx].duration;
    if (left < d || idx === scenes.length - 1) return { idx, t: Math.min(left, d) };
    left -= d + handoffMs;
    if (left < 0) return { idx, t: d };
  }
  return { idx: 0, t: 0 };
};
