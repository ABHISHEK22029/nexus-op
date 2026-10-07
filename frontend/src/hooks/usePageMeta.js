import { useEffect } from 'react';

/* A page's own title and description. Without it every marketing page wore
   index.html's "Maks Ops — From catalogue to cash", so the platform page,
   How it works and Get started looked like the homepage in search results
   and in browser tabs. Restores what was there when the page goes, so
   moving between pages never leaves one page's title on another. */
export default function usePageMeta(title, description) {
  useEffect(() => {
    const prevTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    document.title = title;
    if (meta && description) meta.setAttribute('content', description);
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc != null) meta.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}
