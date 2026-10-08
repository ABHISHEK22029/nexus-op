/* ══════════════════════════════════════════════════════════
   reliability.js — what to do when the app seems to freeze.

   Reported: "the page becomes stagnant and inoperable; we need to refresh
   it manually." Two causes fit, and both are handled here.

   1. The server is asleep. The API runs on a host that idles after a quiet
      spell, and the first request then takes up to a minute. Buttons seem
      to do nothing, so people refresh — and it works, because by then the
      server has woken. Now:
        · the server is pinged as soon as the app loads, so it is usually
          awake before anyone clicks anything;
        · any request still running after 5 s puts up a small notice that
          says what is happening and that there is no need to refresh.
   2. A new version was deployed while the tab was open. The screens are
      loaded on demand, and the files the old tab asks for no longer exist,
      so the next screen never arrives. Now the page reloads itself once
      (at most every 30 s, so a real outage cannot loop).

   Imported once for its side effects (main.jsx), after apiAuth.js.
   ══════════════════════════════════════════════════════════ */
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SLOW_MS = 5000;
const isApi = (url) => typeof url === 'string' && (url.startsWith(API) || url.startsWith('/'));

/* ── 1. a sleeping server ── */
let slow = 0;
let note = null;
const showNote = () => {
  if (note || typeof document === 'undefined') return;
  note = document.createElement('div');
  note.setAttribute('role', 'status');
  note.className = 'app-waking';
  note.innerHTML = '<span class="app-waking-dot" aria-hidden="true"></span>'
    + '<span><b>Connecting to the server…</b> After a quiet spell it can take up to a minute to wake. '
    + 'Your request is still going — there is no need to refresh.</span>';
  document.body.appendChild(note);
};
const hideNote = () => { if (note) { note.remove(); note = null; } };

const track = () => {
  let flagged = false;
  const timer = setTimeout(() => { flagged = true; slow++; showNote(); }, SLOW_MS);
  return () => {
    clearTimeout(timer);
    if (flagged && --slow <= 0) { slow = 0; hideNote(); }
  };
};

const wrappedFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (!isApi(url)) return wrappedFetch(input, init);
  const done = track();
  try { return await wrappedFetch(input, init); } finally { done(); }
};
axios.interceptors.request.use((config) => { config.__done = track(); return config; });
axios.interceptors.response.use(
  (res) => { res.config?.__done?.(); return res; },
  (err) => { err?.config?.__done?.(); return Promise.reject(err); },
);

/* wake it now, before anyone needs it */
try { wrappedFetch(`${API}/health`, { cache: 'no-store' }).catch(() => {}); } catch { /* offline */ }

/* ── 2. a new version, an old tab ── */
const KEY = 'maksops_reloaded_at';
const reloadOnce = () => {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 30000) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return true;
};
const CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { if (CHUNK.test(String(e.reason?.message || e.reason || ''))) reloadOnce(); });
window.addEventListener('error', (e) => { if (CHUNK.test(String(e.message || ''))) reloadOnce(); });
