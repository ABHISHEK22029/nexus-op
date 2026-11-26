/* ══════════════════════════════════════════════════════════
   Ask before leaving a page that has unsaved changes.

   The browser asks on a reload or a closed tab (beforeunload). Moving to
   another screen inside the app asks too: the app runs on a plain
   BrowserRouter, which has no navigation blocker, so the one door every
   in-app move goes through — history.pushState, used by links and by the
   sidebar's buttons alike — asks while something is unsaved, and is put
   back the moment nothing is. (The same approach Company Profile uses.)

   A plain browser confirm on purpose: pushState cannot wait for the app's
   own dialog, and leaving has to be answered before the page changes.
   ══════════════════════════════════════════════════════════ */
import { useEffect } from 'react';

export const LEAVE_MESSAGE = 'You have changes on this document that are not saved. Leave without saving them?';

export function useLeaveGuard(dirty, message = LEAVE_MESSAGE) {
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const push = window.history.pushState;
    window.history.pushState = function guarded(state, title, url) {
      const to = url == null ? null : new URL(String(url), window.location.href);
      if (to && to.pathname !== window.location.pathname && !window.confirm(message)) return undefined;
      return push.call(this, state, title, url);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => { window.history.pushState = push; window.removeEventListener('beforeunload', onUnload); };
  }, [dirty, message]);
}
