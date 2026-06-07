import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ArrowRight, Zap, Map, BarChart3, FileText,
  Truck, ShoppingCart, BookOpen, Receipt, Workflow, Users,
  FolderGit2, CheckCircle, TrendingUp, Package, Shield,
  Play, Star, Building2, HardHat, IndianRupee, Calculator,
  Activity, Brain
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';

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
    quote: 'Nexus Op cut our PO processing time from 3 days to 4 hours. The SCM tracker alone saves our finance team an entire day every week.',
    name: 'Rajesh Kumar', role: 'Project Manager, ORR Package NW-04', avatar: '👷',
  },
  {
    quote: "The RA Bill engine is the most accurate we've used. Retention, TDS, advance recovery — all computed automatically. Zero manual errors.",
    name: 'Priya Sharma', role: 'Finance Head, Kirashi Business Synergies', avatar: '💼',
  },
  {
    quote: 'Having the BOQ, MB, and billing in one system means our site engineers and finance team finally look at the same numbers.',
    name: 'Venkat Rao', role: 'Site Engineer, ORR Package SE-02', avatar: '🏗️',
  },
];

/* ── Logo marquee data ── */
const LOGOS = ['HMDA', 'NHAI', 'L&T Infra', 'Shapoorji Pallonji', 'Afcons', 'IRB Infra', 'KEC Intl', 'Welspun Enterprises'];

/* ── Intersection Observer hook for scroll-triggered animations ── */
const useInView = (threshold = 0.1) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
};

/* ── Animated counter ── */
const Counter = ({ target, suffix = '', duration = 1500 }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView();
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

/* ── Feature card ── */
const FeatureCard = ({ icon, title, desc, delay = 0 }) => {
  const [ref, inView] = useInView(0.05);
  return (
    <div
      ref={ref}
      className="card card-amber"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
        transition: `all 0.5s ease ${delay}ms`,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div className="icon-badge icon-badge-lg">{icon}</div>
      <div>
        <h4 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{title}</h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>{desc}</p>
      </div>
    </div>
  );
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
        borderRadius: '12px',
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
    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>{tagline}</p>
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {modules.map((m) => (
        <li key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <CheckCircle size={12} color={color} />
          {m}
        </li>
      ))}
    </ul>
  </div>
);

/* ── Flow step ── */
const FlowStep = ({ number, label, icon, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '12px',
      borderRadius: '12px',
      transition: 'all 200ms ease',
      opacity: active ? 1 : 0.5,
    }}
  >
    <div
      style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: active ? 'var(--brand-amber)' : 'var(--bg-elevated)',
        border: `2px solid ${active ? 'var(--brand-amber)' : 'var(--border-default)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? '#fff' : 'var(--text-muted)',
        fontSize: '16px',
        boxShadow: active ? 'var(--shadow-amber)' : 'none',
        transition: 'all 250ms ease',
      }}
    >
      {icon}
    </div>
    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: active ? 'var(--brand-amber)' : 'var(--text-muted)', textAlign: 'center', maxWidth: '72px', lineHeight: 1.3 }}>
      {label}
    </span>
  </button>
);

const flowSteps = [
  { label: 'Create Project', icon: <FolderGit2 size={18} />, desc: 'Initialize the project context with client, type, timeline. All subsequent data flows from this.' },
  { label: 'Define BOQ', icon: <FileText size={18} />, desc: 'Set up Bill of Quantities items with itemCode, unit, estimated quantity, and unit rate. This drives all billing.' },
  { label: 'Raise Indent', icon: <Package size={18} />, desc: 'Site engineers raise material requests against specific BOQ items and work orders.' },
  { label: 'Issue PO', icon: <ShoppingCart size={18} />, desc: 'Procurement raises purchase orders against vendor firms. Status: Pending → Approved → Dispatched.' },
  { label: 'Record GRN', icon: <Truck size={18} />, desc: 'On delivery, goods receipt notes are recorded at site. Inventory updates automatically.' },
  { label: 'Log MB', icon: <BookOpen size={18} />, desc: 'Site engineers record physical measurements (L×W×D) at specific chainages in the Measurement Book.' },
  { label: 'Generate Bill', icon: <Receipt size={18} />, desc: 'RA Bills are computed from cumulative MB quantities × BOQ rate, minus TDS (2%) and Retention (5%).' },
];

/* ── Differentiator card (Why Nexus-OP) ── */
const DiffCard = ({ icon, color, title, desc, delay = 0 }) => {
  const [ref, inView] = useInView(0.1);
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
        width: '48px', height: '48px', borderRadius: '14px',
        background: `${color}15`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color,
      }}>{icon}</div>
      <div>
        <h4 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{title}</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>{desc}</p>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────── */
const Welcome = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [heroRef, heroInView] = useInView(0.01);
  const [statsRef, statsInView] = useInView(0.1);
  const [featRef, featInView] = useInView(0.05);

  // Auto-advance flow steps
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((s) => (s + 1) % flowSteps.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  // Auto-advance testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((s) => (s + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  /* ── Marquee animation keyframe (injected once) ── */
  const marqueeStyle = `@keyframes nx-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`;

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{marqueeStyle}</style>

      {/* Announcement Banner */}
      <div
        style={{
          background: 'linear-gradient(90deg, hsl(25,90%,42%), var(--brand-amber), hsl(35,100%,55%))',
          padding: '10px 24px',
          textAlign: 'center',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <span>🚀 Nexus Op Beta is Live — Built for HMDA ORR Package Management</span>
        <button
          onClick={() => navigate('/get-started')}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '4px',
            color: '#fff',
            padding: '2px 10px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background 200ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        >
          Explore Beta <ChevronRight size={12} />
        </button>
      </div>

      <MarketingNav />

      {/* ── HERO (PRESERVED EXACTLY AS ORIGINAL) ── */}
      <section
        className="hero-section"
        ref={heroRef}
        style={{ minHeight: 'calc(100vh - 108px)', paddingTop: '40px', paddingBottom: '80px' }}
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
            gap: '32px',
          }}
        >
          {/* Badge */}
          <div
            className={`pill pill-amber animate-in`}
            style={{ opacity: heroInView ? 1 : 0 }}
          >
            <Zap size={12} />
            Infrastructure Intelligence Platform
          </div>

          {/* Headline */}
          <h1
            className="animate-in stagger-1"
            style={{
              maxWidth: '820px',
              opacity: heroInView ? 1 : 0,
            }}
          >
            The Smart Platform for{' '}
            <span className="gradient-text-amber">Civil Project Delivery</span>
          </h1>

          {/* Subtext */}
          <p
            className="animate-in stagger-2"
            style={{
              maxWidth: '620px',
              fontSize: '1.1rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.8,
              opacity: heroInView ? 1 : 0,
            }}
          >
            From material indents to RA Bills — Nexus Op manages the complete lifecycle
            of infrastructure project operations for{' '}
            <span style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>HMDA's ORR Corridor</span>.
          </p>

          {/* CTA Row */}
          <div
            className="animate-in stagger-3"
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              opacity: heroInView ? 1 : 0,
            }}
          >
            <button
              onClick={() => navigate('/get-started')}
              className="btn-primary"
              style={{ fontSize: '1rem', padding: '16px 32px', gap: '10px' }}
            >
              <Play size={16} fill="#fff" />
              Test Out the Beta
            </button>
            <Link to="/how-it-works" className="btn-ghost" style={{ fontSize: '1rem', padding: '16px 32px' }}>
              How It Works
              <ChevronRight size={16} />
            </Link>
            <button
              onClick={() => navigate('/beta-welcome')}
              className="btn-primary"
              style={{ fontSize: '1rem', padding: '16px 32px', gap: '10px', background: 'var(--accent-blue)', boxShadow: 'var(--shadow-blue)' }}
            >
              <Star size={16} fill="#fff" />
              Test Beta (Cornerstone UI)
            </button>
          </div>

          {/* Trust badges */}
          <div
            className="animate-in stagger-4"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              opacity: heroInView ? 1 : 0,
            }}
          >
            {[
              { icon: <Shield size={14} />, text: 'PostgreSQL Powered' },
              { icon: <TrendingUp size={14} />, text: '15 Core Modules' },
              { icon: <Building2 size={14} />, text: 'HMDA ORR Ready' },
              { icon: <Star size={14} />, text: 'Beta Access Live' },
            ].map(({ icon, text }) => (
              <div
                key={text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ color: 'var(--brand-amber)' }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>

          {/* Dashboard preview image */}
          <div
            className="animate-in stagger-5"
            style={{
              marginTop: '24px',
              width: '100%',
              maxWidth: '1000px',
              borderRadius: '16px',
              border: '1px solid var(--border-default)',
              overflow: 'hidden',
              boxShadow: '0 32px 80px hsl(0,0%,0%,0.5), 0 0 0 1px var(--border-subtle)',
              opacity: heroInView ? 1 : 0,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '32px',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '8px',
                zIndex: 1,
              }}
            >
              {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
                <div key={c} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c, opacity: 0.8 }} />
              ))}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px', fontFamily: 'var(--font-mono)' }}>
                localhost:5173/dashboard
              </span>
            </div>
            <div style={{ paddingTop: '32px', background: 'var(--bg-base)' }}>
              <img
                src={`/nexus-preview.png`}
                alt="Nexus Op Dashboard Preview"
                style={{ width: '100%', display: 'block' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              {/* Fallback Preview */}
              <div
                style={{
                  display: 'none',
                  flexDirection: 'column',
                  background: 'var(--bg-base)',
                  height: '480px',
                  padding: '32px',
                  gap: '24px',
                }}
              >
                {/* KPI Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Active Vendors', val: '6', color: 'var(--accent-blue)' },
                    { label: 'Active POs', val: '3', color: 'hsl(259,90%,70%)' },
                    { label: 'Delivered POs', val: '1', color: 'var(--accent-emerald)' },
                    { label: 'Inventory SKUs', val: '2', color: 'var(--brand-amber)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="kpi-card">
                      <div className="kpi-value" style={{ color }}>{val}</div>
                      <div className="kpi-label">{label}</div>
                    </div>
                  ))}
                </div>
                {/* Chart placeholder */}
                <div
                  style={{
                    flex: 1,
                    background: 'var(--bg-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <BarChart3 size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                    <p style={{ fontSize: '0.875rem' }}>S-Curve · Progress Dashboard · ORR Map</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WAVE TRANSITION: Hero → Stats (CSOD-inspired organic waves) ── */}
      <WaveDivider color1="var(--brand-amber)" color2="hsl(22,70%,75%)" />

      {/* ── STATS STRIP ── */}
      <section ref={statsRef} className="section-sm" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border-subtle)', borderRadius: '16px', overflow: 'hidden' }}>
            {[
              { val: 5, suffix: '×', label: 'Faster Procurement Cycles', icon: '⚡' },
              { val: 15, suffix: '', label: 'Integrated Modules', icon: '📋' },
              { val: 99, suffix: '.8%', label: 'RA Bill Accuracy', icon: '💰' },
              { val: 4, suffix: '', label: 'Active ORR Packages', icon: '🗺️' },
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
                <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{icon}</div>
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
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
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
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-disabled)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Built for India's infrastructure leaders</span>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', animation: 'nx-marquee 30s linear infinite', width: 'max-content' }}>
            {[...LOGOS, ...LOGOS].map((name, i) => (
              <div key={i} style={{
                padding: '8px 40px', borderRight: '1px solid var(--border-subtle)',
                fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-disabled)',
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
            borderRadius: '28px',
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
                Everything for{' '}
                <span className="gradient-text-amber">Infrastructure Ops</span>
              </h2>
              <p
                style={{
                  maxWidth: '540px',
                  margin: '16px auto 0',
                  color: 'var(--text-muted)',
                  opacity: featInView ? 1 : 0,
                  transition: 'opacity 0.5s 0.2s',
                  lineHeight: 1.8,
                }}
              >
                15 integrated modules covering every aspect of civil project management,
                from procurement to billing.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              <FeatureCard delay={0}   icon={<FolderGit2 size={22} />} title="Project Command Center"       desc="Create and manage multiple infrastructure projects with real-time context switching between active packages." />
              <FeatureCard delay={80}  icon={<FileText size={22} />}    title="Bill of Quantities (BOQ)"    desc="Define itemized BOQ line items with unit rates. These rates drive all downstream billing calculations automatically." />
              <FeatureCard delay={160} icon={<Users size={22} />}       title="Vendor Registry"             desc="Onboard contractors with PAN, GSTIN, rating, and capability tags. Bind them to work orders seamlessly." />
              <FeatureCard delay={240} icon={<ShoppingCart size={22} />} title="Purchase Order Tracking"    desc="Raise and track POs from Pending → Approved → Dispatched → Delivered with one-click status transitions." />
              <FeatureCard delay={320} icon={<Truck size={22} />}       title="GRN & Inventory"             desc="Record goods receipt notes at site. Inventory auto-updates on each delivery. Full inward material trail." />
              <FeatureCard delay={400} icon={<BookOpen size={22} />}    title="Measurement Book"            desc="Log chainage-based L×W×D measurements per work order and BOQ item. Yields certified measurable quantities." />
              <FeatureCard delay={480} icon={<Receipt size={22} />}     title="RA Bills Engine"             desc="Compute running-account bills deterministically: (Cumulative MB Qty - Prev Billed) × Rate - 2% TDS - 5% Retention." />
              <FeatureCard delay={560} icon={<Map size={22} />}         title="Live ORR Map"                desc="Interactive Leaflet map showing all 4 ORR packages (SW/SE/NE/NW) with site depots and corridor overlays." />
              <FeatureCard delay={640} icon={<Workflow size={22} />}    title="Process Flow Viz"            desc="ReactFlow + Dagre powered dynamic graph showing Vendor → PO → Bill chain with clickable node details." />
            </div>
          </div>
        </div>
      </section>

      {/* ── PROCESS FLOW PREVIEW ── */}
      <section className="section" style={{ background: 'var(--bg-deep)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span className="pill pill-amber" style={{ marginBottom: '16px' }}>
              <TrendingUp size={12} /> End-to-End Flow
            </span>
            <h2 style={{ maxWidth: '560px', margin: '16px auto 0' }}>
              From Site to Statement,{' '}
              <span className="gradient-text-amber">In 7 Steps</span>
            </h2>
          </div>

          {/* Step indicators */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0',
              marginBottom: '40px',
              overflowX: 'auto',
              padding: '8px 0',
            }}
            className="scrollbar-hide"
          >
            {flowSteps.map((step, i) => (
              <React.Fragment key={step.label}>
                <FlowStep
                  number={i + 1}
                  label={step.label}
                  icon={step.icon}
                  active={activeStep === i}
                  onClick={() => setActiveStep(i)}
                />
                {i < flowSteps.length - 1 && (
                  <div
                    style={{
                      width: '40px',
                      height: '2px',
                      background: activeStep > i ? 'var(--brand-amber)' : 'var(--border-default)',
                      transition: 'background 400ms ease',
                      flexShrink: 0,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Active step detail */}
          <div
            key={activeStep}
            className="glass animate-fade"
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--brand-amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#fff',
                boxShadow: 'var(--shadow-amber)',
              }}
            >
              {flowSteps[activeStep].icon}
            </div>
            <div className="pill pill-amber" style={{ marginBottom: '12px', display: 'inline-flex' }}>
              Step {activeStep + 1} of {flowSteps.length}
            </div>
            <h3 style={{ marginBottom: '12px' }}>{flowSteps[activeStep].label}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.8 }}>
              {flowSteps[activeStep].desc}
            </p>
          </div>

          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <Link to="/how-it-works" className="btn-ghost">
              See Full Walkthrough <ArrowRight size={16} />
            </Link>
          </div>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
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

      {/* ── WHY NEXUS-OP — Differentiator grid (CSOD-inspired) ── */}
      <section className="section" style={{ paddingTop: '48px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span className="pill pill-amber" style={{ marginBottom: '16px' }}>
              <Shield size={12} /> Domain-Built Advantage
            </span>
            <h2 style={{ maxWidth: '580px', margin: '16px auto 0' }}>
              Why Teams Choose{' '}
              <span className="gradient-text-amber">Nexus Op</span>
            </h2>
            <p style={{ maxWidth: '480px', margin: '12px auto 0', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Not a generic ERP. Built specifically for Indian civil infrastructure
              with domain-accurate rules at every step.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <DiffCard delay={0}   icon={<IndianRupee size={22} />} color="var(--brand-amber)"   title="GST-Native Calculations" desc="SGST/CGST/IGST auto-computed from GSTIN state codes. All 37 Indian states, TDS sections 194C, 194I, 194J." />
            <DiffCard delay={80}  icon={<FileText size={22} />}    color="var(--accent-blue)"    title="IS-Standard BBS Engine"  desc="Bar Bending Schedule with cutting length per IS:2502. Unit weight = dia²/162. 5% waste auto-added." />
            <DiffCard delay={160} icon={<BarChart3 size={22} />}   color="var(--accent-emerald)" title="Real RA Bill Formula"     desc="Gross − Prev Bills = Current. Retention 5%, TDS 2% u/s 194C, advance recovery — all auto-computed." />
            <DiffCard delay={240} icon={<Calculator size={22} />}  color="#A78BFA"               title="Estimation Templates"    desc="Earth pit, concrete footing, column, beam, slab, road — pre-built formulas from real site engineering data." />
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
            Trusted by ORR{' '}
            <span className="gradient-text-amber">Corridor Teams</span>
          </h2>

          {/* Testimonial carousel */}
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="glass"
              style={{
                display: activeTestimonial === i ? 'block' : 'none',
                borderRadius: '20px',
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
                fontSize: '1.1rem', color: 'var(--text-primary)',
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
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{t.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t.role}</div>
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
                  borderRadius: '999px',
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
                borderRadius: '9999px',
                padding: '4px 16px',
                fontSize: '0.75rem',
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
              fontSize: '1.05rem',
              lineHeight: 1.8,
              marginBottom: '40px',
            }}
          >
            Access all 15 modules — manage projects, vendors, indents, GRN, and
            billing in one unified interface. No setup required.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '32px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: '#fff',
                color: 'hsl(25,90%,38%)',
                border: 'none',
                borderRadius: '9999px',
                padding: '16px 36px',
                fontWeight: 700,
                fontSize: '1rem',
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
              to="/how-it-works"
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '9999px',
                padding: '15px 32px',
                fontWeight: 600,
                fontSize: '1rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
              Watch How It Works
            </Link>
          </div>
          {/* Trust badges in CTA (CSOD-inspired) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {[
              { icon: <Shield size={13} />, text: 'No credit card required' },
              { icon: <CheckCircle size={13} />, text: 'All modules included' },
              { icon: <Users size={13} />, text: 'Multi-role access' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
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
