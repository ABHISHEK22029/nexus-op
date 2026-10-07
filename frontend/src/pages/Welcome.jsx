import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ArrowRight, Zap, Map, BarChart3, FileText,
  Truck, ShoppingCart, BookOpen, Receipt, Workflow, Users,
  FolderGit2, CheckCircle, TrendingUp, Package, Shield,
  Play, Star, Building2, HardHat, IndianRupee, Calculator,
  Activity, Brain, Factory, ShoppingBag, Files, ReceiptText, Store,
  Link2, ShieldCheck,
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import useInView from '../hooks/useInView';
import FlowShowcase from '../components/marketing/flow/FlowShowcase';
import CatalogueShowcase from '../components/marketing/CatalogueShowcase';
import { FeatureGrid } from '../components/marketing/FeatureDiagrams';
import PromiseCheck from '../components/marketing/PromiseCheck';

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

/* ── Testimonials data ── */
const TESTIMONIALS = [
  {
    quote: 'Maks Ops cut our order-to-PO time from 3 days to a few hours. Comparing three vendor quotes and raising the PO is now one screen.',
    name: 'Rajesh Kumar', role: 'Operations Head, Precision Fabricators', avatar: '👷',
  },
  {
    quote: "The billing is the most accurate we've used. GST, TDS, retention, freight — all computed automatically on a proper tax invoice. Zero manual errors.",
    name: 'Priya Sharma', role: 'Finance Head, Kirashi Business Synergies', avatar: '💼',
  },
  {
    quote: 'Material in, finished goods out, scrap sold — the yield view finally tells us the real cost per piece. We stopped guessing.',
    name: 'Venkat Rao', role: 'Plant Manager, Metro Steel Works', avatar: '🏗️',
  },
];

/* ── Logo marquee data ── */
const LOGOS = ['Fabrication', 'Steel & Metals', 'Manufacturing', 'EPC Contractors', 'Trading & Distribution', 'Solar & Power', 'Machinery', 'Infrastructure'];

/* The local copy of useInView that lived here has been replaced by the
   shared hook (hooks/useInView). Two copies of the same observer was exactly
   the drift extracting it was meant to prevent — and this one never
   disconnected after firing, so every reveal on the page kept an observer
   attached for the life of the session.

   Everything here wants a ONE-TIME reveal, so these call sites take `seen`
   (the second value) and pass once:true. Looping animations take the third
   value instead, so they only run while actually on screen. */

/* ── Animated counter ── */
const Counter = ({ target, suffix = '', duration = 1500 }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView(0.1, { once: true });
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);
  return <span ref={ref}>{count}{suffix}</span>;
};

/* ── Role card ── */
const RoleCard = ({ emoji, role, tagline, modules, color }) => (
  <div
    className="card"
    style={{
      borderColor: `${color}22`,
      transition: 'all 250ms ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = `${color}55`;
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 12px 40px ${color}15`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = `${color}22`;
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <div
      style={{
        width: '48px',
        height: '48px',
        borderRadius: 'var(--r-md)',
        background: `${color}15`,
        border: `1px solid ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        marginBottom: '16px',
      }}
    >
      {emoji}
    </div>
    <h4 style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>{role}</h4>
    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-muted)', marginBottom: '14px' }}>{tagline}</p>
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {modules.map((m) => (
        <li key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--t-sm)', color: 'var(--text-secondary)' }}>
          <CheckCircle size={12} color={color} />
          {m}
        </li>
      ))}
    </ul>
  </div>
);

/* ── Differentiator card (Why Maks Ops) ── */
const DiffCard = ({ icon, color, title, desc, delay = 0 }) => {
  const [ref, inView] = useInView(0.1, { once: true });
  return (
    <div
      ref={ref}
      className="card"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
        transition: `all 0.5s ease ${delay}ms`,
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}55`;
        e.currentTarget.style.boxShadow = `0 12px 40px ${color}15`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{
        width: '48px', height: '48px', borderRadius: 'var(--r-md)',
        background: `${color}15`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color,
      }}>{icon}</div>
      <div>
        <h4 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{title}</h4>
        <p style={{ fontSize: 'var(--t-base)', color: 'var(--text-muted)', lineHeight: 1.7 }}>{desc}</p>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────── */
const Welcome = () => {
  const navigate = useNavigate();
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [heroRef, heroInView] = useInView(0.01, { once: true });
  const [statsRef, statsInView] = useInView(0.1, { once: true });
  const [featRef, featInView] = useInView(0.05, { once: true });

  // Auto-advance testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((s) => (s + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  /* The logo strip loops forever; it pauses while it is off screen, like
     every other loop on this page — a reader at the footer should not be
     paying for a marquee they scrolled past. */
  const [marqueeRef, , marqueeVisible] = useInView(0);

  /* ── Marquee animation keyframe (injected once) ── */
  const marqueeStyle = `@keyframes nx-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`;

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{marqueeStyle}</style>

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
          <div className="pill pill-amber animate-in" style={{ opacity: heroInView ? 1 : 0 }}>
            <Zap size={12} /> Operations flow
          </div>

          <h1 className="animate-in stagger-1 mk-hero-h1" style={{ opacity: heroInView ? 1 : 0 }}>
            From catalogue <span className="mk-hero-accent">to cash.</span>
          </h1>

          <p className="animate-in stagger-2 mk-hero-lede" style={{ opacity: heroInView ? 1 : 0 }}>
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

      {/* ── WAVE TRANSITION: Hero → Stats (CSOD-inspired organic waves) ── */}
      <WaveDivider color1="var(--brand-amber)" color2="hsl(22,70%,75%)" />

      {/* ── STATS STRIP ── */}
      <section ref={statsRef} className="section-sm" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <div className="mk-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1px', background: 'var(--border-subtle)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {[
              { val: 5, suffix: '×', label: 'Faster Order-to-Bill', icon: '⚡' },
              { val: 20, suffix: '+', label: 'Integrated Modules', icon: '📋' },
              { val: 100, suffix: '%', label: 'GST-Accurate Billing', icon: '💰' },
              { val: 1, suffix: '', label: 'Connected Flow', icon: '🔗' },
            ].map(({ val, suffix, label, icon }) => (
              <div
                key={label}
                style={{
                  background: 'var(--bg-surface)',
                  padding: '40px 24px',
                  textAlign: 'center',
                  opacity: statsInView ? 1 : 0,
                  transition: 'opacity 0.6s ease',
                }}
              >
                <div style={{ fontSize: 'var(--t-2xl)', marginBottom: '10px' }}>{icon}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2.6rem',
                    fontWeight: 800,
                    color: 'var(--brand-amber)',
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                    marginBottom: '10px',
                  }}
                >
                  {statsInView ? <Counter target={val} suffix={suffix} /> : `0${suffix}`}
                </div>
                <div style={{ fontSize: 'var(--t-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI & SMART KNOWLEDGE HIGHLIGHT (new) ── */}
      <section className="section" style={{ paddingTop: '56px', paddingBottom: '24px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span className="pill pill-amber" style={{ marginBottom: '16px' }}><Brain size={12} /> New in Beta · Intelligence</span>
            <h2 style={{ maxWidth: '620px', margin: '16px auto 0' }}>
              Answers and guidance, <span className="gradient-text-amber">built in</span>
            </h2>
            <p style={{ maxWidth: '580px', margin: '16px auto 0', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Never get stuck. <b>Ask AI</b> knows your data and your workflow, and <b>Smart Knowledge</b> documents
              every step — all inside Maks Ops, on every screen.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', maxWidth: '900px', margin: '0 auto' }}>
            {[
              { icon: <Brain size={24} />, title: 'Ask AI', to: '/knowledge', cta: 'Try Ask AI',
                desc: 'A read-only assistant on every screen. Ask "what\'s overdue?", "what needs approval?", or "how do I raise a PO?" — grounded in your own data, and it points you to the right screen. Stays strictly on Maks Ops topics.' },
              { icon: <BookOpen size={24} />, title: 'Smart Knowledge', to: '/knowledge', cta: 'Browse guides',
                desc: 'A searchable library of guides and how-tos for every part of the platform — orders, procurement, production, GST billing and more. One click to "Ask AI a follow-up" from any article.' },
            ].map((c) => (
              <div key={c.title} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '28px', boxShadow: '0 8px 40px hsl(28,40%,50%,0.06)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))', marginBottom: '16px' }}>{c.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-xl)', fontWeight: 800, margin: '0 0 8px' }}>{c.title}</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 18px', fontSize: 'var(--t-base)' }}>{c.desc}</p>
                <Link to={c.to} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--brand-amber)', fontWeight: 700, fontSize: 'var(--t-base)', textDecoration: 'none' }}>
                  {c.cta} <ArrowRight size={15} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

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
          <div style={{ display: 'flex', animation: 'nx-marquee 30s linear infinite', animationPlayState: marqueeVisible ? 'running' : 'paused', width: 'max-content' }}>
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

      {/* ── KNOW WHAT YOU CAN PROMISE ──────────────────────────────────
             The full list of 39 screens that lived here has moved to the
             platform page. The homepage has one job — show that Maks Ops
             connects the operation — and a catalogue of every screen works
             against it; it reads as a spec sheet and buries the two or three
             ideas that make someone want to look further.

             This is one of those ideas. "We have inventory management" is
             something every competitor says. What the deficiency engine
             actually answers is the question a fabricator asks before quoting
             a date: can we fulfil this? */}
      <section className="section" style={{ background: 'var(--bg-deep)' }}>
        <div className="container">
          <PromiseCheck />
        </div>
      </section>

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
              <span className="gradient-text-amber">Four Roles</span>
            </h2>
          </div>

          <div className="mk-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '20px' }}>
            <RoleCard
              emoji="👑"
              role="Admin"
              tagline="Full platform access across all projects and modules"
              color="#FF7A00"
              modules={['All 15 modules', 'Project creation', 'Vendor management', 'Bill approval']}
            />
            <RoleCard
              emoji="👷"
              role="Engineer"
              tagline="Field operations: indents, GRN, measurement book"
              color="#3B82F6"
              modules={['Indent requests', 'GRN recording', 'MB entries', 'Inventory view']}
            />
            <RoleCard
              emoji="💼"
              role="Finance"
              tagline="Financial oversight: bills, payments, dashboard"
              color="#22C55E"
              modules={['RA Bills engine', 'Dashboard KPIs', 'Activity log', 'Report view']}
            />
            <RoleCard
              emoji="🏢"
              role="Vendor"
              tagline="Track your assigned purchase orders and deliveries"
              color="#A78BFA"
              modules={['Purchase orders', 'Delivery status', 'GRN confirmation']}
            />
          </div>
        </div>
      </section>

      {/* ── WHY MAKS OPS — Differentiator grid (CSOD-inspired) ── */}
      <section className="section" style={{ paddingTop: '48px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span className="pill pill-amber" style={{ marginBottom: '16px' }}>
              <Shield size={12} /> Domain-Built Advantage
            </span>
            <h2 style={{ maxWidth: '580px', margin: '16px auto 0' }}>
              Why Teams Choose{' '}
              <span className="gradient-text-amber">Maks Ops</span>
            </h2>
            <p style={{ maxWidth: '480px', margin: '12px auto 0', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Not a generic ERP. Built for Indian SMEs — fabricators, traders and
              contractors — with GST-accurate rules and a flow that connects end to end.
            </p>
          </div>
          <div className="mk-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px' }}>
            <DiffCard delay={0}   icon={<IndianRupee size={22} />} color="var(--brand-amber)"   title="GST-Native Calculations" desc="SGST/CGST/IGST auto-computed from GSTIN state codes. All 37 Indian states, TDS sections 194C, 194I, 194J." />
            <DiffCard delay={80}  icon={<Workflow size={22} />}    color="var(--accent-blue)"    title="One Connected Flow"      desc="Customer order → quotation → PO → GRN → bill, all linked and traceable. No re-typing, no islands — the data flows through." />
            <DiffCard delay={160} icon={<BarChart3 size={22} />}   color="var(--accent-emerald)" title="Real Billing Math"        desc="RA bills and GRN bills compute GST, TDS, retention, freight and discounts exactly — proper print-ready tax invoices." />
            <DiffCard delay={240} icon={<Factory size={22} />}     color="#A78BFA"               title="Fabrication Yield"       desc="Track raw material in, finished goods out, and scrap — with live yield %, material reconciliation and true cost per piece." />
            <DiffCard delay={320} icon={<Activity size={22} />}    color="#EC4899"               title="Full Audit Trail"        desc="Every approval, status change, and payment is logged with timestamp, user, and reason. 100% auditable." />
            <DiffCard delay={400} icon={<Brain size={22} />}       color="#06B6D4"               title="Intelligence Alerts"     desc="Overdue PO alerts, milestone delay detection, low-stock warnings, vendor agreement expiry — all automated." />
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS (CSOD customer stories style) ── */}
      <section className="section" style={{ background: 'var(--bg-deep)' }}>
        <div className="container-narrow" style={{ textAlign: 'center' }}>
          <span className="pill pill-emerald" style={{ marginBottom: '16px' }}>
            <Star size={12} /> From Our Users
          </span>
          <h2 style={{ maxWidth: '480px', margin: '16px auto 48px' }}>
            Built for teams{' '}
            <span className="gradient-text-amber">leaving Excel behind</span>
          </h2>

          {/* Testimonial carousel */}
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="glass"
              style={{
                display: activeTestimonial === i ? 'block' : 'none',
                borderRadius: 'var(--r-lg)',
                padding: '40px 48px',
                maxWidth: '700px',
                margin: '0 auto',
                animation: activeTestimonial === i ? 'fade-in-fast 0.5s ease' : 'none',
              }}
            >
              <div style={{
                fontSize: '3.5rem', color: 'var(--brand-amber)', lineHeight: 1,
                marginBottom: '8px', fontFamily: 'Georgia, serif', opacity: 0.7,
              }}>"</div>
              <p style={{
                fontSize: 'var(--t-lg)', color: 'var(--text-primary)',
                lineHeight: 1.8, fontStyle: 'italic',
                marginBottom: '28px',
              }}>{t.quote}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--brand-amber-muted)', border: '2px solid hsl(28,100%,54%,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>{t.avatar}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--t-base)' }}>{t.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--t-sm)' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Dot indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTestimonial(i)}
                style={{
                  width: activeTestimonial === i ? 24 : 8, height: 8,
                  borderRadius: 'var(--r-full)',
                  background: activeTestimonial === i ? 'var(--brand-amber)' : 'var(--border-emphasis)',
                  border: 'none', cursor: 'pointer',
                  transition: 'all 300ms ease',
                }}
              />
            ))}
          </div>
        </div>
      </section>

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
              ⚡ Beta Access Available Now
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
            <button
              onClick={() => navigate('/login')}
              style={{
                background: '#fff',
                color: 'hsl(25,90%,38%)',
                border: 'none',
                borderRadius: 'var(--r-full)',
                padding: '16px 36px',
                fontWeight: 700,
                fontSize: 'var(--t-md)',
                cursor: 'pointer',
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'var(--font-body)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
              }}
            >
              <Play size={16} fill="hsl(25,90%,38%)" />
              Open the Beta Platform
            </button>
            <Link
              to="/see-maksops"
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: 'var(--r-full)',
                padding: '15px 32px',
                fontWeight: 600,
                fontSize: 'var(--t-md)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
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
