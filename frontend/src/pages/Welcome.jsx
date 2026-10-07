import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Zap, FileText, ShoppingCart, Workflow, Users, CheckCircle, Shield,
  Play, Factory, Store, Link2, ShieldCheck, Crown, Handshake, Wallet,
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import useInView from '../hooks/useInView';
import usePageMeta from '../hooks/usePageMeta';
import FlowShowcase from '../components/marketing/flow/FlowShowcase';
import CatalogueShowcase from '../components/marketing/CatalogueShowcase';
import { FeatureGrid } from '../components/marketing/FeatureDiagrams';
import { canFor } from '../components/marketing/film/data/roleViews';
import AdSection from '../components/marketing/ad/AdSection';

/* ── Warm SVG wave dividers (CSOD-inspired organic shapes) ── */
const WaveDivider = ({ flip = false, color1 = 'hsl(28,80%,90%)', color2 = 'hsl(22,70%,85%)' }) => (
  <div style={{ position: 'relative', width: '100%', overflow: 'hidden', lineHeight: 0, transform: flip ? 'rotate(180deg)' : 'none' }}>
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" style={{ width: '100%', height: '80px', display: 'block' }}>
      <path d="M0,40 C360,120 720,0 1080,80 C1260,120 1380,60 1440,40 L1440,120 L0,120 Z" fill={color1} opacity="0.5" />
      <path d="M0,60 C240,0 480,100 720,60 C960,20 1200,80 1440,60 L1440,120 L0,120 Z" fill={color2} opacity="0.3" />
      <path d="M0,80 C180,40 360,100 540,80 C720,60 900,100 1080,80 C1260,60 1380,90 1440,80 L1440,120 L0,120 Z" fill={color1} opacity="0.2" />
    </svg>
  </div>
);

/* The testimonial carousel is gone: its three named quotes were not from
   customers, and a beta has no business inventing them. Nor does the stats
   strip that sat under the hero ("5× faster", "100% GST-accurate") — numbers
   nobody had measured. */

/* ── Industry strip: SMEs first; contracting is an optional module ── */
const LOGOS = ['Fabrication', 'Steel & Metals', 'Manufacturing', 'Trading & Distribution', 'Solar & Power', 'Machinery', 'Engineering Services', 'Contractors'];

/* ── The roles, as the app defines them ──
   Was "Admin / Engineer / Finance / Vendor" — names the backend retired
   (roles.js maps them to Administrator / Production / Viewer), so the page
   described an app that no longer exists. Each tick below is the role's
   real write permission, read from the backend's own role table
   (film/data/roles.snapshot.js, checked against backend/shared/roles.js). */
const ACTIONS = [
  ['Send quotations', 'sales-quotations'],
  ['Take customer orders', 'customer-orders'],
  ['Raise invoices', 'sales-invoices'],
  ['Compare vendor quotes', 'quotations'],
  ['Raise purchase orders', 'po'],
  ['Receive goods', 'grn'],
  ['Adjust stock', 'inventory'],
  ['Run production', 'production'],
  ['Sign off purchase orders', 'po-approval'],
  ['Record expenses', 'expenses'],
  ['Manage the team', 'users'],
];
const ROLES = [
  { role: 'Owner', Icon: Crown, color: '#FF7A00', tagline: 'Runs the business, and can do everything in it' },
  { role: 'Sales', Icon: Handshake, color: '#3B82F6', tagline: 'Turns enquiries into quotations, orders and invoices' },
  { role: 'Procurement', Icon: ShoppingCart, color: '#A78BFA', tagline: 'Buys what is short and receives it into stock' },
  { role: 'Production', Icon: Factory, color: '#06B6D4', tagline: 'Runs the work and records what was made' },
  { role: 'Finance', Icon: Wallet, color: '#22C55E', tagline: 'Signs off purchase orders and keeps the books' },
].map((r) => {
  const can = canFor(r.role);
  const allowed = ACTIONS.filter(([, res]) => can(res, 'write')).map(([label]) => label);
  return { ...r, does: allowed.length === ACTIONS.length ? ['Everything every other role can do', 'Sign off purchase orders', 'Manage the team and its roles'] : allowed };
});

/* The local copy of useInView that lived here has been replaced by the
   shared hook (hooks/useInView). Two copies of the same observer was exactly
   the drift extracting it was meant to prevent — and this one never
   disconnected after firing, so every reveal on the page kept an observer
   attached for the life of the session.

   Everything here wants a ONE-TIME reveal, so these call sites take `seen`
   (the second value) and pass once:true. Looping animations take the third
   value instead, so they only run while actually on screen. */

/* ── Role card ──
   Hover is CSS (.mk-role in motion.css), so a tap on a phone no longer
   leaves the card lifted. */
const RoleCard = ({ role, color, tagline, does, ...rest }) => (
  <div className="card mk-role" style={{ borderColor: `${color}22`, '--role': color }}>
    <div
      style={{
        width: '48px', height: '48px', borderRadius: 'var(--r-md)',
        background: `${color}15`, border: `1px solid ${color}30`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px',
      }}
    >
      {React.createElement(rest.Icon, { size: 22 })}
    </div>
    <h4 style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>{role}</h4>
    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-muted)', marginBottom: '14px' }}>{tagline}</p>
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {does.map((m) => (
        <li key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--t-sm)', color: 'var(--text-secondary)' }}>
          <CheckCircle size={12} color={color} style={{ flex: 'none' }} />
          {m}
        </li>
      ))}
    </ul>
  </div>
);

/* ─────────────────────────────────────────────── */
const Welcome = () => {
  const navigate = useNavigate();
  const [heroRef, heroInView] = useInView(0.01, { once: true });
  const [featRef, featInView] = useInView(0.05, { once: true });
  usePageMeta(
    'Maks Ops — From catalogue to cash',
    'Maks Ops connects every step of your operation — catalogue, enquiries, quotations, vendor quotes, purchasing, inventory, production and GST invoices — in one place.',
  );

  /* The logo strip loops forever; it pauses while it is off screen, like
     every other loop on this page — a reader at the footer should not be
     paying for a marquee they scrolled past. */
  const [marqueeRef, , marqueeVisible] = useInView(0);

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>

      {/* The announcement banner ("Maks Ops Beta is Live — Explore Beta") is
          gone: 46px above the headline restating what the nav's Test Beta
          button already says. */}
      <MarketingNav />

      {/* ── HERO (PRESERVED EXACTLY AS ORIGINAL) ── */}
      <section
        className="hero-section"
        ref={heroRef}
        /* No forced 100vh. The hero reserved a whole screen for a headline and
           two buttons, which pushed the engine — the thing that shows what
           this product does — entirely below the fold. It is now sized by its
           contents, so the first stages are visible on landing. */
        style={{ paddingTop: '18px', paddingBottom: '40px' }}
      >
        {/* Mesh background blobs */}
        <div className="hero-mesh">
          <div
            className="blob blob-amber"
            style={{ width: '600px', height: '600px', top: '-10%', right: '-5%', opacity: 0.12 }}
          />
          <div
            className="blob blob-blue"
            style={{ width: '500px', height: '500px', bottom: '5%', left: '-10%', opacity: 0.1 }}
          />
          <div
            className="blob blob-amber"
            style={{ width: '300px', height: '300px', top: '40%', left: '40%', opacity: 0.07, animationDuration: '18s' }}
          />
          {/* Grid overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
              opacity: 0.3,
            }}
          />
        </div>

        <div
          className="container"
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '22px',
          }}
        >
          {/* ── THE HERO IS THE PRODUCT ─────────────────────────────────────
                 Everything a visitor needs is in the first screen: what this
                 is for, in one line, and then the product doing it — a
                 customer's enquiry from your catalogue carried as one record
                 through quotation, order, purchase, receipt, production and
                 invoice. Not a video: the stage cards are the controller and
                 the window below is the application, running. */}
          {/* The words are on screen at once: the headline is the page's largest
              element, and it used to wait for a fade before anyone could read it. */}
          <div className="pill pill-amber">
            <Zap size={12} /> Operations flow
          </div>

          <h1 className="mk-hero-h1">
            From catalogue <span className="mk-hero-accent">to cash.</span>
          </h1>

          <p className="mk-hero-lede">
            <strong>Maks Ops connects every step in between.</strong>{' '}
            Create your catalogue, capture enquiries, send quotations, compare vendor
            quotes, buy smarter, track inventory, run production and raise invoices —
            all in one connected operation.
          </p>

          <div className="animate-in stagger-3 mk-hero-flow" style={{ opacity: heroInView ? 1 : 0 }}>
            <FlowShowcase />
          </div>

          {/* The walkthrough is one order in a minute; the film is the rest. */}
          <Link to="/see-maksops" className="mk-film-link">
            That was one order. See the whole business at work <ArrowRight size={15} />
          </Link>

          <ul className="mk-proof" aria-label="Why it holds together">
            {[
              [<FileText size={17} />, 'Every step creates a document', 'Numbered and printable, on your letterhead'],
              [<Link2 size={17} />, 'Everything stays connected', 'One record, start to finish — no spreadsheets'],
              [<Users size={17} />, 'Built for SMEs', 'GST, e-way bills and lakhs, out of the box'],
              [<ShieldCheck size={17} />, 'Full traceability', 'Know what happened, when, and who did it'],
            ].map(([icon, title, sub]) => (
              <li key={title}>
                <span className="mk-proof-ico">{icon}</span>
                <span><b>{title}</b><small>{sub}</small></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── THE AD: the walkthrough above is one order, step by step; this is
             the whole idea in under a minute, as a film. ── */}
      <AdSection />

      {/* ── WAVE TRANSITION (CSOD-inspired organic waves) ──
             The stats strip that sat here ("5× faster", "100% GST-accurate",
             "20+ modules") is gone — unmeasured claims, and a module count no
             other page agreed with. So is the separate Ask AI section: the
             features below already give Ask AI and Smart Knowledge a card each. */}
      <WaveDivider color1="var(--brand-amber)" color2="hsl(22,70%,75%)" />

      {/* ── LOGO MARQUEE (CSOD-style trust strip) ── */}
      <div style={{
        background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)',
        padding: '24px 0', overflow: 'hidden',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <span style={{
            fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--text-disabled)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Built for India's growing SMEs</span>
        </div>
        <div ref={marqueeRef} style={{ overflow: 'hidden' }}>
          <div className="mk-marquee" style={{ display: 'flex', animationPlayState: marqueeVisible ? 'running' : 'paused', width: 'max-content' }}>
            {[...LOGOS, ...LOGOS].map((name, i) => (
              <div key={i} style={{
                padding: '8px 40px', borderRight: '1px solid var(--border-subtle)',
                fontSize: 'var(--t-base)', fontWeight: 700, color: 'var(--text-disabled)',
                letterSpacing: '0.02em', whiteSpace: 'nowrap',
              }}>{name}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES GRID — Wrapped in a CSOD-style floating card ── */}
      <section className="section" id="features" ref={featRef} style={{ paddingBottom: '40px' }}>
        <div className="container">
          {/* Floating card container (CSOD-inspired rounded elevated section) */}
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border-subtle)',
            padding: 'clamp(32px, 5vw, 64px)',
            boxShadow: '0 8px 60px hsl(28,40%,50%,0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle corner glow */}
            <div style={{
              position: 'absolute', top: '-80px', right: '-80px',
              width: '300px', height: '300px', borderRadius: '50%',
              background: 'radial-gradient(circle, hsl(28,100%,54%,0.06), transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <span
                className="pill pill-amber"
                style={{ marginBottom: '16px', opacity: featInView ? 1 : 0, transition: 'opacity 0.5s' }}
              >
                <Workflow size={12} /> Platform Capabilities
              </span>
              <h2
                style={{ maxWidth: '600px', margin: '16px auto 0', opacity: featInView ? 1 : 0, transition: 'opacity 0.5s 0.1s' }}
              >
                Everything to run your{' '}
                <span className="gradient-text-amber">SME operation</span>
              </h2>
              <p
                style={{
                  maxWidth: '560px',
                  margin: '16px auto 0',
                  color: 'var(--text-muted)',
                  opacity: featInView ? 1 : 0,
                  transition: 'opacity 0.5s 0.2s',
                  lineHeight: 1.8,
                }}
              >
                Twelve capabilities, and what each one actually produces. The unusual
                ones are called out plainly rather than left for you to find.
              </p>
            </div>

            {/* Was eleven identical cards: icon, title, paragraph. Every
                capability read the same, so the genuinely unusual ones —
                reading a vendor's PDF, yield including scrap, place of supply
                taken from the ship-to — were indistinguishable from the
                ordinary ones. FeatureGrid gives each one a small animated
                diagram of its actual mechanism. */}
            <FeatureGrid />
          </div>
        </div>
      </section>

      {/* "Know what you can promise" (PromiseCheck) used to sit here. Smart
             Inventory is now the centre of the ad near the top of the page,
             so a third telling of it went. */}
      {/* The engine used to be duplicated here, five screens below the fold.
          It now opens the page, where the thing that explains the product
          belongs — so this section is just the way through to the detail. */}
      <section className="section-sm" style={{ background: 'var(--bg-deep)', textAlign: 'center' }}>
        <div className="container">
          <Link to="/how-it-works" className="btn-ghost">
            See every stage in detail <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── THE CATALOGUE ──────────────────────────────────────────────
             The catalogue was missing from the features list entirely, which
             made the one capability a stranger can use WITHOUT an account the
             one the sales page never mentioned. It gets its own section. */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span className="pill pill-amber" style={{ marginBottom: '16px' }}>
              <Store size={12} /> Your Public Catalogue
            </span>
            <h2 style={{ maxWidth: '640px', margin: '16px auto 0' }}>
              A shopfront that turns strangers into{' '}
              <span className="gradient-text-amber">numbered quotations</span>
            </h2>
            <p style={{
              maxWidth: '580px', margin: '16px auto 0',
              color: 'var(--text-muted)', lineHeight: 1.8,
            }}>
              Publish your products once. Share one link. Enquiries come back attached to
              the exact product someone was looking at.
            </p>
          </div>
          <CatalogueShowcase />
        </div>
      </section>

      {/* ── ROLE CARDS ── */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span className="pill pill-blue" style={{ marginBottom: '16px' }}>
              <Users size={12} /> Role-Based Access
            </span>
            <h2 style={{ maxWidth: '500px', margin: '16px auto 0' }}>
              One Platform,{' '}
              <span className="gradient-text-amber">Five Roles</span>
            </h2>
            <p style={{ maxWidth: '540px', margin: '12px auto 0', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Each person can change only what their role allows. Add a read-only
              Viewer, or start a role of your own from any of these.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            {ROLES.map((r) => <RoleCard key={r.role} {...r} />)}
          </div>
        </div>
      </section>

      {/* "Why Teams Choose Maks Ops" was a second, six-card features grid
          repeating the twelve above; the testimonials after it were not from
          customers. Both are gone. */}

      {/* ── WAVE TRANSITION → CTA ── */}
      <WaveDivider flip color1="var(--brand-amber)" color2="hsl(22,70%,75%)" />

      {/* ── CTA BAND ── */}
      <section
        style={{
          background: 'linear-gradient(135deg, hsl(25,90%,35%), hsl(28,100%,48%), hsl(35,100%,52%))',
          padding: '96px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle texture overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(circle at 30% 50%, rgba(255,255,255,0.08) 0%, transparent 60%), radial-gradient(circle at 70% 20%, rgba(0,0,0,0.1) 0%, transparent 50%)`,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 'var(--r-full)',
                padding: '4px 16px',
                fontSize: 'var(--t-xs)',
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <Zap size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Beta Access Available Now
            </span>
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              marginBottom: '20px',
              letterSpacing: '-0.03em',
            }}
          >
            Ready to explore the Beta?
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 'var(--t-lg)',
              lineHeight: 1.8,
              marginBottom: '40px',
            }}
          >
            Run your full operation — customers, quotations, purchase orders, GRN,
            production and GST bills — in one connected interface. No setup required.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '32px' }}>
            <button onClick={() => navigate('/login')} className="mk-cta-main">
              <Play size={16} fill="hsl(25,90%,38%)" />
              Test Maks Ops
            </button>
            <Link to="/see-maksops" className="mk-cta-alt">
              Watch the product film
            </Link>
          </div>
          {/* Trust badges in CTA (CSOD-inspired) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {[
              { icon: <Shield size={13} />, text: 'No credit card required' },
              { icon: <CheckCircle size={13} />, text: 'All modules included' },
              { icon: <Users size={13} />, text: 'Multi-role access' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)', fontSize: 'var(--t-sm)' }}>
                {icon} {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
};

export default Welcome;
