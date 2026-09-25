/* ══════════════════════════════════════════════════════════
   The company's logo on a document's letterhead.

   Same problem as CatalogueThumb: the bytes come from an owner-scoped
   route that needs a bearer token, and an <img> tag cannot send an
   Authorization header. So fetch it, make a blob URL, point the tag at
   that, and revoke it on unmount.

   Falls back to `logo_url` — the old "paste a link to your logo" field —
   so a company that set one up that way keeps its letterhead until it
   uploads a file. If neither exists, this renders nothing at all rather
   than a broken-image icon: a document with no logo is fine, a document
   with a grey placeholder where the logo should be is not.

   One fetch per mount is acceptable here: a document page renders one
   letterhead, and the response is cached for five minutes.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CompanyLogo({ fallbackUrl = null, height = 44, alt = '', style = {} }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url = null;
    let alive = true;
    (async () => {
      try {
        const token = localStorage.getItem('nexus_token');
        const r = await fetch(`${API}/company-profile/logo`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        /* 404 simply means none uploaded — expected, not an error. */
        if (!r.ok) { if (alive && fallbackUrl) setSrc(fallbackUrl); return; }
        const blob = await r.blob();
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        if (alive && fallbackUrl) setSrc(fallbackUrl);
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fallbackUrl]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{ height, width: 'auto', objectFit: 'contain', ...style }}
    />
  );
}
