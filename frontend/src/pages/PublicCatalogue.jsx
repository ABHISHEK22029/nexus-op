/* ══════════════════════════════════════════════════════════════════════
   The public catalogue — the one page in this product with no login.

   Somebody opens this from a WhatsApp message. They have no account, no
   token, and very likely a phone on a patchy connection. So:

     · it renders outside AppLayout — no nav, no permission context, no
       token read. Anything that assumes a signed-in user would crash here.
     · every request goes to /public/*, which answers strangers.
     · the identity is the BUSINESS's, taken from their own profile. A
       catalogue that looked like ours rather than theirs would be no use
       to someone selling to their own customers.

   The basket lives in memory only. A stranger's browser is not a place to
   keep a pending order, and asking them to sign in to enquire would defeat
   the point of a public page.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, Send, Plus, Minus, X, Phone, Globe, Mail, ArrowLeft, Check, Package } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function PublicCatalogue() {
  const { slug, productSlug } = useParams();
  const navigate = useNavigate();

  const [cat, setCat] = useState(null);
  const [product, setProduct] = useState(null);
  const [state, setState] = useState('loading');   // loading | ok | missing
  const [basket, setBasket] = useState([]);
  const [showBasket, setShowBasket] = useState(false);
  const [sent, setSent] = useState(null);
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setState('loading');
      try {
        const r = await fetch(`${API}/public/catalogue/${slug}`);
        if (!r.ok) { if (alive) setState('missing'); return; }
        const d = await r.json();
        if (!alive) return;
        setCat(d); setState('ok');
        document.title = d.company?.name ? `${d.company.name} — catalogue` : 'Catalogue';
      } catch { if (alive) setState('missing'); }
    })();
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!productSlug) { setProduct(null); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API}/public/catalogue/${slug}/${productSlug}`);
        if (alive) setProduct(r.ok ? await r.json() : null);
      } catch { if (alive) setProduct(null); }
    })();
    return () => { alive = false; };
  }, [slug, productSlug]);

  const add = (p, qty) => {
    setBasket(b => {
      const at = b.findIndex(i => i.id === p.id);
      if (at >= 0) {
        const next = [...b];
        next[at] = { ...next[at], quantity: Number(next[at].quantity || 0) + Number(qty || 1) };
        return next;
      }
      return [...b, {
        id: p.id, skuId: p.id,
        description: p.headline || p.name,
        quantity: Number(qty) || Number(p.moq) || 1,
        unit: p.unit || 'nos',
      }];
    });
    setShowBasket(true);
  };

  const send = async (e) => {
    e.preventDefault();
    setErr(''); setSending(true);
    try {
      const r = await fetch(`${API}/public/catalogue/${slug}/enquiry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: basket }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Something went wrong — please try again.'); setSending(false); return; }
      setSent(d.ref); setBasket([]);
    } catch {
      setErr('We could not reach the server. Check your connection and try again.');
    }
    setSending(false);
  };

  /* ── shells ───────────────────────────────────────────────── */
  if (state === 'loading') {
    return <Shell><p style={{ color: '#6b7280', textAlign: 'center', padding: 60 }}>Loading…</p></Shell>;
  }
  if (state === 'missing') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <Package size={40} style={{ color: '#9ca3af', marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
            This catalogue isn’t available
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            The link may be wrong, or the business may have taken it down.
          </p>
        </div>
      </Shell>
    );
  }

  const accent = cat.accent || '#EA580C';
  const co = cat.company || {};

  return (
    <Shell>
      {/* ── the business, not us ── */}
      <header style={{ padding: '26px 0 18px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {co.logo && <img src={co.logo} alt="" style={{ height: 38, width: 'auto' }} />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>{co.name || 'Catalogue'}</div>
            {co.website && (
              <a href={co.website} style={{ fontSize: '0.78rem', color: '#6b7280', textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Globe size={11} /> {String(co.website).replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          {basket.length > 0 && (
            <button onClick={() => setShowBasket(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px',
              borderRadius: 8, border: 'none', background: accent, color: '#fff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}>
              <ShoppingBag size={15} /> {basket.length} item{basket.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </header>

      {product ? (
        <ProductView product={product} accent={accent} showPrices={cat.showPrices}
          onBack={() => navigate(`/c/${slug}`)} onAdd={add} />
      ) : (
        <>
          <section style={{ padding: '34px 0 28px' }}>
            <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.2, textWrap: 'balance' }}>
              {cat.headline || co.name}
            </h1>
            {cat.subhead && (
              <p style={{ color: '#4b5563', fontSize: '1rem', marginTop: 10, maxWidth: '60ch', lineHeight: 1.55 }}>
                {cat.subhead}
              </p>
            )}
          </section>

          {cat.products.length === 0 ? (
            <p style={{ color: '#6b7280', padding: '40px 0', textAlign: 'center' }}>
              Nothing is listed here yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, paddingBottom: 40 }}>
              {cat.products.map(p => (
                <ProductCard key={p.id} p={p} slug={slug} accent={accent}
                  showPrices={cat.showPrices} onAdd={add} onOpen={() => navigate(`/c/${slug}/${p.slug}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── contact strip ── */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '20px 0 40px', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.83rem', color: '#4b5563' }}>
        {co.phone && <a href={`tel:${co.phone}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Phone size={13} /> {co.phone}</a>}
        {co.email && <a href={`mailto:${co.email}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Mail size={13} /> {co.email}</a>}
        {cat.whatsapp && (
          <a href={`https://wa.me/${String(cat.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            style={{ color: '#059669', fontWeight: 700, textDecoration: 'none' }}>
            WhatsApp us
          </a>
        )}
      </footer>

      {showBasket && (
        <BasketPanel
          basket={basket} setBasket={setBasket} accent={accent} sent={sent}
          form={form} setForm={setForm} onSend={send} sending={sending} err={err}
          onClose={() => { setShowBasket(false); if (sent) setSent(null); }}
        />
      )}
    </Shell>
  );
}

/* A light, self-contained page. It deliberately does not use the app's
   theme tokens: those follow the signed-in user's dark/light preference,
   and this page has no signed-in user. */
const Shell = ({ children }) => (
  <div style={{ minHeight: '100vh', background: '#fff', color: '#111827',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px' }}>{children}</div>
  </div>
);

function ProductCard({ p, accent, showPrices, onAdd, onOpen }) {
  const [qty, setQty] = useState(p.moq || 1);
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer', aspectRatio: '4/3', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.photo_id
          ? <img src={`${API}/public/catalogue/photo/${p.photo_id}`} alt={p.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Package size={30} style={{ color: '#d1d5db' }} />}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div onClick={onOpen} style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.35 }}>
          {p.headline || p.name}
        </div>
        {p.use_case && <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.45 }}>{p.use_case}</div>}
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 'auto', paddingTop: 6 }}>
          {showPrices && p.price != null && <strong style={{ color: '#111827' }}>{rupee(p.price)} / {p.unit} · </strong>}
          {p.moq ? `MOQ ${p.moq} ${p.unit || ''}` : ''}{p.lead_time_note ? ` · ${p.lead_time_note}` : ''}
        </div>
        {/* The quantity control and the add button are one thing: a person
            deciding how many is already deciding to ask. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input type="number" value={qty} min={p.moq || 1}
            onChange={e => setQty(e.target.value)}
            aria-label={`Quantity of ${p.name}`}
            style={{ width: 78, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.83rem' }} />
          <button onClick={() => onAdd(p, qty)} style={{
            flex: 1, padding: '7px 10px', borderRadius: 7, border: `1px solid ${accent}`,
            background: '#fff', color: accent, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
          }}>Add to enquiry</button>
        </div>
      </div>
    </div>
  );
}

function ProductView({ product: p, accent, showPrices, onBack, onAdd }) {
  const [qty, setQty] = useState(p.moq || 1);
  return (
    <div style={{ padding: '26px 0 40px' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.83rem', padding: 0, marginBottom: 18 }}>
        <ArrowLeft size={14} /> All products
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
        <div>
          {(p.photos || []).length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {p.photos.map(ph => (
                <img key={ph.id} src={`${API}/public/catalogue/photo/${ph.id}`} alt={ph.alt_text || p.name}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #e5e7eb' }} />
              ))}
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: '#f9fafb', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={40} style={{ color: '#d1d5db' }} />
            </div>
          )}
        </div>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{p.headline || p.name}</h1>
          {p.headline && p.name !== p.headline && (
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>{p.name}</p>
          )}
          {p.use_case && <p style={{ color: '#374151', marginTop: 14, lineHeight: 1.6 }}>{p.use_case}</p>}
          {p.description && <p style={{ color: '#4b5563', marginTop: 10, lineHeight: 1.6, fontSize: '0.9rem' }}>{p.description}</p>}

          <dl style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
            {showPrices && p.price != null && (<><dt style={dt}>Price</dt><dd style={dd}>{rupee(p.price)} / {p.unit}</dd></>)}
            {p.unit && (<><dt style={dt}>Unit</dt><dd style={dd}>{p.unit}</dd></>)}
            {p.moq && (<><dt style={dt}>Minimum order</dt><dd style={dd}>{p.moq} {p.unit}</dd></>)}
            {p.lead_time_note && (<><dt style={dt}>Lead time</dt><dd style={dd}>{p.lead_time_note}</dd></>)}
            {p.hsn && (<><dt style={dt}>HSN</dt><dd style={dd}>{p.hsn}</dd></>)}
          </dl>

          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <input type="number" value={qty} min={p.moq || 1} onChange={e => setQty(e.target.value)}
              aria-label="Quantity" style={{ width: 100, padding: '10px 11px', border: '1px solid #d1d5db', borderRadius: 8 }} />
            <button onClick={() => onAdd(p, qty)} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', background: accent,
              color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}>Add to enquiry</button>
          </div>
        </div>
      </div>
    </div>
  );
}
const dt = { color: '#6b7280', fontWeight: 600 };
const dd = { margin: 0, color: '#111827', fontWeight: 600 };

function BasketPanel({ basket, setBasket, accent, sent, form, setForm, onSend, sending, err, onClose }) {
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem' };
  return (
    <div role="dialog" aria-label="Your enquiry" style={{
      position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 50,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(440px, 100%)', background: '#fff', height: '100%',
        overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, flex: 1 }}>
            {sent ? 'Enquiry sent' : 'Your enquiry'}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, marginBottom: 8 }}>
              <Check size={18} /> {sent}
            </div>
            <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: '0.92rem' }}>
              Thank you — we have your enquiry and someone will be in touch.
              Quote <strong>{sent}</strong> if you call.
            </p>
          </div>
        ) : (
          <>
            {basket.length === 0 && <p style={{ color: '#6b7280' }}>Nothing added yet.</p>}
            {basket.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
                <div style={{ flex: 1, fontSize: '0.88rem' }}>{i.description}</div>
                <input type="number" value={i.quantity} aria-label={`Quantity of ${i.description}`}
                  onChange={e => setBasket(b => b.map((x, k) => k === idx ? { ...x, quantity: e.target.value } : x))}
                  style={{ width: 74, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                <span style={{ fontSize: '0.78rem', color: '#6b7280', width: 34 }}>{i.unit}</span>
                <button onClick={() => setBasket(b => b.filter((_, k) => k !== idx))} aria-label="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={15} /></button>
              </div>
            ))}

            {basket.length > 0 && (
              <form onSubmit={onSend} style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                <input style={inp} placeholder="Your name *" value={form.name} required
                  onChange={e => setForm({ ...form, name: e.target.value })} />
                <input style={inp} placeholder="Company" value={form.company}
                  onChange={e => setForm({ ...form, company: e.target.value })} />
                <input style={inp} placeholder="Phone" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
                <input style={inp} type="email" placeholder="Email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
                <textarea style={{ ...inp, minHeight: 76, resize: 'vertical' }} placeholder="Anything we should know — site, timeline, drawings"
                  value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  A phone number or an email — otherwise we cannot reply.
                </p>
                {err && <p style={{ color: '#dc2626', fontSize: '0.83rem', margin: 0 }}>{err}</p>}
                <button type="submit" disabled={sending} style={{
                  padding: '11px 16px', borderRadius: 8, border: 'none', background: accent,
                  color: '#fff', fontWeight: 700, cursor: sending ? 'default' : 'pointer',
                  opacity: sending ? 0.7 : 1, display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Send size={15} /> {sending ? 'Sending…' : 'Send enquiry'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
