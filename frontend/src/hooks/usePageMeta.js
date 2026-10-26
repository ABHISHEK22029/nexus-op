import { useEffect } from 'react';
import { SITE } from '../lib/seo';

/* A page's own title and description. Without it every marketing page wore
   index.html's title, so the platform page, How it works and Get started
   looked like the homepage in search results and in browser tabs. Restores
   what was there when the page goes, so moving between pages never leaves
   one page's title on another.

   With `path` it also points the canonical link and the link-preview tags
   (og:*, twitter:*) at this page — the same tags scripts/prerender.mjs
   writes into the page's HTML at build time, kept true as a visitor moves
   around without reloading. */
const setMeta = (selector, attr, value) => {
  const el = document.head.querySelector(selector);
  if (!el) return null;
  const prev = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => { if (prev != null) el.setAttribute(attr, prev); };
};

export default function usePageMeta(title, description, path) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const url = path != null ? `${SITE.url}${path}` : null;
    const undo = [
      description && setMeta('meta[name="description"]', 'content', description),
      setMeta('meta[property="og:title"]', 'content', title),
      setMeta('meta[name="twitter:title"]', 'content', title),
      description && setMeta('meta[property="og:description"]', 'content', description),
      description && setMeta('meta[name="twitter:description"]', 'content', description),
      url && setMeta('link[rel="canonical"]', 'href', url),
      url && setMeta('meta[property="og:url"]', 'content', url),
    ].filter(Boolean);
    return () => {
      document.title = prevTitle;
      undo.forEach((fn) => fn());
    };
  }, [title, description, path]);
}
