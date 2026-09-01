/* ══════════════════════════════════════════════════════════
   apiAuth.js — global JWT wiring for every API call.

   The app makes API requests via both `fetch` and `axios` across
   dozens of files. Rather than touch each call site, we install
   one interceptor for each transport here:
     • attach `Authorization: Bearer <token>` to API requests
     • on a 401, clear the session and bounce to /login

   Imported once for its side effects (see main.jsx).
   ══════════════════════════════════════════════════════════ */
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'nexus_token';
const USER_KEY = 'nexus_user';

const getToken = () => localStorage.getItem(TOKEN_KEY);

function forceLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Avoid redirect loops on the auth screens themselves (login / signup).
  if (!/^\/(login|signup)/.test(window.location.pathname)) {
    window.location.assign('/login');
  }
}

// Requests to our own API only (not third-party URLs).
const isApiUrl = (url) => typeof url === 'string' && (url.startsWith(API) || url.startsWith('/'));
// The login/register endpoints must never trigger the 401 auto-logout.
const isAuthEndpoint = (url) => typeof url === 'string' && url.includes('/auth/login');

/* ── fetch ─────────────────────────────────────────────── */
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url;
  let opts = init;

  if (isApiUrl(url)) {
    const token = getToken();
    if (token) {
      opts = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } };
    }
  }

  const res = await nativeFetch(input, opts);
  // Only treat a 401 as a session expiry when we actually HAD a token.
  // A 401 with no token is just an unauthenticated call (e.g. on /login) and
  // must never trigger a logout/redirect — that caused bounce loops.
  if (res.status === 401 && isApiUrl(url) && !isAuthEndpoint(url) && getToken()) {
    forceLogout();
  }
  return res;
};

/* ── axios ─────────────────────────────────────────────── */
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error?.config?.url;
    if (error?.response?.status === 401 && !isAuthEndpoint(url) && getToken()) {
      forceLogout();
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
