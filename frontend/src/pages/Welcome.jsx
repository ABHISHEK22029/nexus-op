import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ArrowRight, Zap, Map, BarChart3, FileText,
  Truck, ShoppingCart, BookOpen, Receipt, Workflow, Users,
  FolderGit2, CheckCircle, TrendingUp, Package, Shield,
  Play, Star, Building2, HardHat
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';

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

/* ─────────────────────────────────────────────── */
const Welcome = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
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

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
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
          onClick={() => navigate('/dashboard')}
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

      {/* ── HERO ── */}
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
              onClick={() => navigate('/dashboard')}
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
              { icon: <Shield size={14} />, text: 'SQLite Powered' },
              { icon: <TrendingUp size={14} />, text: '12 Core Modules' },
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
                  // Fallback: render a styled placeholder if image doesn't exist
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

      {/* ── STATS STRIP ── */}
      <section ref={statsRef} className="section-sm" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border-subtle)' }}>
            {[
              { val: 5, suffix: '×', label: 'Faster Procurement Cycles', icon: '⚡' },
              { val: 12, suffix: '', label: 'Integrated Modules', icon: '📋' },
              { val: 99, suffix: '.8%', label: 'RA Bill Accuracy', icon: '💰' },
              { val: 4, suffix: '', label: 'Active ORR Packages', icon: '🗺️' },
            ].map(({ val, suffix, label, icon }) => (
              <div
                key={label}
                style={{
                  background: 'var(--bg-surface)',
                  padding: '32px 24px',
                  textAlign: 'center',
                  opacity: statsInView ? 1 : 0,
                  transition: 'opacity 0.6s ease',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{icon}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2.4rem',
                    fontWeight: 800,
                    color: 'var(--brand-amber)',
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                    marginBottom: '8px',
                  }}
                >
                  {statsInView ? <Counter target={val} suffix={suffix} /> : `0${suffix}`}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="section" id="features" ref={featRef}>
        <div className="container">
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
                maxWidth: '520px',
                margin: '16px auto 0',
                color: 'var(--text-muted)',
                opacity: featInView ? 1 : 0,
                transition: 'opacity 0.5s 0.2s',
              }}
            >
              12 integrated modules covering every aspect of civil project management,
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
              modules={['All 12 modules', 'Project creation', 'Vendor management', 'Bill approval']}
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

      {/* ── CTA BAND ── */}
      <section
        style={{
          background: 'linear-gradient(135deg, hsl(25,90%,35%), hsl(28,100%,48%), hsl(35,100%,52%))',
          padding: '80px 24px',
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
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
              marginBottom: '16px',
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
              marginBottom: '36px',
            }}
          >
            Access all 12 modules — manage projects, vendors, indents, GRN, and
            billing in one unified interface. No setup required.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
};

export default Welcome;
