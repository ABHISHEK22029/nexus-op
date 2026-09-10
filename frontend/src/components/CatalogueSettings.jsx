/* ══════════════════════════════════════════════════════════
   Configure → Catalogue.

   Two jobs on one screen: the address people will open, and which of your
   products they will find there.

   Publishing is off until someone turns it on, and the link is shown with
   a copy button rather than described, because the whole point of this
   feature is a URL you paste into a WhatsApp group.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Store, Copy, Check, ExternalLink, Eye, EyeOff, Search } from 'lucide-react';

export default function CatalogueSettings({ api, toast }) {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');

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
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{
                fontSize: '0.8rem', padding: '7px 10px', borderRadius: 7, background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', wordBreak: 'break-all',
              }}>{url}</code>
              <button type="button" onClick={() => {
                navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800);
              }} className="btn-secondary btn-sm" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
              </button>
              <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"
                style={{ textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <ExternalLink size={13} /> Open
              </a>
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
            <input style={input} value={s.slug || ''} placeholder="kirashi"
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
          <input style={input} value={s.headline || ''} placeholder="Fabricated galvanized materials"
            onChange={e => setS({ ...s, headline: e.target.value })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>A line underneath</label>
          <input style={input} value={s.subhead || ''} placeholder="11kV line hardware, made to spec"
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
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a product"
              style={{ ...input, paddingLeft: 28, width: 200 }} />
          </div>
        </div>

        {products.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No products yet. Add them under <strong>Stock → Products</strong>, then publish them here.
          </p>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {shown.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px',
                borderTop: i ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.headline || p.name}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    {p.sku_code}{p.catalogue_slug ? ` · /c/${s.slug}/${p.catalogue_slug}` : ''}
                  </div>
                </div>
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
    </div>
  );
}
