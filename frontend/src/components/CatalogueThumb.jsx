/* ══════════════════════════════════════════════════════════
   A product thumbnail in the catalogue list.

   The obvious approach — <img src="/catalogue/photos/12/image"> — does not
   work: that route is owner-scoped and needs a bearer token, and an <img>
   tag cannot send an Authorization header. So fetch it, turn the bytes
   into a blob URL, and point the tag at that.

   The public photo route would need no token, but it refuses anything not
   currently published — and this list exists so somebody can look at a
   product BEFORE deciding to list it.

   The blob URL is revoked on unmount. Without that, scrolling a hundred
   products leaks a hundred object URLs and the tab's memory climbs.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CatalogueThumb({ photoId, alt = '' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!photoId) return undefined;
    let url = null;
    let alive = true;
    (async () => {
      try {
        const token = localStorage.getItem('nexus_token');
        const r = await fetch(`${API}/catalogue/photos/${photoId}/image`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) return;
        const blob = await r.blob();
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch { /* a missing thumbnail is not worth an error */ }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);

  if (!src) return <ImageIcon size={15} style={{ color: 'var(--text-disabled)' }} />;
  return <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
