/* ══════════════════════════════════════════════════════════════════════
   The public catalogue — the one page in this product with no login.

   Somebody opens this from a WhatsApp message. They have no account, no
   token, and very likely a phone on a site connection. So:

     · it renders outside AppLayout — no nav, no permission context, no
       token read. Anything assuming a signed-in user would crash here.
     · every request goes to /public/*, which answers strangers.
     · the identity is the BUSINESS's, from their own profile. A catalogue
       that looked like ours would be no use to someone selling to their
       own customers.

   Structure follows kirashi.co.in, which is the reference: a strong hero,
   a restrained palette, bold headings over supporting copy — and, the part
   worth copying, A TOOL ON THE PAGE rather than a brochure. That site's
   live metal rates and GST calculator are what make it useful. Here the
   equivalent is the quantity control: type how many you need, see the
   indicative figure, and the same control puts it in the enquiry. One
   widget doing two jobs.

   Structure and restraint are taken; the skin is not. Colour comes from
   the organisation's own accent, because every business using this would
   otherwise get a page that looks like somebody else's.

   The basket lives in memory. A stranger's browser is not a place to keep
   a pending order, and asking them to sign in would defeat the point.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Send, X, Phone, Globe, Mail, ArrowLeft, Check, Package, Search,
  ChevronLeft, ChevronRight, MessageCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PAGE = 24;

const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PublicCatalogue() {
  const { slug, productSlug } = useParams();
  const navigate = useNavigate();

  const [cat, setCat] = useState(null);
  const [product, setProduct] = useState(null);
  const [state, setState] = useState('loading');
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [basket, setBasket] = useState([]);
  const [showBasket, setShowBasket] = useState(false);
  const [sent, setSent] = useState(null);
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  const fetchPage = useCallback(async (off, search) => {
    setBusy(true);
    try {
      const url = `${API}/public/catalogue/${slug}?limit=${PAGE}&offset=${off}` +
        (search ? `&q=${encodeURIComponent(search)}` : '');
      const r = await fetch(url);
      if (!r.ok) { setState('missing'); return; }
      const d = await r.json();
      setCat(d); setState('ok');
      document.title = d.company?.name ? `${d.company.name} — what we make` : 'Catalogue';
    } catch { setState('missing'); }
    setBusy(false);
  }, [slug]);

  useEffect(() => { fetchPage(offset, query); }, [fetchPage, offset, query]);

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
      const at = b.findIndex(i => i.skuId === p.id);
      if (at >= 0) {
        const next = [...b];
        next[at] = { ...next[at], quantity: Number(next[at].quantity || 0) + (Number(qty) || 1) };
        return next;
      }
      return [...b, {
        skuId: p.id, description: p.headline || p.name,
        quantity: Number(qty) || Number(p.moq) || 1,
        unit: p.unit || 'nos', price: p.price,
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

  if (state === 'loading') return <Shell><Center>Loading…</Center></Shell>;
  if (state === 'missing') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '90px 20px' }}>
          <Package size={38} style={{ color: '#c4c9d0', marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 6px' }}>This catalogue isn’t available</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            The link may be wrong, or the business may have taken it down.
          </p>
        </div>
      </Shell>
    );
  }

  const accent = cat.accent || '#EA580C';
  const co = cat.company || {};
  const pages = Math.ceil((cat.total || 0) / PAGE);
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <Shell>
      {/* ══ header ══ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)', borderBottom: '1px solid #e8eaed',
      }}>
        <Wrap style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px' }}>
          {co.logo && <img src={co.logo} alt="" style={{ height: 30 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
              {co.name || 'Catalogue'}
            </div>
          </div>
          {cat.whatsapp && (
            <a href={`https://wa.me/${String(cat.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                border: '1px solid #d7dbe0', borderRadius: 8, color: '#111827',
                textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600,
              }}>
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
          <button onClick={() => setShowBasket(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
            borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
            background: basket.length ? accent : '#f1f3f5', color: basket.length ? '#fff' : '#5b6470',
          }}>
            <ShoppingBag size={15} />
            {basket.length ? `${basket.length} in enquiry` : 'Enquiry'}
          </button>
        </Wrap>
      </header>

      {product ? (
        <Wrap style={{ padding: '0 20px' }}>
          <ProductView product={product} accent={accent} showPrices={cat.showPrices}
            onBack={() => navigate(`/c/${slug}`)} onAdd={add} />
        </Wrap>
      ) : (
        <>
          {/* ══ hero — bold heading over supporting copy ══ */}
          <section style={{ borderBottom: '1px solid #e8eaed', background: '#fafbfc' }}>
            <Wrap style={{ padding: '56px 20px 46px' }}>
              <div style={{
                display: 'inline-block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: accent, marginBottom: 14,
              }}>
                What we make
              </div>
              <h1 style={{
                fontSize: 'clamp(1.9rem, 5vw, 3rem)', fontWeight: 800, margin: 0,
                lineHeight: 1.08, letterSpacing: '-0.025em', textWrap: 'balance', maxWidth: '18ch',
              }}>
                {cat.headline || co.name}
              </h1>
              {cat.subhead && (
                <p style={{ color: '#4b5563', fontSize: '1.05rem', marginTop: 16, maxWidth: '54ch', lineHeight: 1.6 }}>
                  {cat.subhead}
                </p>
              )}
              <div style={{ display: 'flex', gap: 22, marginTop: 26, flexWrap: 'wrap', fontSize: '0.85rem', color: '#6b7280' }}>
                {/* The catalogue's size, not the search result's. Searching
                    for one item should not make the business look like it
                    only makes one thing. */}
                <Stat n={cat.catalogueTotal ?? cat.total}
                  label={(cat.catalogueTotal ?? cat.total) === 1 ? 'product listed' : 'products listed'}
                  accent={accent} />
                {co.phone && <Stat n="" label={co.phone} accent={accent} icon={Phone} />}
              </div>
            </Wrap>
          </section>

          {/* ══ search ══ */}
          <Wrap style={{ padding: '22px 20px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <form onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(q); }}
              style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 420 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9aa1a9' }} />
              <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search products"
                placeholder="Search — size, description, code"
                style={{
                  width: '100%', padding: '11px 12px 11px 34px', border: '1px solid #d7dbe0',
                  borderRadius: 9, fontSize: '0.88rem', outline: 'none', background: '#fff',
                }} />
            </form>
            {query && (
              <button onClick={() => { setQ(''); setQuery(''); setOffset(0); }}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.82rem' }}>
                Clear “{query}”
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280' }}>
              {cat.total} {cat.total === 1 ? 'product' : 'products'}
              {pages > 1 && ` · page ${page} of ${pages}`}
            </span>
          </Wrap>

          {/* ══ grid ══ */}
          <Wrap style={{ padding: '18px 20px 30px' }}>
            {cat.products.length === 0 ? (
              <Center>
                {query ? `Nothing matches “${query}”.` : 'Nothing is listed here yet.'}
              </Center>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 16,
                opacity: busy ? 0.55 : 1, transition: 'opacity 120ms',
              }}>
                {cat.products.map(p => (
                  <ProductCard key={p.id} p={p} accent={accent} showPrices={cat.showPrices}
                    onAdd={add} onOpen={() => navigate(`/c/${slug}/${p.slug}`)} />
                ))}
              </div>
            )}

            {pages > 1 && (
              <nav aria-label="Pages" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 30 }}>
                <PageBtn disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  <ChevronLeft size={15} /> Previous
                </PageBtn>
                <span style={{ fontSize: '0.83rem', color: '#6b7280', minWidth: 96, textAlign: 'center' }}>
                  {page} of {pages}
                </span>
                <PageBtn disabled={page >= pages} onClick={() => setOffset(offset + PAGE)}>
                  Next <ChevronRight size={15} />
                </PageBtn>
              </nav>
            )}
          </Wrap>
        </>
      )}

      <footer style={{ borderTop: '1px solid #e8eaed', background: '#fafbfc' }}>
        <Wrap style={{ padding: '26px 20px 44px', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.85rem', color: '#4b5563' }}>
          <div style={{ fontWeight: 700, color: '#111827' }}>{co.name}</div>
          {co.phone && <a href={`tel:${co.phone}`} style={link}><Phone size={13} /> {co.phone}</a>}
          {co.email && <a href={`mailto:${co.email}`} style={link}><Mail size={13} /> {co.email}</a>}
          {co.website && <a href={co.website} style={link}><Globe size={13} /> {String(co.website).replace(/^https?:\/\//, '')}</a>}
        </Wrap>
      </footer>

      {showBasket && (
        <BasketPanel
          basket={basket} setBasket={setBasket} accent={accent} sent={sent}
          showPrices={cat.showPrices} form={form} setForm={setForm}
          onSend={send} sending={sending} err={err}
          onClose={() => { setShowBasket(false); if (sent) setSent(null); }}
        />
      )}
    </Shell>
  );
}

/* ── shell ───────────────────────────────────────────────────
   Its own light palette rather than the app's tokens: those follow the
   signed-in user's theme preference, and there is no signed-in user here. */
const Shell = ({ children }) => (
  <div style={{
    minHeight: '100vh', background: '#fff', color: '#111827',
    fontFamily: '"Inter var", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
  }}>{children}</div>
);
const Wrap = ({ children, style }) => (
  <div style={{ maxWidth: 1120, margin: '0 auto', ...style }}>{children}</div>
);
const Center = ({ children }) => (
  <p style={{ color: '#6b7280', textAlign: 'center', padding: '60px 20px' }}>{children}</p>
);
const link = { color: 'inherit', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' };

const Stat = ({ n, label, accent, icon: Icon }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {Icon
      ? <Icon size={14} style={{ color: accent }} />
      : <strong style={{ color: '#111827', fontSize: '1rem', fontWeight: 800 }}>{n}</strong>}
    {label}
  </span>
);

const PageBtn = ({ children, disabled, onClick }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px',
    border: '1px solid #d7dbe0', borderRadius: 8, background: '#fff',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    fontSize: '0.83rem', fontWeight: 600, color: '#111827',
  }}>{children}</button>
);

/* ── the card, with the tool on it ───────────────────────────
   The quantity box is not decoration. Someone deciding how many they need
   is already deciding to ask, so the same control that answers "what does
   500 cost" is the one that adds it to the enquiry. */
function ProductCard({ p, accent, showPrices, onAdd, onOpen }) {
  const [qty, setQty] = useState(p.moq || 1);
  const line = showPrices && p.price != null ? Number(qty || 0) * Number(p.price) : null;
  return (
    <article style={{
      border: '1px solid #e8eaed', borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', background: '#fff',
    }}>
      <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onOpen()}
        style={{ cursor: 'pointer', aspectRatio: '4/3', background: '#f5f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.photo_id
          ? <img src={`${API}/public/catalogue/photo/${p.photo_id}`} alt={p.name} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Package size={26} style={{ color: '#ccd1d7' }} />}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <h3 onClick={onOpen} style={{
          cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.35, margin: 0,
          letterSpacing: '-0.005em',
        }}>{p.headline || p.name}</h3>
        {p.use_case && (
          <p style={{ fontSize: '0.77rem', color: '#6b7280', lineHeight: 1.45, margin: 0 }}>{p.use_case}</p>
        )}
        <div style={{ fontSize: '0.74rem', color: '#8b929a', marginTop: 'auto', paddingTop: 8 }}>
          {p.moq ? `MOQ ${p.moq} ${p.unit || ''}` : p.unit || ''}
          {p.lead_time_note ? ` · ${p.lead_time_note}` : ''}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          <input type="number" value={qty} min={p.moq || 1} onChange={e => setQty(e.target.value)}
            aria-label={`Quantity of ${p.name}`}
            style={{ width: 76, padding: '8px', border: '1px solid #d7dbe0', borderRadius: 8, fontSize: '0.83rem', textAlign: 'right' }} />
          <button onClick={() => onAdd(p, qty)} style={{
            flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${accent}`,
            background: '#fff', color: accent, fontWeight: 700, fontSize: '0.79rem', cursor: 'pointer',
          }}>Add</button>
        </div>
        {line != null && (
          <div style={{ fontSize: '0.78rem', color: '#111827', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            ≈ {rupee(line)}
            <span style={{ fontWeight: 400, color: '#8b929a' }}> for {qty} {p.unit}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function ProductView({ product: p, accent, showPrices, onBack, onAdd }) {
  const [qty, setQty] = useState(p.moq || 1);
  const line = showPrices && p.price != null ? Number(qty || 0) * Number(p.price) : null;
  return (
    <div style={{ padding: '26px 0 50px' }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: '#6b7280', cursor: 'pointer', fontSize: '0.84rem', padding: 0, marginBottom: 22,
      }}><ArrowLeft size={14} /> All products</button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 34 }}>
        <div>
          {(p.photos || []).length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {p.photos.map(ph => (
                <img key={ph.id} src={`${API}/public/catalogue/photo/${ph.id}`} alt={ph.alt_text || p.name}
                  style={{ width: '100%', borderRadius: 12, border: '1px solid #e8eaed' }} />
              ))}
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: '#f5f6f8', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={38} style={{ color: '#ccd1d7' }} />
            </div>
          )}
        </div>

        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: 0, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {p.headline || p.name}
          </h1>
          {p.headline && p.name !== p.headline && (
            <p style={{ color: '#8b929a', fontSize: '0.85rem', marginTop: 5 }}>{p.name}</p>
          )}
          {p.use_case && <p style={{ color: '#374151', marginTop: 16, lineHeight: 1.65 }}>{p.use_case}</p>}
          {p.description && <p style={{ color: '#4b5563', marginTop: 10, lineHeight: 1.65, fontSize: '0.9rem' }}>{p.description}</p>}

          <dl style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 18px', fontSize: '0.86rem' }}>
            {showPrices && p.price != null && (<><dt style={dt}>Rate</dt><dd style={dd}>{rupee(p.price)} / {p.unit}</dd></>)}
            {p.unit && (<><dt style={dt}>Unit</dt><dd style={dd}>{p.unit}</dd></>)}
            {p.moq != null && (<><dt style={dt}>Minimum order</dt><dd style={dd}>{p.moq} {p.unit}</dd></>)}
            {p.lead_time_note && (<><dt style={dt}>Lead time</dt><dd style={dd}>{p.lead_time_note}</dd></>)}
            {p.hsn && (<><dt style={dt}>HSN</dt><dd style={dd}>{p.hsn}</dd></>)}
          </dl>

          {/* the tool, again — larger here */}
          <div style={{ marginTop: 26, padding: 16, border: '1px solid #e8eaed', borderRadius: 12, background: '#fafbfc' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              How many do you need?
            </label>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" value={qty} min={p.moq || 1} onChange={e => setQty(e.target.value)}
                aria-label="Quantity"
                style={{ width: 118, padding: '11px 12px', border: '1px solid #d7dbe0', borderRadius: 9, fontSize: '0.95rem', textAlign: 'right' }} />
              <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{p.unit}</span>
              <button onClick={() => onAdd(p, qty)} style={{
                marginLeft: 'auto', padding: '11px 22px', borderRadius: 9, border: 'none',
                background: accent, color: '#fff', fontWeight: 700, cursor: 'pointer',
              }}>Add to enquiry</button>
            </div>
            {line != null && (
              <p style={{ marginTop: 11, fontSize: '0.9rem', color: '#111827', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                ≈ {rupee(line)}
                <span style={{ fontWeight: 400, color: '#8b929a' }}> · indicative, before GST and freight</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
const dt = { color: '#8b929a', fontWeight: 600 };
const dd = { margin: 0, color: '#111827', fontWeight: 600 };

function BasketPanel({ basket, setBasket, accent, sent, showPrices, form, setForm, onSend, sending, err, onClose }) {
  const inp = { width: '100%', padding: '11px 12px', border: '1px solid #d7dbe0', borderRadius: 9, fontSize: '0.9rem', outline: 'none' };
  const total = showPrices
    ? basket.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0) : null;
  return (
    <div role="dialog" aria-label="Your enquiry" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.42)', display: 'flex', justifyContent: 'flex-end', zIndex: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(450px, 100%)', background: '#fff', height: '100%', overflowY: 'auto',
        padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, flex: 1, letterSpacing: '-0.01em' }}>
            {sent ? 'Enquiry sent' : 'Your enquiry'}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 800, marginBottom: 10 }}>
              <Check size={18} /> {sent}
            </div>
            <p style={{ color: '#4b5563', lineHeight: 1.65, fontSize: '0.93rem' }}>
              Thank you — we have your enquiry and someone will be in touch.
              Quote <strong>{sent}</strong> if you call.
            </p>
          </div>
        ) : basket.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Nothing added yet. Pick a few products and set the quantity you need.</p>
        ) : (
          <>
            {basket.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f1f3f5', paddingBottom: 11 }}>
                <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.35 }}>{i.description}</div>
                <input type="number" value={i.quantity} aria-label={`Quantity of ${i.description}`}
                  onChange={e => setBasket(b => b.map((x, k) => k === idx ? { ...x, quantity: e.target.value } : x))}
                  style={{ width: 72, padding: '6px 8px', border: '1px solid #d7dbe0', borderRadius: 7, textAlign: 'right' }} />
                <span style={{ fontSize: '0.77rem', color: '#8b929a', width: 32 }}>{i.unit}</span>
                <button onClick={() => setBasket(b => b.filter((_, k) => k !== idx))} aria-label="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aab0b7' }}><X size={15} /></button>
              </div>
            ))}
            {total != null && total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem' }}>
                <span>Indicative total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rupee(total)}</span>
              </div>
            )}

            <form onSubmit={onSend} style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              <input style={inp} placeholder="Your name *" value={form.name} required
                onChange={e => setForm({ ...form, name: e.target.value })} />
              <input style={inp} placeholder="Company" value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })} />
              <input style={inp} placeholder="Phone" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })} />
              <input style={inp} type="email" placeholder="Email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
              <textarea style={{ ...inp, minHeight: 78, resize: 'vertical' }}
                placeholder="Anything we should know — site, timeline, drawings"
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
              <p style={{ fontSize: '0.76rem', color: '#8b929a', margin: 0 }}>
                A phone number or an email — otherwise we cannot reply.
              </p>
              {err && <p style={{ color: '#dc2626', fontSize: '0.84rem', margin: 0 }}>{err}</p>}
              <button type="submit" disabled={sending} style={{
                padding: '12px 16px', borderRadius: 9, border: 'none', background: accent, color: '#fff',
                fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
                display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center',
              }}>
                <Send size={15} /> {sending ? 'Sending…' : 'Send enquiry'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
