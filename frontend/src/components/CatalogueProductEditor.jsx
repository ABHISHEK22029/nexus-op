/* ══════════════════════════════════════════════════════════
   Editing one product's catalogue entry.

   Everything a visitor reads about a product is set here: the headline
   they see instead of the internal name, what it is for, the minimum
   order, the lead time, its category, its web address, and its
   photographs.

   All of it existed on the server and none of it was reachable — the
   catalogue screen could only list a product or hide it, so every entry
   went out with the fabricator's own part name and a grey placeholder.
   A publish switch with nothing to publish is half a feature.

   Declared at module scope, not inside its parent. A component defined in
   another component's body is rebuilt on every render, React unmounts the
   subtree, and the caret jumps out of whatever field is being typed in —
   which is exactly the bug the vendor form had.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Image as ImageIcon, Eye, EyeOff, Loader } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CatalogueProductEditor({ product, api, toast, onClose, onSaved }) {
  const [form, setForm] = useState({
    headline: '', catalogue_category: '', use_case: '',
    moq: '', lead_time_note: '', catalogue_slug: '',
  });
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  /* Keyed on the product's ID and nothing else.
   *
     It depended on `product` and `api`. `api` is built inline by the
     parent, so it is a new function on every render; `product` is replaced
     whenever a save updates the row. Either one re-ran this effect, and
     re-running it calls setForm and throws away whatever is half-typed.
     Everything went to the server empty.
   *
     The id is the only thing that should reopen the editor with fresh
     values. `product` is still read inside, which is what an exhaustive
     dependency check would object to — it is deliberate: this is a load,
     not a subscription. */
  useEffect(() => {
    if (!product) return;
    setForm({
      headline: product.headline || '',
      catalogue_category: product.catalogue_category || '',
      use_case: product.use_case || '',
      moq: product.moq ?? '',
      lead_time_note: product.lead_time_note || '',
      catalogue_slug: product.catalogue_slug || '',
    });
    api(`/catalogue/products/${product.id}/photos`).then(setPhotos).catch(() => setPhotos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api(`/catalogue/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify(form),
      });
      toast.success('Saved');
      onSaved(saved);
      onClose();
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  const upload = async (file) => {
    if (!file) return;
    /* Checked here as well as on the server. The server is the one that
       matters, but a person who picks a PDF should be told before it
       travels. */
    if (!/^image\//.test(file.type)) { toast.error('That is not an image. JPEG, PNG or WebP.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('alt', form.headline || product.name);
      /* FormData, so no Content-Type header — the browser sets the
         multipart boundary and overriding it breaks the upload. */
      const token = localStorage.getItem('nexus_token');
      const r = await fetch(`${API}/catalogue/products/${product.id}/photos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not upload that image');
      setPhotos(p => [...p, d]);
      onSaved({ ...product, photo_count: (product.photo_count || 0) + 1 });
    } catch (e) { toast.error(e.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = async (id) => {
    try {
      await api(`/catalogue/photos/${id}`, { method: 'DELETE' });
      setPhotos(p => p.filter(x => x.id !== id));
      onSaved({ ...product, photo_count: Math.max(0, (product.photo_count || 1) - 1) });
    } catch (e) { toast.error(e.message); }
  };

  const togglePublish = async () => {
    try {
      const saved = await api(`/catalogue/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_published: !product.is_published }),
      });
      onSaved(saved);
      toast.success(saved.is_published ? 'Listed on your catalogue' : 'Hidden from your catalogue');
    } catch (e) { toast.error(e.message); }
  };

  const input = {
    width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)', borderRadius: 8,
    color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
  };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const hint = { fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 };

  return (
    <div role="dialog" aria-label={`Edit ${product.name}`} onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(520px, 100%)', height: '100%', overflowY: 'auto',
        background: 'var(--bg-surface)', padding: 22, display: 'grid', gap: 14, alignContent: 'start',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {product.name}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {product.sku_code} · {product.unit || 'nos'}
              {product.price != null && ` · ₹${Number(product.price).toLocaleString('en-IN')}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <button type="button" onClick={togglePublish} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700,
          background: product.is_published ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
          border: `1px solid ${product.is_published ? 'var(--brand-amber)' : 'var(--border-default)'}`,
          color: product.is_published ? 'var(--brand-amber)' : 'var(--text-muted)',
        }}>
          {product.is_published ? <><Eye size={14} /> Listed on your catalogue</> : <><EyeOff size={14} /> Hidden</>}
        </button>

        {/* ── photographs ── */}
        <div>
          <label style={lbl}>Photographs</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {photos.map(ph => (
              <div key={ph.id} style={{
                position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden',
                border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
              }}>
                <img src={`${API}/public/catalogue/photo/${ph.id}`} alt={ph.alt_text || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removePhoto(ph.id)} aria-label="Remove photograph"
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 6,
                    border: 'none', background: 'rgba(0,0,0,0.62)', color: '#fff',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {photos.length < 6 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{
                  aspectRatio: '1', borderRadius: 9, cursor: uploading ? 'default' : 'pointer',
                  border: '1.5px dashed var(--border-default)', background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600,
                }}>
                {uploading ? <Loader size={16} /> : <Upload size={16} />}
                {uploading ? 'Uploading…' : 'Add'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => upload(e.target.files?.[0])} />
          <p style={hint}>
            {photos.length === 0
              ? 'Without a photograph this product shows a grey placeholder on your catalogue.'
              : `${photos.length} of 6. The first one is used on the product grid.`}
          </p>
        </div>

        {/* ── the words a visitor reads ── */}
        <div>
          <label style={lbl}>Headline</label>
          <input style={input} value={form.headline} placeholder={product.name}
            onChange={e => set('headline', e.target.value)} />
          <p style={hint}>
            Shown instead of the internal name. “{product.name}” is written for whoever makes it;
            this is for whoever is deciding whether to ask.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Category</label>
            <input style={input} value={form.catalogue_category} placeholder="Line hardware"
              onChange={e => set('catalogue_category', e.target.value)} />
            <p style={hint}>Groups it into a filter on your page.</p>
          </div>
          <div>
            <label style={lbl}>Minimum order</label>
            <input style={input} type="number" value={form.moq} placeholder="100"
              onChange={e => set('moq', e.target.value)} />
            <p style={hint}>In {product.unit || 'nos'}. Prefills the quantity box.</p>
          </div>
        </div>

        <div>
          <label style={lbl}>What it is for</label>
          <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={form.use_case}
            placeholder="Distribution poles on 11kV lines"
            onChange={e => set('use_case', e.target.value)} />
        </div>

        <div>
          <label style={lbl}>Lead time</label>
          <input style={input} value={form.lead_time_note} placeholder="3 weeks from drawing approval"
            onChange={e => set('lead_time_note', e.target.value)} />
        </div>

        <div>
          <label style={lbl}>Web address</label>
          <input style={input} value={form.catalogue_slug} placeholder="11-kv-v-cross-arm"
            onChange={e => set('catalogue_slug', e.target.value)} />
          <p style={hint}>
            The end of this product’s own link. Changing it breaks any link already shared.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
