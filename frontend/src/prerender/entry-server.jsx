import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AuthContext } from '../context/AuthContext';
import Welcome from '../pages/Welcome';
import PlatformCapabilities from '../pages/PlatformCapabilities';
import HowItWorks from '../pages/HowItWorks';
import SeeMaksOps from '../pages/SeeMaksOps';
import GetStarted from '../pages/GetStarted';

/* ══════════════════════════════════════════════════════════════════════
   The public pages, rendered to HTML at build time (scripts/prerender.mjs).

   Built with `vite build --ssr`, so it is the same components the browser
   runs, drawn once with nobody signed in. Effects do not run here, and the
   films are lazy, so they come out as their placeholders: what is written
   is the page's words and structure — what a search engine or a link
   preview needs — and the browser replaces it with the live page.
   ══════════════════════════════════════════════════════════════════════ */

const PAGES = {
  '/': Welcome,
  '/platform': PlatformCapabilities,
  '/how-it-works': HowItWorks,
  '/see-maksops': SeeMaksOps,
  '/get-started': GetStarted,
};

/* a visitor who is not signed in — which is what a crawler is */
const GUEST = {
  token: null, user: null, loading: false,
  login: async () => {}, signup: async () => {}, logout: () => {},
};

export const paths = Object.keys(PAGES);

export function render(path) {
  const Page = PAGES[path];
  return renderToString(
    <AuthContext.Provider value={GUEST}>
      <StaticRouter location={path}>
        <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}><Page /></div>
      </StaticRouter>
    </AuthContext.Provider>,
  );
}
