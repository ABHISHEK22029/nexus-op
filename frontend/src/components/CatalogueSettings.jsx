/* ══════════════════════════════════════════════════════════
   Configure → Catalogue.

   Two jobs on one screen: the address people will open, and which of your
   products they will find there.

   Publishing is off until someone turns it on, and the link is shown with
   a copy button rather than described, because the whole point of this
   feature is a URL you paste into a WhatsApp group.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Store, Check, ExternalLink, Eye, EyeOff, Search, Share2, MessageCircle, Mail, Pencil, Plus, Image as ImageIcon } from 'lucide-react';
import CatalogueProductEditor from './CatalogueProductEditor';
import Thumb from './CatalogueThumb';
import CatalogueAddProduct from './CatalogueAddProduct';

export default function CatalogueSettings({ api, toast }) {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const [cfg, list] = await Promise.all([
        api('/catalogue/settings'),
        api('/catalogue/products').catch(() => []),
      ]);
      setS(cfg); setProducts(Array.isArray(list) ? list : []);
    } catch (e) { toast.error(e.message); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async (patch = {}) => {
    setSaving(true);
    try {
      const next = { ...s, ...patch };
      const saved = await api('/catalogue/settings', { method: 'PUT', body: JSON.stringify(next) });
      setS({ exists: true, ...saved });
      toast.success(patch.is_published === true ? 'Catalogue is live'
        : patch.is_published === false ? 'Catalogue taken down' : 'Saved');
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  const toggleProduct = async (p) => {
    try {
      const r = await api(`/catalogue/products/${p.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_published: !p.is_published }),
      });
      setProducts(ps => ps.map(x => x.id === p.id ? { ...x, ...r } : x));
    } catch (e) { toast.error(e.message); }
  };

  if (!s) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  const url = `${window.location.origin}/c/${s.slug || ''}`;
  /* Their own words where they have written them — a message that says what
     the business makes travels better than a bare link. */
  const shareText = s.headline
    ? `${s.headline} — our catalogue`
    : 'Our catalogue — see what we make';

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: shareText, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1900);
    } catch { toast.error('Could not copy — select the address above instead.'); }
  };
  const shown = products.filter(p =>
    !q || `${p.name} ${p.sku_code || ''} ${p.headline || ''}`.toLowerCase().includes(q.toLowerCase()));
  const publishedCount = products.filter(p => p.is_published).length;

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* ── live or not ── */}
      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: s.is_published ? 'hsl(160,84%,39%,0.14)' : 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        }}>
          <Store size={18} style={{ color: s.is_published ? 'var(--accent-emerald)' : 'var(--text-muted)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            {s.is_published ? 'Your catalogue is live' : 'Your catalogue is not published'}
          </div>
          <p style={{ margin: '3px 0 10px', fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {s.is_published
              ? `Anyone with the link can see the ${publishedCount} product${publishedCount === 1 ? '' : 's'} you have published, and send you an enquiry.`
              : 'Nothing is public until you turn this on. Set the address below first.'}
          </p>
          {s.is_published && s.slug && (
            <div style={{ display: 'grid', gap: 8 }}>
              <code style={{
                fontSize: '0.82rem', padding: '9px 11px', borderRadius: 8, background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', wordBreak: 'break-all',
                fontFamily: 'var(--font-mono)',
              }}>{url}</code>

              {/* Sharing is the point of the whole feature, so it gets real
                  controls rather than a URL to select by hand.

                  WhatsApp first and deliberately: for an Indian SME this is
                  where a catalogue link actually travels, and wa.me with the
                  text prefilled means one tap to a customer or a group. The
                  device's own share sheet sits behind "Share" where the
                  browser offers one, and copying is the fallback that works
                  everywhere. */}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
                    borderRadius: 8, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700,
                    background: '#25D366', color: '#fff',
                  }}>
                  <MessageCircle size={14} /> Share on WhatsApp
                </a>

                <button type="button" onClick={share} className="btn-secondary btn-sm"
                  style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  {copied ? <><Check size={13} /> Copied</> : <><Share2 size={13} /> Share</>}
                </button>

                <a href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`}
                  className="btn-secondary btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <Mail size={13} /> Email
                </a>

                <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <ExternalLink size={13} /> Open
                </a>
              </div>
            </div>
          )}
        </div>
        <button type="button" disabled={saving || !s.slug} onClick={() => save({ is_published: !s.is_published })}
          style={{
            flexShrink: 0, minWidth: 104, padding: '8px 12px', borderRadius: 8, cursor: s.slug ? 'pointer' : 'not-allowed',
            fontSize: '0.82rem', fontWeight: 700, opacity: s.slug ? 1 : 0.5,
            background: s.is_published ? 'hsl(160,84%,39%,0.12)' : 'var(--bg-elevated)',
            border: `1px solid ${s.is_published ? 'var(--accent-emerald)' : 'var(--border-default)'}`,
            color: s.is_published ? 'var(--accent-emerald)' : 'var(--text-muted)',
          }}>
          {s.is_published ? 'Live' : 'Publish'}
        </button>
      </div>

      {/* ── the page itself ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12, color: 'var(--text-primary)' }}>The page</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Web address</label>
            {/* Neutral placeholders. These ship to every business that uses
                the product, so an example taken from one customer's name
                would appear as the suggestion in all of them — the backend
                already proposes a slug from their own company name. */}
            <input style={input} value={s.slug || ''} placeholder="your-company"
              onChange={e => setS({ ...s, slug: e.target.value })} />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Lower case, no spaces. This is what people will see in the link.
            </p>
          </div>
          <div>
            <label style={lbl}>Where enquiries should go</label>
            <input style={input} type="email" value={s.enquiry_email || ''} placeholder="sales@yourcompany.com"
              onChange={e => setS({ ...s, enquiry_email: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>WhatsApp number</label>
            <input style={input} value={s.whatsapp_number || ''} placeholder="98866 44456"
              onChange={e => setS({ ...s, whatsapp_number: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Headline</label>
          <input style={input} value={s.headline || ''} placeholder="What you make, in your words"
            onChange={e => setS({ ...s, headline: e.target.value })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>A line underneath</label>
          <input style={input} value={s.subhead || ''} placeholder="A line of detail underneath"
            onChange={e => setS({ ...s, subhead: e.target.value })} />
        </div>

        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!s.show_prices} style={{ marginTop: 3 }}
            onChange={e => setS({ ...s, show_prices: e.target.checked })} />
          <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Show prices publicly.</strong> Off by default —
            fabricated work is usually priced against a drawing and a tonnage, and a number on a public
            page is one you may be held to.
          </span>
        </label>

        <button type="button" disabled={saving} onClick={() => save()} className="btn-primary btn-sm" style={{ marginTop: 14 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── which products ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            What appears — {publishedCount} of {products.length} published
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a product"
                style={{ ...input, paddingLeft: 28, width: 180 }} />
            </div>
            <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"
              style={{ display: 'inline-flex', gap: 5, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Add product
            </button>
          </div>
        </div>

        {products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
              Nothing to show on your catalogue yet.
            </p>
            <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"
              style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <Plus size={14} /> Add your first product
            </button>
          </div>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {shown.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px',
                borderTop: i ? '1px solid var(--border-subtle)' : 'none',
              }}>
                {/* A thumbnail, because "does this one have a photograph"
                    is the question this list is most often opened to
                    answer, and a row of grey squares says it at a glance. */}
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.photo_id
                    ? <Thumb photoId={p.photo_id} />
                    : <ImageIcon size={15} style={{ color: 'var(--text-disabled)' }} />}
                </div>

                <div onClick={() => setEditing(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.headline || p.name}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    {p.sku_code}
                    {p.catalogue_category ? ` · ${p.catalogue_category}` : ''}
                    {p.photo_count ? ` · ${p.photo_count} photo${p.photo_count > 1 ? 's' : ''}` : ' · no photo'}
                  </div>
                </div>

                <button type="button" onClick={() => setEditing(p)} className="btn-secondary btn-sm"
                  style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: '0.76rem' }}>
                  <Pencil size={12} /> Edit
                </button>

                <button type="button" onClick={() => toggleProduct(p)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7,
                  fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                  background: p.is_published ? 'hsl(28,100%,54%,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${p.is_published ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                  color: p.is_published ? 'var(--brand-amber)' : 'var(--text-muted)',
                }}>
                  {p.is_published ? <><Eye size={12} /> Listed</> : <><EyeOff size={12} /> Hidden</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* One editor for whichever row is open. Rendered here rather than
          per row so a hundred products do not each mount a drawer. */}
      <CatalogueAddProduct
        open={adding} api={api} toast={toast}
        onClose={() => setAdding(false)}
        onCreated={(made) => {
          setProducts(ps => [made, ...ps]);
          /* Straight into the editor: a product with no photograph and no
             headline is not yet worth publishing, and this is the moment
             somebody is willing to write both. */
          setEditing(made);
        }}
      />

      <CatalogueProductEditor
        product={editing} api={api} toast={toast}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setProducts(ps => ps.map(x => x.id === saved.id ? { ...x, ...saved } : x));
          setEditing(e => (e && e.id === saved.id ? { ...e, ...saved } : e));
        }}
      />
    </div>
  );
}
