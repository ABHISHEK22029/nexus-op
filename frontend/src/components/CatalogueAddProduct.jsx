/* ══════════════════════════════════════════════════════════
   Adding a product to the catalogue — the whole product.

   The first version asked for four fields and told you the rest "comes
   next", which is not adding a product; it is starting one and making
   somebody finish it on a second screen. If a person is sitting down to
   put something on their catalogue they have the photograph, the size,
   the minimum order and the lead time in front of them. Ask once.

   Photographs are the reason this is not simply the editor reused. The
   upload endpoint needs a product id, and there is no product until the
   form is submitted — so the files are held here with local previews and
   sent after the product exists. The order on save is:

       create the product  →  write the catalogue fields  →  upload photos

   and if a photograph fails the product is still there, with a message
   naming what did not upload rather than a silent gap.

   Module scope, not nested inside the parent: a component declared in
   another component's body remounts on every render and the caret jumps
   out of whatever is being typed.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Upload, Trash2, Package } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const MAX_PHOTOS = 6;

const blank = {
  name: '', sku_code: '', unit: 'Nos', price: '', hsn: '',
  headline: '', catalogue_category: '', use_case: '',
  moq: '', lead_time_note: '', publish: true,
};

export default function CatalogueAddProduct({ open, api, toast, onClose, onCreated, categories = [] }) {
  const [form, setForm] = useState(blank);
  const [queued, setQueued] = useState([]);      // { file, url }
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  /* Object URLs are created for the previews and have to be released, or
     opening this dialog a dozen times leaves a dozen images in memory. */
  useEffect(() => () => queued.forEach(q => URL.revokeObjectURL(q.url)), [queued]);

  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addFiles = (files) => {
    const picked = [...files].filter(f => {
      if (!/^image\//.test(f.type)) { toast.error(`${f.name} is not an image.`); return false; }
      return true;
    });
    setQueued(q => {
      const room = MAX_PHOTOS - q.length;
      if (picked.length > room) toast.error(`${MAX_PHOTOS} photographs is the limit.`);
      return [...q, ...picked.slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))];
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeQueued = (i) => setQueued(q => {
    URL.revokeObjectURL(q[i].url);
    return q.filter((_, k) => k !== i);
  });

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('A product needs a name.'); return; }

    setBusy('Creating…');
    try {
      const made = await api('/skus', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          /* A code is genuinely optional — plenty of small fabricators do
             not run one — but a null makes the product hard to find later,
             so derive something legible from the name. */
          sku_code: form.sku_code.trim() || form.name.trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24),
          unit: form.unit.trim() || 'Nos',
          price: form.price === '' ? null : Number(form.price),
          hsn: form.hsn.trim() || null,
          description: form.use_case.trim() || null,
        }),
      });
      const id = made.id ?? made.sku?.id;
      if (!id) throw new Error('The product was created but returned no id.');

      /* The catalogue fields are a separate write because they live behind
         a different permission and a different validator. */
      setBusy('Saving details…');
      let saved = null;
      try {
        saved = await api(`/catalogue/products/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            headline: form.headline.trim() || null,
            catalogue_category: form.catalogue_category.trim() || null,
            use_case: form.use_case.trim() || null,
            moq: form.moq === '' ? null : form.moq,
            lead_time_note: form.lead_time_note.trim() || null,
            is_published: !!form.publish,
          }),
        });
      } catch (err) {
        /* The product exists; say what did not stick rather than implying
           the whole thing failed. */
        toast.error(`Added, but its catalogue details did not save: ${err.message}`);
      }

      const failed = [];
      for (const [i, q] of queued.entries()) {
        setBusy(`Uploading photograph ${i + 1} of ${queued.length}…`);
        try {
          const fd = new FormData();
          fd.append('file', q.file);
          fd.append('alt', form.headline.trim() || form.name.trim());
          const token = localStorage.getItem('nexus_token');
          const r = await fetch(`${API}/catalogue/products/${id}/photos`, {
            method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
          });
          if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'upload failed'); }
        } catch (err) { failed.push(q.file.name); }
      }
      if (failed.length) toast.error(`Added, but these did not upload: ${failed.join(', ')}`);
      else toast.success(`${form.name.trim()} added${form.publish ? ' and listed' : ''}`);

      onCreated({
        id,
        name: form.name.trim(),
        sku_code: saved?.sku_code ?? null,
        unit: form.unit.trim() || 'Nos',
        price: form.price === '' ? null : Number(form.price),
        headline: form.headline.trim() || null,
        catalogue_category: form.catalogue_category.trim() || null,
        use_case: form.use_case.trim() || null,
        moq: form.moq === '' ? null : Number(form.moq),
        lead_time_note: form.lead_time_note.trim() || null,
        catalogue_slug: saved?.catalogue_slug ?? null,
        is_published: !!form.publish,
        photo_count: queued.length - failed.length,
      });
      queued.forEach(q => URL.revokeObjectURL(q.url));
      setQueued([]); setForm(blank);
      onClose();
    } catch (err) { toast.error(err.message); }
    setBusy('');
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
  const block = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, padding: 16,
  };
  const blockTitle = {
    fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
    color: 'var(--brand-amber)', marginBottom: 12,
  };

  return (
    <div role="dialog" aria-label="Add a product" onClick={busy ? undefined : onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 85,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={create} style={{
        width: 'min(560px, 100%)', height: '100%', overflowY: 'auto',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)', padding: '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Add a product
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
              Everything in one place — photographs included.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start' }}>
          {/* ── photographs, first, because it is what the page looks empty without ── */}
          <div style={block}>
            <div style={blockTitle}>Photographs</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
              {queued.map((q, i) => (
                <div key={q.url} style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden',
                  border: `1px solid ${i === 0 ? 'var(--brand-amber)' : 'var(--border-subtle)'}`,
                }}>
                  <img src={q.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {i === 0 && (
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: '0.62rem',
                      fontWeight: 800, textAlign: 'center', padding: '2px 0',
                      background: 'var(--brand-amber)', color: '#fff',
                    }}>MAIN</span>
                  )}
                  <button type="button" onClick={() => removeQueued(i)} aria-label="Remove"
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6,
                      border: 'none', background: 'rgba(0,0,0,0.62)', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Trash2 size={11} /></button>
                </div>
              ))}
              {queued.length < MAX_PHOTOS && (
                <button type="button" onClick={() => fileRef.current?.click()} style={{
                  aspectRatio: '1', borderRadius: 9, cursor: 'pointer',
                  border: '1.5px dashed var(--border-default)', background: 'var(--bg-surface)',
                  color: 'var(--text-muted)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700,
                }}>
                  <Upload size={16} /> Add
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files || [])} />
            <p style={hint}>
              {queued.length === 0
                ? 'Without one, this product shows a grey placeholder. You can add several.'
                : `${queued.length} of ${MAX_PHOTOS} · the first is used on the grid.`}
            </p>
          </div>

          {/* ── what it is ── */}
          <div style={block}>
            <div style={blockTitle}>What it is</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={lbl}>Name *</label>
                <input style={input} value={form.name} autoFocus required
                  aria-label="Name" placeholder="11 KV V cross arm 75 × 40 × 6"
                  onChange={e => set('name', e.target.value)} />
                <p style={hint}>Your own name for it — the one whoever fabricates it would use.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
                <div>
                  <label style={lbl}>Code</label>
                  <input style={input} value={form.sku_code} aria-label="Code" placeholder="VC-01"
                    onChange={e => set('sku_code', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <input style={input} value={form.unit} aria-label="Unit" placeholder="Nos"
                    onChange={e => set('unit', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Rate ₹</label>
                  <input style={input} type="number" value={form.price} aria-label="Rate" placeholder="833"
                    onChange={e => set('price', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>HSN</label>
                  <input style={input} value={form.hsn} aria-label="HSN" placeholder="7308"
                    onChange={e => set('hsn', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── what a customer reads ── */}
          <div style={block}>
            <div style={blockTitle}>What a customer reads</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={lbl}>Headline</label>
                <input style={input} value={form.headline}
                  aria-label="Headline" placeholder={form.name || '11 KV V cross arm — 75 × 40 × 6 mm'}
                  onChange={e => set('headline', e.target.value)} />
                <p style={hint}>Shown instead of the name above. Leave blank to use the name.</p>
              </div>
              <div>
                <label style={lbl}>What it is for</label>
                <textarea style={{ ...input, minHeight: 62, resize: 'vertical' }} value={form.use_case}
                  aria-label="What it is for" placeholder="Distribution poles on 11kV lines"
                  onChange={e => set('use_case', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── terms ── */}
          <div style={block}>
            <div style={blockTitle}>Terms</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>Category</label>
                <input style={input} value={form.catalogue_category} aria-label="Category" placeholder="Line hardware"
                  list="catalogue-categories"
                  onChange={e => set('catalogue_category', e.target.value)} />
                {/* Their existing categories offered rather than imposed —
                    typing a new one is still the point. */}
                <datalist id="catalogue-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
                <p style={hint}>Becomes a filter.</p>
              </div>
              <div>
                <label style={lbl}>Minimum order</label>
                <input style={input} type="number" value={form.moq} aria-label="Minimum order" placeholder="100"
                  onChange={e => set('moq', e.target.value)} />
                <p style={hint}>In {form.unit || 'nos'}.</p>
              </div>
              <div>
                <label style={lbl}>Lead time</label>
                <input style={input} value={form.lead_time_note} aria-label="Lead time" placeholder="3 weeks from approval"
                  onChange={e => set('lead_time_note', e.target.value)} />
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', padding: '0 2px' }}>
            <input type="checkbox" checked={form.publish} style={{ marginTop: 3 }}
              onChange={e => set('publish', e.target.checked)} />
            <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>List it straight away.</strong>{' '}
              Untick to add it without putting it on your public page yet.
            </span>
          </label>
        </div>

        <div style={{
          position: 'sticky', bottom: 0, background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)', padding: '14px 20px',
          display: 'flex', gap: 8, alignItems: 'center', marginTop: 'auto',
        }}>
          <button type="submit" disabled={!!busy} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> {busy || 'Add product'}
          </button>
          <button type="button" onClick={onClose} disabled={!!busy} className="btn-secondary btn-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}
