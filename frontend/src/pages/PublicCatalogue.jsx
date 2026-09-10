/* ══════════════════════════════════════════════════════════════════════
   The public catalogue — the one page in this product with no login.

   Somebody opens this from a WhatsApp message. They have no account, no
   token, and very likely a phone on a site connection. So:

     · it renders outside AppLayout — no nav, no permission context, no
       token read. Anything assuming a signed-in user would crash here.
     · every request goes to /public/*, which answers strangers.
     · the identity is the BUSINESS's, from their own profile.

   ── on the look ─────────────────────────────────────────────────────
   The first version was too flat: a pale search box, no filters, cards
   with nothing to hold the eye. Fine as a data table, wrong for a page
   whose whole job is to make a stranger want to ask for a price.

   What it does now, and why:

     · a dark hero. The page is otherwise white, so one confident block at
       the top gives it a spine, and the accent sits on dark far better
       than on grey.
     · category filters as real chips with counts, so a visitor who wants
       line hardware does not have to already know the word for it.
     · a search field with weight — a border you can see, a ring on focus.
     · cards that respond: the image lifts, the border takes the accent.
     · a price band rather than a bare number, and the quantity control as
       the tool on the card, which is the part worth taking from
       kirashi.co.in — that site earns attention by DOING something.

   Structure and restraint are borrowed; the skin is not. Colour comes
   from the organisation's own accent, or every business using this would
   get a page that looks like somebody else's.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Send, X, Phone, Globe, Mail, ArrowLeft, Check, Package, Search,
  ChevronLeft, ChevronRight, MessageCircle, Clock, Layers,
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
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const [basket, setBasket] = useState([]);
  const [showBasket, setShowBasket] = useState(false);
  const [sent, setSent] = useState(null);
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  const fetchPage = useCallback(async (off, search, cate) => {
    setBusy(true);
    try {
      const url = `${API}/public/catalogue/${slug}?limit=${PAGE}&offset=${off}`
        + (search ? `&q=${encodeURIComponent(search)}` : '')
        + (cate ? `&category=${encodeURIComponent(cate)}` : '');
      const r = await fetch(url);
      if (!r.ok) { setState('missing'); return; }
      const d = await r.json();
      setCat(d); setState('ok');
      document.title = d.company?.name ? `${d.company.name} — what we make` : 'Catalogue';
    } catch { setState('missing'); }
    setBusy(false);
  }, [slug]);

  useEffect(() => { fetchPage(offset, query, category); }, [fetchPage, offset, query, category]);

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
    } catch { setErr('We could not reach the server. Check your connection and try again.'); }
    setSending(false);
  };

  if (state === 'loading') return <Shell><Center>Loading…</Center></Shell>;
  if (state === 'missing') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '90px 20px' }}>
          <Package size={38} style={{ color: '#c4c9d0', marginBottom: 14 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 6px', color: '#111827', fontFamily: 'inherit' }}>This catalogue isn’t available</h1>
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
  const filtering = !!(query || category);

  return (
    <Shell>
      <Ring accent={accent} />

      {/* ══ sticky bar ══ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'saturate(180%) blur(10px)', borderBottom: '1px solid #e9ecef',
      }}>
        <Wrap style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px' }}>
          {co.logo && <img src={co.logo} alt="" style={{ height: 28 }} />}
          <div style={{ flex: 1, minWidth: 0, fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
            {co.name || 'Catalogue'}
          </div>
          {cat.whatsapp && (
            <a href={`https://wa.me/${String(cat.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
                border: '1px solid #dfe3e8', borderRadius: 9, color: '#111827',
                textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700,
              }}>
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
          <button onClick={() => setShowBasket(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px',
            borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
            background: basket.length ? accent : '#f1f3f5', color: basket.length ? '#fff' : '#5b6470',
            boxShadow: basket.length ? `0 6px 18px -6px ${accent}` : 'none', transition: 'all 160ms',
          }}>
            <ShoppingBag size={15} />
            {basket.length ? `${basket.length} in enquiry` : 'Enquiry'}
          </button>
        </Wrap>
      </header>

      {product ? (
        <Wrap style={{ padding: '0 22px' }}>
          <ProductView product={product} accent={accent} showPrices={cat.showPrices}
            onBack={() => navigate(`/c/${slug}`)} onAdd={add} />
        </Wrap>
      ) : (
        <>
          {/* ══ hero — dark, so the page has a spine ══ */}
          <section style={{
            background: 'linear-gradient(150deg, #12161c 0%, #1b2129 55%, #12161c 100%)',
            color: '#fff', position: 'relative', overflow: 'hidden',
          }}>
            <div aria-hidden style={{
              position: 'absolute', top: -140, right: -110, width: 460, height: 460, borderRadius: '50%',
              background: `radial-gradient(circle, ${accent}2e 0%, transparent 68%)`,
            }} />
            <Wrap style={{ padding: '62px 22px 54px', position: 'relative' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', fontWeight: 800,
                letterSpacing: '0.13em', textTransform: 'uppercase', color: accent, marginBottom: 18,
              }}>
                <span style={{ width: 24, height: 2, background: accent, display: 'inline-block' }} />
                What we make
              </div>
              <h1 style={{
                fontSize: 'clamp(2rem, 5.4vw, 3.4rem)', fontWeight: 800, margin: 0,
                lineHeight: 1.05, letterSpacing: '-0.032em', textWrap: 'balance', maxWidth: '17ch',
                /* Explicit. index.css sets `h1 { color: var(--text-primary) }`
                   globally, which beats the white this section inherits down
                   — the headline rendered near-black on a near-black band and
                   was all but invisible. This page must not depend on the
                   app's theme tokens: it has no signed-in user to have a
                   theme. */
                color: '#fff', fontFamily: 'inherit',
              }}>
                {cat.headline || co.name}
              </h1>
              {cat.subhead && (
                <p style={{ color: '#aab3bf', fontSize: '1.06rem', marginTop: 18, maxWidth: '52ch', lineHeight: 1.62 }}>
                  {cat.subhead}
                </p>
              )}
              <div style={{ display: 'flex', gap: 26, marginTop: 32, flexWrap: 'wrap' }}>
                <HeroStat n={cat.catalogueTotal ?? cat.total} label="products listed" accent={accent} />
                {cat.categories?.length > 0 && <HeroStat n={cat.categories.length} label="categories" accent={accent} />}
                {co.phone && (
                  <a href={`tel:${co.phone}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff',
                    textDecoration: 'none', alignSelf: 'flex-end', fontSize: '0.9rem', fontWeight: 600,
                  }}>
                    <Phone size={15} style={{ color: accent }} /> {co.phone}
                  </a>
                )}
              </div>
            </Wrap>
          </section>

          {/* ══ filters ══ */}
          <Wrap style={{ padding: '26px 22px 0' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <SearchBox q={q} setQ={setQ} accent={accent}
                onSubmit={() => { setOffset(0); setQuery(q); }} />
              <span style={{ marginLeft: 'auto', fontSize: '0.83rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                {filtering ? `${cat.total} of ${cat.catalogueTotal}` : `${cat.total} products`}
                {pages > 1 && ` · page ${page} of ${pages}`}
              </span>
            </div>

            {cat.categories?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 4 }}>
                <Chip active={!category} accent={accent}
                  onClick={() => { setCategory(''); setOffset(0); }}>
                  <Layers size={13} /> Everything
                  <Count active={!category} accent={accent}>{cat.catalogueTotal}</Count>
                </Chip>
                {cat.categories.map(c => (
                  <Chip key={c.name} active={category === c.name} accent={accent}
                    onClick={() => { setCategory(category === c.name ? '' : c.name); setOffset(0); }}>
                    {c.name}
                    <Count active={category === c.name} accent={accent}>{c.n}</Count>
                  </Chip>
                ))}
              </div>
            )}

            {filtering && (
              <button onClick={() => { setQ(''); setQuery(''); setCategory(''); setOffset(0); }}
                style={{
                  marginTop: 12, background: 'none', border: 'none', color: accent,
                  cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, padding: 0,
                }}>
                Clear {query && `“${query}”`}{query && category && ' and '}{category} ✕
              </button>
            )}
          </Wrap>

          {/* ══ grid ══ */}
          <Wrap style={{ padding: '22px 22px 40px' }}>
            {cat.products.length === 0 ? (
              <Center>
                {query ? `Nothing matches “${query}”.` : category ? `Nothing in ${category} yet.` : 'Nothing is listed here yet.'}
              </Center>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))', gap: 18,
                opacity: busy ? 0.5 : 1, transition: 'opacity 140ms',
              }}>
                {cat.products.map(p => (
                  <ProductCard key={p.id} p={p} accent={accent} showPrices={cat.showPrices}
                    onAdd={add} onOpen={() => navigate(`/c/${slug}/${p.slug}`)} />
                ))}
              </div>
            )}

            {pages > 1 && (
              <nav aria-label="Pages" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 34 }}>
                <PageBtn disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - PAGE)); window.scrollTo({ top: 260, behavior: 'smooth' }); }}>
                  <ChevronLeft size={15} /> Previous
                </PageBtn>
                <span style={{ fontSize: '0.84rem', color: '#6b7280', minWidth: 92, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {page} of {pages}
                </span>
                <PageBtn disabled={page >= pages} onClick={() => { setOffset(offset + PAGE); window.scrollTo({ top: 260, behavior: 'smooth' }); }}>
                  Next <ChevronRight size={15} />
                </PageBtn>
              </nav>
            )}
          </Wrap>
        </>
      )}

      {/* ══ closing band ══ */}
      <footer style={{ background: '#12161c', color: '#aab3bf' }}>
        <Wrap style={{ padding: '38px 22px 46px' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginBottom: 6 }}>{co.name}</div>
          <p style={{ fontSize: '0.87rem', margin: '0 0 18px', maxWidth: '46ch', lineHeight: 1.6 }}>
            Tell us what you need and how many. We will come back with a price.
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.87rem' }}>
            {co.phone && <a href={`tel:${co.phone}`} style={dark}><Phone size={13} /> {co.phone}</a>}
            {co.email && <a href={`mailto:${co.email}`} style={dark}><Mail size={13} /> {co.email}</a>}
            {co.website && <a href={co.website} style={dark}><Globe size={13} /> {String(co.website).replace(/^https?:\/\//, '')}</a>}
          </div>
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

/* ── pieces ──────────────────────────────────────────────── */
const Shell = ({ children }) => (
  <div style={{
    minHeight: '100vh', background: '#fff', color: '#111827',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
  }}>{children}</div>
);
const Wrap = ({ children, style }) => (
  <div style={{ maxWidth: 1140, margin: '0 auto', ...style }}>{children}</div>
);
const Center = ({ children }) => (
  <p style={{ color: '#6b7280', textAlign: 'center', padding: '70px 20px' }}>{children}</p>
);
const dark = { color: 'inherit', textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' };
/* the accent as a hairline at the very top — one detail, cheaply earned */
const Ring = ({ accent }) => (
  <div aria-hidden style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}66 60%, transparent)` }} />
);

const HeroStat = ({ n, label, accent }) => (
  <div>
    <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>{n}</div>
    <div style={{ fontSize: '0.78rem', color: '#8892a0', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
      {label}
    </div>
  </div>
);

/* A search box with a visible edge and a focus ring. The first version was
   a pale rectangle that read as decoration. */
function SearchBox({ q, setQ, accent, onSubmit }) {
  const [focus, setFocus] = useState(false);
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(); }}
      style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 440 }}>
      <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: focus ? accent : '#8b929a' }} />
      <input value={q} onChange={e => setQ(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        aria-label="Search products" placeholder="Search — size, description, code"
        style={{
          width: '100%', padding: '12px 13px 12px 38px', borderRadius: 10, fontSize: '0.9rem',
          outline: 'none', background: '#fff', color: '#111827',
          border: `1.5px solid ${focus ? accent : '#d3d8de'}`,
          boxShadow: focus ? `0 0 0 4px ${accent}1f` : 'none', transition: 'all 150ms',
        }} />
    </form>
  );
}

const Chip = ({ children, active, accent, onClick }) => (
  <button onClick={onClick} style={{
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
    fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms',
    border: `1.5px solid ${active ? accent : '#e2e6ea'}`,
    background: active ? accent : '#fff', color: active ? '#fff' : '#3d444c',
  }}>{children}</button>
);
const Count = ({ children, active, accent }) => (
  <span style={{
    fontSize: '0.72rem', fontWeight: 800, padding: '1px 7px', borderRadius: 999,
    background: active ? 'rgba(255,255,255,0.22)' : '#f1f3f5',
    color: active ? '#fff' : '#7b838c',
  }}>{children}</span>
);

const PageBtn = ({ children, disabled, onClick }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 16px',
    border: '1.5px solid #dfe3e8', borderRadius: 9, background: '#fff',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
    fontSize: '0.84rem', fontWeight: 700, color: '#111827',
  }}>{children}</button>
);

/* ── the card ────────────────────────────────────────────────
   The quantity box is the tool. Somebody deciding how many they need is
   already deciding to ask, so the control that answers "what does 500
   cost" is the one that adds it to the enquiry. */
function ProductCard({ p, accent, showPrices, onAdd, onOpen }) {
  const [qty, setQty] = useState(p.moq || 1);
  const [hover, setHover] = useState(false);
  const line = showPrices && p.price != null ? Number(qty || 0) * Number(p.price) : null;
  return (
    <article
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${hover ? accent : '#e6e9ec'}`, borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', background: '#fff',
        boxShadow: hover ? '0 14px 30px -18px rgba(16,24,40,0.35)' : '0 1px 2px rgba(16,24,40,0.04)',
        transform: hover ? 'translateY(-2px)' : 'none', transition: 'all 180ms ease',
      }}>
      <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onOpen()}
        style={{ cursor: 'pointer', aspectRatio: '4/3', background: '#f4f6f8', overflow: 'hidden', position: 'relative' }}>
        {p.photo_id
          ? <img src={`${API}/public/catalogue/photo/${p.photo_id}`} alt={p.name} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hover ? 'scale(1.04)' : 'none', transition: 'transform 320ms ease' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={26} style={{ color: '#ccd2d8' }} />
            </div>}
        {p.category && (
          <span style={{
            position: 'absolute', left: 10, top: 10, fontSize: '0.68rem', fontWeight: 800,
            padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.94)',
            color: '#3d444c', letterSpacing: '0.02em',
          }}>{p.category}</span>
        )}
      </div>

      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <h3 onClick={onOpen} style={{
          cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.32, margin: 0,
          letterSpacing: '-0.008em', color: '#111827', fontFamily: 'inherit',
        }}>{p.headline || p.name}</h3>
        {p.use_case && (
          <p style={{ fontSize: '0.775rem', color: '#6b7280', lineHeight: 1.45, margin: 0 }}>{p.use_case}</p>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 'auto', paddingTop: 10, fontSize: '0.73rem', color: '#8b929a' }}>
          {p.moq ? <span>MOQ {p.moq} {p.unit}</span> : <span>{p.unit}</span>}
          {p.lead_time_note && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {p.lead_time_note}
            </span>
          )}
        </div>

        {showPrices && p.price != null && (
          <div style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.01em', marginTop: 4 }}>
            {rupee(p.price)}
            <span style={{ fontWeight: 500, color: '#8b929a', fontSize: '0.78rem' }}> / {p.unit}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
          <input type="number" value={qty} min={p.moq || 1} onChange={e => setQty(e.target.value)}
            aria-label={`Quantity of ${p.name}`}
            style={{ width: 74, padding: '9px 8px', border: '1px solid #d3d8de', borderRadius: 9, fontSize: '0.84rem', textAlign: 'right' }} />
          <button onClick={() => onAdd(p, qty)} style={{
            flex: 1, padding: '9px 10px', borderRadius: 9, border: 'none',
            background: hover ? accent : `${accent}14`, color: hover ? '#fff' : accent,
            fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 160ms',
          }}>Add</button>
        </div>

        {line != null && line > 0 && (
          <div style={{ fontSize: '0.77rem', color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
            ≈ <strong style={{ color: '#111827' }}>{rupee(line)}</strong> for {qty} {p.unit}
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
    <div style={{ padding: '28px 0 54px' }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: 24, fontWeight: 600,
      }}><ArrowLeft size={14} /> All products</button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 38 }}>
        <div>
          {(p.photos || []).length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {p.photos.map(ph => (
                <img key={ph.id} src={`${API}/public/catalogue/photo/${ph.id}`} alt={ph.alt_text || p.name}
                  style={{ width: '100%', borderRadius: 14, border: '1px solid #e6e9ec' }} />
              ))}
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: '#f4f6f8', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={38} style={{ color: '#ccd2d8' }} />
            </div>
          )}
        </div>

        <div>
          {p.category && (
            <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: accent, marginBottom: 10 }}>
              {p.category}
            </div>
          )}
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, lineHeight: 1.16, letterSpacing: '-0.025em', color: '#111827', fontFamily: 'inherit' }}>
            {p.headline || p.name}
          </h1>
          {p.headline && p.name !== p.headline && (
            <p style={{ color: '#8b929a', fontSize: '0.86rem', marginTop: 6 }}>{p.name}</p>
          )}
          {p.use_case && <p style={{ color: '#374151', marginTop: 18, lineHeight: 1.65 }}>{p.use_case}</p>}
          {p.description && <p style={{ color: '#4b5563', marginTop: 10, lineHeight: 1.65, fontSize: '0.9rem' }}>{p.description}</p>}

          <dl style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 20px', fontSize: '0.87rem' }}>
            {showPrices && p.price != null && (<><dt style={dt}>Rate</dt><dd style={dd}>{rupee(p.price)} / {p.unit}</dd></>)}
            {p.unit && (<><dt style={dt}>Unit</dt><dd style={dd}>{p.unit}</dd></>)}
            {p.moq != null && (<><dt style={dt}>Minimum order</dt><dd style={dd}>{p.moq} {p.unit}</dd></>)}
            {p.lead_time_note && (<><dt style={dt}>Lead time</dt><dd style={dd}>{p.lead_time_note}</dd></>)}
            {p.hsn && (<><dt style={dt}>HSN</dt><dd style={dd}>{p.hsn}</dd></>)}
          </dl>

          <div style={{ marginTop: 28, padding: 18, border: `1.5px solid ${accent}33`, borderRadius: 14, background: `${accent}08` }}>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              How many do you need?
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" value={qty} min={p.moq || 1} onChange={e => setQty(e.target.value)}
                aria-label="Quantity"
                style={{ width: 122, padding: '12px 13px', border: '1px solid #d3d8de', borderRadius: 10, fontSize: '0.98rem', textAlign: 'right' }} />
              <span style={{ color: '#6b7280', fontSize: '0.92rem' }}>{p.unit}</span>
              <button onClick={() => onAdd(p, qty)} style={{
                marginLeft: 'auto', padding: '12px 24px', borderRadius: 10, border: 'none',
                background: accent, color: '#fff', fontWeight: 800, cursor: 'pointer',
                boxShadow: `0 8px 22px -10px ${accent}`,
              }}>Add to enquiry</button>
            </div>
            {line != null && line > 0 && (
              <p style={{ marginTop: 12, fontSize: '0.93rem', color: '#111827', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                ≈ {rupee(line)}
                <span style={{ fontWeight: 400, color: '#8b929a', fontSize: '0.82rem' }}> · indicative, before GST and freight</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
const dt = { color: '#8b929a', fontWeight: 600 };
const dd = { margin: 0, color: '#111827', fontWeight: 700 };

function BasketPanel({ basket, setBasket, accent, sent, showPrices, form, setForm, onSend, sending, err, onClose }) {
  const inp = { width: '100%', padding: '11px 13px', border: '1px solid #d3d8de', borderRadius: 10, fontSize: '0.9rem', outline: 'none' };
  const total = showPrices
    ? basket.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0) : null;
  return (
    <div role="dialog" aria-label="Your enquiry" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', justifyContent: 'flex-end', zIndex: 70,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(456px, 100%)', background: '#fff', height: '100%', overflowY: 'auto',
        padding: 26, display: 'flex', flexDirection: 'column', gap: 15,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, flex: 1, letterSpacing: '-0.02em', color: '#111827', fontFamily: 'inherit' }}>
            {sent ? 'Enquiry sent' : 'Your enquiry'}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 800, marginBottom: 10, fontSize: '1.05rem' }}>
              <Check size={19} /> {sent}
            </div>
            <p style={{ color: '#4b5563', lineHeight: 1.65, fontSize: '0.93rem' }}>
              Thank you — we have your enquiry and someone will be in touch.
              Quote <strong>{sent}</strong> if you call.
            </p>
          </div>
        ) : basket.length === 0 ? (
          <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
            Nothing added yet. Pick a few products and set the quantity you need.
          </p>
        ) : (
          <>
            {basket.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f1f3f5', paddingBottom: 11 }}>
                <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.35 }}>{i.description}</div>
                <input type="number" value={i.quantity} aria-label={`Quantity of ${i.description}`}
                  onChange={e => setBasket(b => b.map((x, k) => k === idx ? { ...x, quantity: e.target.value } : x))}
                  style={{ width: 72, padding: '7px 8px', border: '1px solid #d3d8de', borderRadius: 8, textAlign: 'right' }} />
                <span style={{ fontSize: '0.77rem', color: '#8b929a', width: 32 }}>{i.unit}</span>
                <button onClick={() => setBasket(b => b.filter((_, k) => k !== idx))} aria-label="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aab0b7' }}><X size={15} /></button>
              </div>
            ))}
            {total != null && total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.96rem' }}>
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
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                placeholder="Anything we should know — site, timeline, drawings"
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
              <p style={{ fontSize: '0.76rem', color: '#8b929a', margin: 0 }}>
                A phone number or an email — otherwise we cannot reply.
              </p>
              {err && <p style={{ color: '#dc2626', fontSize: '0.84rem', margin: 0 }}>{err}</p>}
              <button type="submit" disabled={sending} style={{
                padding: '13px 16px', borderRadius: 10, border: 'none', background: accent, color: '#fff',
                fontWeight: 800, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
                display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 10px 24px -12px ${accent}`,
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
