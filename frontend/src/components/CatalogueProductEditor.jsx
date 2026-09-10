/* ══════════════════════════════════════════════════════════
   Editing one product's catalogue entry.

   Everything a visitor reads about a product is set here: the headline
   they see instead of the internal part name, what it is for, the
   minimum order, the lead time, its category, its web address, and its
   photographs.

   ── on the layout ──────────────────────────────────────────
   The first version was a stack of identical boxes with a paragraph of
   help under each — every field shouting equally, and more explanation
   than form. It read as a settings dump rather than something you fill
   in.

   Grouped now, in the order the work actually happens: the photograph
   first, because that is what the page looks empty without; then the
   words a customer reads; then the trade terms, which are short and
   belong side by side; then the link, tucked at the end where it is
   rarely touched. Help text only where the field cannot explain itself.

   A live preview sits at the top, showing the card exactly as the public
   grid will render it — the point of every field on this screen is what
   that card ends up saying, so it should be visible while you type.

   Declared at module scope, not inside its parent: a component defined
   in another component's body is rebuilt on every render, React unmounts
   the subtree, and the caret jumps out of whatever field is being typed
   in. That is the bug the vendor form had.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Image as ImageIcon, Eye, EyeOff, Package, Loader } from 'lucide-react';
import CatalogueThumb from './CatalogueThumb';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function CatalogueProductEditor({ product, api, toast, onClose, onSaved }) {
  const [form, setForm] = useState({
    headline: '', catalogue_category: '', use_case: '',
    moq: '', lead_time_note: '', catalogue_slug: '',
  });
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  /* Keyed on the product's id and nothing else.
   *
     It depended on `product` and `api`. `api` is built inline by the
     parent, so it is a new function on every render; `product` is replaced
     whenever a save updates the row. Either one re-ran this effect, and
     re-running it calls setForm and throws away whatever is half-typed —
     everything went to the server empty. */
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
    if (!/^image\//.test(file.type)) { toast.error('That is not an image. JPEG, PNG or WebP.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('alt', form.headline || product.name);
      /* No Content-Type header with FormData — the browser sets the
         multipart boundary, and overriding it breaks the upload. */
      const token = localStorage.getItem('nexus_token');
      const r = await fetch(`${API}/catalogue/products/${product.id}/photos`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not upload that image');
      setPhotos(p => [...p, d]);
      onSaved({ ...product, photo_count: (product.photo_count || 0) + 1, photo_id: product.photo_id || d.id });
    } catch (e) { toast.error(e.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = async (id) => {
    try {
      await api(`/catalogue/photos/${id}`, { method: 'DELETE' });
      const left = photos.filter(x => x.id !== id);
      setPhotos(left);
      onSaved({ ...product, photo_count: left.length, photo_id: left[0]?.id ?? null });
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
    width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)', borderRadius: 9,
    color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none',
  };
  const lbl = {
    display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const hint = { fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 };
  const section = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, padding: 16,
  };
  const sectionTitle = {
    fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
    color: 'var(--brand-amber)', marginBottom: 12,
  };

  return (
    <div role="dialog" aria-label={`Edit ${product.name}`} onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100%)', height: '100%', overflowY: 'auto',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }}>
        {/* ── header, sticky so Save is always reachable ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)', padding: '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{product.name}</h2>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {product.sku_code} · {product.unit || 'nos'}
              {product.price != null && ` · ${rupee(product.price)}`}
            </p>
          </div>
          <button type="button" onClick={togglePublish} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            borderRadius: 8, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: product.is_published ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
            border: `1px solid ${product.is_published ? 'var(--brand-amber)' : 'var(--border-default)'}`,
            color: product.is_published ? 'var(--brand-amber)' : 'var(--text-muted)',
          }}>
            {product.is_published ? <><Eye size={13} /> Listed</> : <><EyeOff size={13} /> Hidden</>}
          </button>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start' }}>
          {/* ── what the customer will see ──
              A live preview of the card the public grid renders. Every
              field below exists to change this, so it should be visible
              while they are being changed. */}
          <div style={{ ...section, display: 'flex', gap: 14 }}>
            <div style={{
              width: 92, height: 70, borderRadius: 9, flexShrink: 0, overflow: 'hidden',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {photos[0]
                ? <CatalogueThumb photoId={photos[0].id} alt="" />
                : <Package size={20} style={{ color: 'var(--text-disabled)' }} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                On your catalogue this reads:
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {form.headline || product.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {form.use_case || <em style={{ color: 'var(--text-disabled)' }}>no description yet</em>}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 5 }}>
                {form.moq ? `MOQ ${form.moq} ${product.unit || ''}` : product.unit}
                {form.lead_time_note ? ` · ${form.lead_time_note}` : ''}
              </div>
            </div>
          </div>

          {/* ── photographs ── */}
          <div style={section}>
            <div style={sectionTitle}>Photographs</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
              {photos.map((ph, i) => (
                <div key={ph.id} style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden',
                  border: `1px solid ${i === 0 ? 'var(--brand-amber)' : 'var(--border-subtle)'}`,
                  background: 'var(--bg-surface)',
                }}>
                  <CatalogueThumb photoId={ph.id} alt={ph.alt_text || ''} />
                  {i === 0 && (
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: '0.62rem',
                      fontWeight: 800, textAlign: 'center', padding: '2px 0',
                      background: 'var(--brand-amber)', color: '#fff',
                    }}>MAIN</span>
                  )}
                  <button onClick={() => removePhoto(ph.id)} aria-label="Remove photograph"
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6,
                      border: 'none', background: 'rgba(0,0,0,0.62)', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}

              {photos.length < 6 && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{
                    aspectRatio: '1', borderRadius: 9, cursor: uploading ? 'default' : 'pointer',
                    border: '1.5px dashed var(--border-default)', background: 'var(--bg-surface)',
                    color: 'var(--text-muted)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700,
                  }}>
                  {uploading ? <Loader size={16} /> : <Upload size={16} />}
                  {uploading ? 'Uploading' : 'Add'}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => upload(e.target.files?.[0])} />
            <p style={hint}>
              {photos.length === 0
                ? 'Without one, this product shows a grey placeholder.'
                : `${photos.length} of 6 · the first is used on the grid.`}
            </p>
          </div>

          {/* ── the words a customer reads ── */}
          <div style={section}>
            <div style={sectionTitle}>What a customer reads</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={lbl}>Headline</label>
                <input style={input} value={form.headline} placeholder={product.name}
                  onChange={e => set('headline', e.target.value)} />
                <p style={hint}>
                  Shown instead of the internal name. Leave it blank to use “{product.name}”.
                </p>
              </div>
              <div>
                <label style={lbl}>What it is for</label>
                <textarea style={{ ...input, minHeight: 62, resize: 'vertical' }} value={form.use_case}
                  placeholder="Distribution poles on 11kV lines"
                  onChange={e => set('use_case', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── trade terms, short and side by side ── */}
          <div style={section}>
            <div style={sectionTitle}>Terms</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>Category</label>
                <input style={input} value={form.catalogue_category} placeholder="Line hardware"
                  onChange={e => set('catalogue_category', e.target.value)} />
                <p style={hint}>Becomes a filter.</p>
              </div>
              <div>
                <label style={lbl}>Minimum order</label>
                <input style={input} type="number" value={form.moq} placeholder="100"
                  onChange={e => set('moq', e.target.value)} />
                <p style={hint}>In {product.unit || 'nos'}.</p>
              </div>
              <div>
                <label style={lbl}>Lead time</label>
                <input style={input} value={form.lead_time_note} placeholder="3 weeks from approval"
                  onChange={e => set('lead_time_note', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── the link, last, because it is rarely touched ── */}
          <div style={section}>
            <div style={sectionTitle}>Link</div>
            <input style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              value={form.catalogue_slug} placeholder="11-kv-v-cross-arm"
              onChange={e => set('catalogue_slug', e.target.value)} />
            <p style={hint}>
              The end of this product’s own address. Changing it breaks any link already shared.
            </p>
          </div>
        </div>

        {/* ── sticky footer, so Save is reachable without scrolling back ── */}
        <div style={{
          position: 'sticky', bottom: 0, background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)', padding: '14px 20px',
          display: 'flex', gap: 8, marginTop: 'auto',
        }}>
          <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
