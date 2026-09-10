/* ══════════════════════════════════════════════════════════════════════
   The public catalogue — the one page in this product with no login.

   Somebody opens this from a WhatsApp message. They have no account, no
   token, and very likely a phone on a site connection. So:

     · it renders outside AppLayout — no nav, no permission context, no
       token read. Anything assuming a signed-in user would crash here.
     · every request goes to /public/*, which answers strangers.
     · the identity is the BUSINESS's, from their own profile.

   ── on the look ─────────────────────────────────────────────────────
   Two passes to get here, and both were wrong in a way worth recording.

   The first was flat — a pale search box that read as decoration, no
   filters, cards with nothing to hold the eye. Fine as a data table,
   wrong for a page whose whole job is to make a stranger want to ask for
   a price.

   The second overcorrected into a dark hero. It gave the page a spine and
   it also gave it a wall: a heavy block a visitor had to get past before
   seeing a single product, on a page that exists to show products.

   What it is now:

     · light throughout. The confidence comes from the type and the space
       around it, not from a colour field — a large display line, generous
       air, one hairline rule, the numbers set beside it rather than
       stacked into dashboard tiles.
     · the accent appears three times: the eyebrow, its rule, the phone
       icon. Used that sparingly it reads as chosen rather than applied.
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
  ChevronLeft, ChevronRight, MessageCircle, Clock, Layers, Share2,
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

      {/* ══ sticky bar ══
          A name in bold and two buttons was a browser chrome, not a
          masthead. What it has now:

            · a monogram when the business has no logo. Every business that
              signs up has a name; almost none upload a logo on day one, so
              the identity has to come from somewhere, and initials in the
              accent give the bar an anchor on the left.
            · a second line under the name — the catalogue's own count —
              which turns a label into a masthead and tells a visitor what
              they have arrived at.
            · a share control, because the person most likely to pass this
              on is somebody already looking at it. Native share on a
              phone, copy to clipboard everywhere else.
            · the enquiry button carries a count, so the basket is visible
              without opening it. */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'saturate(180%) blur(12px)', borderBottom: '1px solid #eceff2',
      }}>
        <Wrap style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 22px' }}>
          {co.logo
            ? <img src={co.logo} alt="" style={{ height: 34, width: 'auto' }} />
            : <Monogram name={co.name} accent={accent} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.96rem', fontWeight: 800, letterSpacing: '-0.018em',
              color: '#0f1319', lineHeight: 1.2, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {co.name || 'Catalogue'}
            </div>
            <div style={{ fontSize: '0.73rem', color: '#8b929a', marginTop: 1, fontWeight: 600 }}>
              {cat.catalogueTotal ?? cat.total} products
              {cat.categories?.length ? ` · ${cat.categories.length} categories` : ''}
            </div>
          </div>

          <ShareButton accent={accent} title={`${co.name || 'Catalogue'} — what we make`} />

          {cat.whatsapp && (
            <a href={`https://wa.me/${String(cat.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              title="Message us on WhatsApp"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px',
                border: '1px solid #e2e6ea', borderRadius: 10, color: '#0f1319',
                textDecoration: 'none', fontSize: '0.81rem', fontWeight: 700, background: '#fff',
              }}>
              <MessageCircle size={15} style={{ color: '#25D366' }} />
              <span style={{ display: 'inline' }}>WhatsApp</span>
            </a>
          )}

          <button onClick={() => setShowBasket(true)} style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: '0.82rem',
            background: basket.length ? accent : '#0f1319', color: '#fff',
            boxShadow: basket.length ? `0 8px 20px -8px ${accent}` : '0 2px 8px -3px rgba(15,19,25,0.4)',
            transition: 'all 170ms',
          }}>
            <ShoppingBag size={15} />
            Enquiry
            {basket.length > 0 && (
              <span style={{
                minWidth: 20, height: 20, borderRadius: 999, background: 'rgba(255,255,255,0.24)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 800, padding: '0 5px',
              }}>{basket.length}</span>
            )}
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
          {/* ══ hero ══
              The dark slab is gone. It gave the page a spine but it also
              gave it a wall — a heavy block a visitor has to get past
              before they see a single product, on a page whose whole job
              is to show what this business makes.

              Light and quiet instead, and the confidence comes from the
              type and the space around it rather than from a colour
              field: a large display line, generous air, one hairline
              rule, and the numbers set as small caps beside it. The
              accent appears three times in total — the eyebrow, the rule
              and the phone icon — which is what makes it read as chosen
              rather than applied. */}
          <section style={{ borderBottom: '1px solid #eceff2', background: '#fff' }}>
            <Wrap style={{ padding: 'clamp(40px, 7vw, 76px) 22px clamp(30px, 4vw, 44px)' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '0.7rem', fontWeight: 800,
                letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, marginBottom: 20,
              }}>
                <span style={{ width: 26, height: 2, background: accent, display: 'inline-block', borderRadius: 2 }} />
                What we make
              </div>

              <h1 style={{
                fontSize: 'clamp(2.1rem, 5.6vw, 3.6rem)', fontWeight: 800, margin: 0,
                lineHeight: 1.03, letterSpacing: '-0.035em', textWrap: 'balance', maxWidth: '16ch',
                /* Explicit, because index.css sets `h1 { color:
                   var(--text-primary) }` globally and this page has no
                   signed-in user whose theme that token should follow. */
                color: '#0f1319', fontFamily: 'inherit',
              }}>
                {cat.headline || co.name}
              </h1>

              {cat.subhead && (
                <p style={{
                  color: '#5b636d', fontSize: 'clamp(0.98rem, 1.4vw, 1.12rem)', marginTop: 20,
                  maxWidth: '50ch', lineHeight: 1.65,
                }}>
                  {cat.subhead}
                </p>
              )}

              {/* One hairline, then the facts. Separated by rules rather
                  than boxes — nothing here needs a container. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0, marginTop: 36, flexWrap: 'wrap',
                borderTop: '1px solid #eceff2', paddingTop: 22,
              }}>
                <HeroStat n={cat.catalogueTotal ?? cat.total} label="products" />
                {cat.categories?.length > 0 && <HeroStat n={cat.categories.length} label="categories" />}
                {co.phone && (
                  <a href={`tel:${co.phone}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, color: '#0f1319',
                    textDecoration: 'none', fontSize: '0.92rem', fontWeight: 700,
                    paddingLeft: 26, marginLeft: 4, borderLeft: '1px solid #eceff2',
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
      {/* Light too. A dark footer under a light page was the same slab
          problem at the other end, and the closing line matters more than
          the block it sits on. */}
      <footer style={{ background: '#fafbfc', borderTop: '1px solid #eceff2', color: '#5b636d' }}>
        <Wrap style={{ padding: '44px 22px 54px' }}>
          <p style={{
            fontSize: 'clamp(1.05rem, 2vw, 1.3rem)', fontWeight: 700, color: '#0f1319',
            margin: '0 0 8px', maxWidth: '26ch', lineHeight: 1.3, letterSpacing: '-0.02em',
          }}>
            Tell us what you need and how many.
          </p>
          <p style={{ fontSize: '0.92rem', margin: '0 0 24px', maxWidth: '44ch', lineHeight: 1.6 }}>
            We will come back with a price.
          </p>
          <div style={{
            display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: '0.88rem',
            borderTop: '1px solid #eceff2', paddingTop: 20, alignItems: 'center',
          }}>
            <span style={{ fontWeight: 800, color: '#0f1319' }}>{co.name}</span>
            {co.phone && <a href={`tel:${co.phone}`} style={quiet}><Phone size={13} style={{ color: accent }} /> {co.phone}</a>}
            {co.email && <a href={`mailto:${co.email}`} style={quiet}><Mail size={13} style={{ color: accent }} /> {co.email}</a>}
            {co.website && <a href={co.website} style={quiet}><Globe size={13} style={{ color: accent }} /> {String(co.website).replace(/^https?:\/\//, '')}</a>}
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
const quiet = { color: '#5b636d', textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 };
/* the accent as a hairline at the very top — one detail, cheaply earned */
const Ring = ({ accent }) => (
  <div aria-hidden style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}66 60%, transparent)` }} />
);

/* The number and its label on one line, not stacked. Stacked they read as
   dashboard tiles, which is the wrong register for a page selling
   something — here they are simply two facts in a sentence. */
/* Initials in the accent, for the great majority of businesses that have
   not uploaded a logo. Two words give two letters, one gives one — never
   three, which stops looking like a mark and starts looking like a typo. */
function Monogram({ name, accent }) {
  const initials = String(name || 'C').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();
  return (
    <div aria-hidden style={{
      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: accent, color: '#fff', fontWeight: 800, fontSize: '0.86rem',
      letterSpacing: '-0.02em',
    }}>{initials}</div>
  );
}

/* Share, with the phone's own sheet where there is one — that is what
   puts the link into WhatsApp in two taps, which is how this actually
   travels. Everywhere else it copies and says so. */
function ShareButton({ accent, title }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1900);
    } catch { /* clipboard blocked — nothing useful to say */ }
  };
  return (
    <button onClick={share} title="Share this catalogue" aria-label="Share this catalogue"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px',
        border: `1px solid ${copied ? accent : '#e2e6ea'}`, borderRadius: 10,
        background: '#fff', color: copied ? accent : '#0f1319',
        cursor: 'pointer', fontSize: '0.81rem', fontWeight: 700, transition: 'all 160ms',
      }}>
      {copied ? <><Check size={15} /> Copied</> : <><Share2 size={15} /> Share</>}
    </button>
  );
}

const HeroStat = ({ n, label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'baseline', gap: 7,
    paddingRight: 26, marginRight: 4, borderRight: '1px solid #eceff2',
  }}>
    <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f1319', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
      {n}
    </span>
    <span style={{ fontSize: '0.82rem', color: '#7b838c', fontWeight: 600 }}>{label}</span>
  </span>
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
