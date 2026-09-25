/* ══════════════════════════════════════════════════════════
   Upload the company logo as a file.

   Company Profile only ever offered "Logo URL" — paste a public link. That
   asks a fabrication business to find image hosting before it can put its
   own mark on an invoice, and it breaks on every document already issued
   the day that link rots.

   The URL field stays, below this, for anyone already using it. This is
   the one that most people want.

   Shows what is actually stored, not what was just selected: after an
   upload it re-reads the saved logo, so the preview is the letterhead the
   documents will print rather than a local file the server may have
   rejected.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const token = () => localStorage.getItem('nexus_token');
const auth = () => (token() ? { Authorization: `Bearer ${token()}` } : {});

export default function LogoUploader({ onChange }) {
  const [src, setSrc] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const urlRef = useRef(null);

  const revoke = () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };

  const load = useCallback(async () => {
    try {
      const s = await fetch(`${API}/company-profile/logo/status`, { headers: auth() }).then(r => r.json());
      if (!s.exists) { revoke(); setSrc(null); setMeta(null); return; }
      setMeta(s);
      const r = await fetch(`${API}/company-profile/logo`, { headers: auth() });
      if (!r.ok) return;
      const blob = await r.blob();
      revoke();
      urlRef.current = URL.createObjectURL(blob);
      setSrc(urlRef.current);
    } catch { /* leave the preview empty; the field below still works */ }
  }, []);

  useEffect(() => { load(); return revoke; }, [load]);

  const pick = async (file) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API}/company-profile/logo`, { method: 'POST', headers: auth(), body: fd });
      const d = await r.json().catch(() => ({}));
      /* Say what the server said. "Upload failed" sends somebody hunting
         through settings for a problem the message already knows about —
         wrong format, or too big. */
      if (!r.ok) { setError(d.error || `Upload failed (${r.status})`); return; }
      await load();
      onChange?.(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const remove = async () => {
    setBusy(true); setError(null);
    try {
      await fetch(`${API}/company-profile/logo`, { method: 'DELETE', headers: auth() });
      await load();
      onChange?.(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{
        width: 132, height: 78, borderRadius: 10, flex: '0 0 auto',
        border: '1px dashed var(--border-default)', background: 'var(--bg-elevated)',
        display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 6,
      }}>
        {src
          ? <img src={src} alt="Company logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <ImageIcon size={20} style={{ color: 'var(--text-disabled)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-sm secondary" disabled={busy}
            onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
            {src ? 'Replace logo' : 'Upload logo'}
          </button>
          {src && (
            <button type="button" className="btn-sm secondary" disabled={busy} onClick={remove}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <input
            ref={fileRef} type="file" hidden
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Company logo file"
            onChange={e => pick(e.target.files?.[0])}
          />
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
          {meta
            ? <>Stored: {meta.filename} · {(meta.size_bytes / 1024).toFixed(0)} KB</>
            : <>PNG, JPEG, WebP or SVG. Under 2MB — it is embedded in every document.</>}
        </div>
        {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
