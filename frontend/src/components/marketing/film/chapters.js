/* ══════════════════════════════════════════════════════════════════════
   The product film's chapters, in order.

   Each chapter is a folder: chapters/<key>/script.js (plain JS — what it
   says, how long it runs, which screen each beat is on) and Scene.jsx (what
   it draws, as a pure function of time). This list is the only place the
   order lives; a chapter's number ("04") is its position here.

   Adding a feature to the film:
     1. a folder with script.js and Scene.jsx, its key equal to the folder
     2. its import, in place, below
     3. node scripts/voiceover/make.mjs --only film   (records its lines)
     4. node scripts/check-film.mjs                   (keeps it honest)

   A chapter's key is its link (/see-maksops#customer). Never rename one
   that has shipped — links to it are out in the world.

   Plain JavaScript: the voice recorder and the checks import this file
   too, from Node.
   ══════════════════════════════════════════════════════════════════════ */
import opening from './chapters/opening/script.js';
import workspace from './chapters/workspace/script.js';
import team from './chapters/team/script.js';
import catalogue from './chapters/catalogue/script.js';
import customer from './chapters/customer/script.js';
import close from './chapters/close/script.js';

const ORDER = [opening, workspace, team, catalogue, customer, close];

export const CHAPTERS = ORDER.map((c, i) => ({ ...c, n: String(i).padStart(2, '0') }));
export const LAST_N = String(CHAPTERS.length - 1).padStart(2, '0');
export const chapterIndex = (key) => CHAPTERS.findIndex((c) => c.key === key);
