/* ══════════════════════════════════════════════════════════
   apiAuth.js — global JWT wiring for every API call.

   The app makes API requests via both `fetch` and `axios` across
   dozens of files. Rather than touch each call site, we install
   one interceptor for each transport here:
     • attach `Authorization: Bearer <token>` to API requests
     • keep the session fresh while someone is working
     • on a 401, ask the person to sign in again ON THE SAME PAGE

   Imported once for its side effects (see main.jsx).
   ══════════════════════════════════════════════════════════ */
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'nexus_token';
const USER_KEY = 'nexus_user';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const readUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };

/* Why the session ended, for the sign-in screen to say — "Your password
   was changed", "This account has been switched off". Without it a person
   was simply back at the sign-in page with no idea why. */
export const SIGNED_OUT_KEY = 'maks_signed_out_reason';
export const RETURN_KEY = 'maks_return_to';
function forceLogout(reason) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  try { if (reason && String(reason).length <= 160) sessionStorage.setItem(SIGNED_OUT_KEY, JSON.stringify({ reason: String(reason), at: Date.now() })); } catch { /* private mode */ }
  // Avoid redirect loops on the auth screens themselves (login / signup).
  if (!/^\/(login|signup)/.test(window.location.pathname)) {
    /* Where they were, so signing in again goes back there rather than to
       the dashboard — half an hour into an invoice, that is the page. */
    try { sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search); } catch { /* private mode */ }
    window.location.assign('/login');
  }
}

/* ── Signing in again without leaving the page ─────────────
   Reported: "if you enter some info it gets erased when the user logs in".

   A session ends after 12 hours, on a password change, or when the account
   is switched off. The first request after that came back 401, and this
   file sent the whole tab to /login with a full page load. Everything typed
   on the screen went with it: the half-made invoice, the customer form, the
   order lines. And it was not only on Save: the notifications check runs
   every minute, so the page could be wiped while someone was still typing.

   Now a 401 on a signed-in screen opens a sign-in box over the page
   (components/SessionGate). The page stays as it is underneath. Requests
   wait while the box is open, and the one that was refused is sent again
   once the person is back in, so a Save goes through rather than failing.

   Only the SAME account carries on. Someone else signing in at that box
   is taken to their own dashboard, and nothing the first person was
   saving is sent under the second person's name. */
let gate = null;                 // { promise, resolve, reason } while signed out
let gateScreens = 0;             // SessionGate is mounted (a signed-in screen)
const listeners = new Set();
/* Who this tab is signed in as, kept after the token is dropped: the person
   the sign-in box is for. Read again whenever a sign-in happens. */
let sessionUser = readUser();

const emit = () => listeners.forEach(fn => { try { fn(gate ? { reason: gate.reason, user: sessionUser } : null); } catch { /* listener gone */ } });

export function onSessionGate(fn) {
  listeners.add(fn); gateScreens++;
  fn(gate ? { reason: gate.reason, user: sessionUser } : null);
  return () => { listeners.delete(fn); gateScreens--; };
}
export const sessionGateOpen = () => !!gate;

/* The session ended. Resolves true once the same person has signed in again
   (send the request again), false if they chose to sign out. */
function sessionEnded(reason) {
  if (gate) return gate.promise;
  if (!gateScreens) { forceLogout(reason); return Promise.resolve(false); }
  sessionUser = readUser() || sessionUser;   // a sign-up in this tab never reloaded it
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  gate = { promise, resolve, reason: reason || '' };
  /* The old token is useless now; dropping it also tells other tabs. The
     user record stays, so the box knows whose session it is. */
  localStorage.removeItem(TOKEN_KEY);
  emit();
  return promise;
}

const sameUser = (a, b) => !!a && !!b && String(a.id) === String(b.id);

/* After a sign-in from the box: carry on, or start over as someone else. */
export function resumeSession({ token, user }) {
  const previous = sessionUser;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (previous && !sameUser(previous, user)) {
    /* A different account. The page belongs to the first person, and what
       was waiting to be saved is theirs: none of it is sent. */
    window.location.assign('/dashboard');
    return false;
  }
  sessionUser = user;
  window.dispatchEvent(new CustomEvent('maks:session', { detail: { token, user } }));
  const g = gate; gate = null; emit();
  g?.resolve(true);
  return true;
}

/* "Sign out" from the box: what signing out always did. */
export function endSession() {
  const reason = gate?.reason;
  gate?.resolve(false);
  gate = null; emit();
  forceLogout(reason);
}

/* Another tab signed in.
   - The same person, while this tab waits at the sign-in box: this tab
     carries on by itself.
   - Someone else: this tab would now be sending THEIR session with the
     first person's screen still open, so a Save here would land in the
     other person's company. It goes to the dashboard as the new person
     instead. (Before, it quietly carried on under the wrong account.) */
/* Whose token it is, read from the token itself. The other tab writes the
   token and the user record one after the other, and this tab can hear
   about the first before the second lands, so the record is not trusted. */
const tokenUserId = (t) => {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { return null; }
};
window.addEventListener('storage', (e) => {
  if (e.key !== TOKEN_KEY || !e.newValue) return;       // a sign-out elsewhere: see sessionRefused
  const id = tokenUserId(e.newValue);
  if (id == null) return;
  if (!sessionUser) { sessionUser = { id }; return; }
  if (String(id) !== String(sessionUser.id)) { window.location.assign('/dashboard'); return; }
  if (gate) { const g = gate; gate = null; emit(); window.dispatchEvent(new CustomEvent('maks:session', { detail: { token: e.newValue, user: readUser() } })); g.resolve(true); }
});

/* Whether a refused request should be sent again: yes at once if a sign-in
   already happened since it left (it carried the old token); otherwise once
   the person has signed in at the box. */
async function shouldRetry(sent, reason) {
  const now = getToken();
  if (now && now !== sent) return true;
  if (!sent && !gateScreens) return false;   // not signed in on this screen: an ordinary refusal
  return sessionEnded(reason);
}

/* ── Staying signed in while working ──────────────────────
   The server sends a fresh token (X-Session-Token) once a session is past
   half its life, so a person who is using the app is not signed out at
   the twelfth hour. Kept only if it replaces the token the request carried:
   a sign-in that happened meanwhile wins. */
function takeFresh(fresh, sent) {
  if (fresh && sent && getToken() === sent) localStorage.setItem(TOKEN_KEY, fresh);
}

// Requests to our own API only (not third-party URLs).
const isApiUrl = (url) => typeof url === 'string' && (url.startsWith(API) || url.startsWith('/'));
// The login/register endpoints must never trigger the 401 auto-logout.
const isAuthEndpoint = (url) => typeof url === 'string' && url.includes('/auth/login');

/* A 401 that means "this tab's session ended": the request carried a token,
   or it went out while the token was gone but the tab was signed in. A 401
   with no session at all is just an unauthenticated call (e.g. on /login)
   and must never open anything — that caused bounce loops. */
const sessionRefused = (sent) => !!sent || !!sessionUser;

/* ── fetch ─────────────────────────────────────────────── */
const nativeFetch = window.fetch.bind(window);
const withToken = (input, init, token) => {
  if (!token) return init;
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
};
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (!isApiUrl(url)) return nativeFetch(input, init);
  if (gate && !isAuthEndpoint(url)) await gate.promise;

  // A Request's body can be read once; keep a copy in case it is sent again.
  const again = input instanceof Request ? input.clone() : input;
  const sent = getToken();
  let res = await nativeFetch(input, withToken(input, init, sent));
  takeFresh(res.headers.get('X-Session-Token'), sent);

  if (res.status === 401 && !isAuthEndpoint(url) && sessionRefused(sent)) {
    /* The reason is read before the response is handed back, so nothing
       else can react to the 401 first and leave the sign-in box without it. */
    let reason;
    try { reason = (await res.clone().json())?.error; } catch { /* not JSON */ }
    if (await shouldRetry(sent, reason)) {
      const token = getToken();
      res = await nativeFetch(again, withToken(again, init, token));
      takeFresh(res.headers.get('X-Session-Token'), token);
    }
  }
  return res;
};

/* ── axios ─────────────────────────────────────────────── */
axios.interceptors.request.use(async (config) => {
  if (gate && !isAuthEndpoint(config?.url)) await gate.promise;
  const token = getToken();
  config.__sentToken = token;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (res) => { takeFresh(res?.headers?.['x-session-token'], res?.config?.__sentToken); return res; },
  async (error) => {
    const config = error?.config;
    const url = config?.url;
    if (error?.response?.status === 401 && !isAuthEndpoint(url) && !config?.__retried && sessionRefused(config?.__sentToken)) {
      if (await shouldRetry(config?.__sentToken, error?.response?.data?.error)) {
        config.__retried = true;
        return axios(config);
      }
    }
    return Promise.reject(error);
  }
);

/* Exported so call sites stop guessing the key.

   Several files read the key "token" directly — which is not the key; it is
   TOKEN_KEY above. Those reads always returned null, so their carefully
   added Authorization headers were no-ops. The requests worked anyway,
   because the fetch patch above attaches the real header regardless. That
   is the dangerous kind of wrong: the code looks correct, behaves
   correctly, and is held up entirely by a global side effect nobody reading
   the call site can see. Remove the patch and auth breaks everywhere at
   once, for reasons that would look unrelated.

   Import getToken from here rather than naming the key again. */
export { forceLogout, getToken, TOKEN_KEY };
