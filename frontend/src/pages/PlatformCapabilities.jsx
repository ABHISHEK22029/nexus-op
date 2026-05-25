import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ArrowRight, FolderGit2, FileText, Users,
  ShoppingCart, Truck, BookOpen, Receipt, Map, Workflow,
  BarChart3, Package, Milestone, Activity, CheckCircle2,
  Zap, Play
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';

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

const modules = [
  {
    id: 'projects',
    icon: <FolderGit2 size={20} />,
    label: 'Projects',
    title: 'Project Command Center',
    color: '#3B82F6',
    description: 'Create and manage top-level enterprise project contexts. Each project houses its own vendors, work orders, BOQ, procurement, and billing data.',
    bullets: [
      'Civil Construction & Generic project types',
      'Context-switching — all modules filter by active project',
      'Client, timeline, and status tracking',
      'Project-scoped vendor and work order registry',
    ],
  },
  {
    id: 'boq',
    icon: <FileText size={20} />,
    label: 'BOQ',
    title: 'Bill of Quantities',
    color: '#A78BFA',
    description: 'Define itemized BOQ line items with item codes, descriptions, unit types, estimated quantities, and unit rates. These rates are the backbone of all billing.',
    bullets: [
      'Item codes like EW-01, BT-03 with units (Cum, MT, Sqm)',
      'Estimated vs actual quantity tracking',
      'Rate-based billing computation engine',
      'Linked to Indent, MB, and RA Bill modules',
    ],
  },
  {
    id: 'procurement',
    icon: <ShoppingCart size={20} />,
    label: 'Procurement',
    title: 'Indent → PO → GRN Pipeline',
    color: '#FF7A00',
    description: 'Full procurement lifecycle from site-level material requests to vendor delivery and inventory receipt.',
    bullets: [
      'Indent: Site engineer raises material request against BOQ',
      'Purchase Order: Raised against vendor, tracks Pending → Approved → Dispatched',
      'GRN: Records physical delivery, auto-updates inventory',
      'Full audit trail via Activity Log',
    ],
  },
  {
    id: 'mb',
    icon: <BookOpen size={20} />,
    label: 'Measurement Book',
    title: 'Field Measurement Recording',
    color: '#EC4899',
    description: 'Site engineers log precise chainage-based measurements (L×W×D) that form the certified evidence for billing.',
    bullets: [
      'Chainage-based entries (e.g., CH 10+500 to CH 10+600)',
      'Auto-computed yield: Length × Width × Depth = Volume',
      'Linked to Work Order and BOQ item',
      'Drives cumulative billed quantity in RA Bills',
    ],
  },
  {
    id: 'billing',
    icon: <Receipt size={20} />,
    label: 'RA Bills',
    title: 'Running Account Bills Engine',
    color: '#EF4444',
    description: 'Deterministic, math-driven bill generation from certified MB quantities. No manual calculation errors.',
    bullets: [
      'Cumulative MB Qty minus previously billed quantity',
      'Gross = Net Quantity × BOQ Rate',
      '2% TDS deduction (Income Tax)',
      '5% Retention deduction (Performance guarantee)',
    ],
  },
  {
    id: 'analytics',
    icon: <BarChart3 size={20} />,
    label: 'Dashboard & Analytics',
    title: 'Executive Analytics Suite',
    color: '#22C55E',
    description: 'High-level KPI overview with S-Curve progress tracking and live ORR map visualization.',
    bullets: [
      'KPI cards: Vendors, POs, Delivered, Inventory SKUs',
      'S-Curve: Planned vs Actual progress over 18-month timeline',
      'Live Leaflet map of ORR corridor packages',
      'PO status distribution via Recharts',
    ],
  },
  {
    id: 'flow',
    icon: <Workflow size={20} />,
    label: 'Process Flow',
    title: 'Dynamic Process Graph',
    color: '#6366F1',
    description: 'ReactFlow + Dagre-powered automatic graph layout showing the full procurement chain from vendor to bill.',
    bullets: [
      'Vendor nodes → PO nodes → RA Bill nodes',
      'Animated edges for active deliveries',
      'Click any node for detailed panel',
      'Auto-layout via Dagre graph engine',
    ],
  },
];

const PlatformCapabilities = () => {
  const [activeTab, setActiveTab] = useState('projects');
  const navigate = useNavigate();
  const [headerRef, headerInView] = useInView(0.1);

  const activeModule = modules.find(m => m.id === activeTab);

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <MarketingNav />

      {/* Hero */}
      <section
        ref={headerRef}
        style={{
          background: 'var(--bg-deep)',
          padding: '100px 24px 80px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="hero-mesh">
          <div className="blob blob-amber" style={{ width: '500px', height: '500px', top: '-20%', right: '-10%', opacity: 0.1 }} />
          <div className="blob blob-blue" style={{ width: '400px', height: '400px', bottom: '-10%', left: '-5%', opacity: 0.08 }} />
        </div>
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <span className="pill pill-amber" style={{ marginBottom: '20px', opacity: headerInView ? 1 : 0, transition: 'opacity 0.5s' }}>
            <Zap size={12} /> Platform Deep-Dive
          </span>
          <h1
            style={{
              maxWidth: '700px',
              margin: '0 auto 20px',
              opacity: headerInView ? 1 : 0,
              transform: headerInView ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease 0.1s',
            }}
          >
            The Full Stack for{' '}
            <span className="gradient-text-amber">Infrastructure Delivery</span>
          </h1>
          <p
            style={{
              maxWidth: '560px',
              margin: '0 auto 36px',
              color: 'var(--text-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.8,
              opacity: headerInView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.2s',
            }}
          >
            7 core capability areas covering the complete lifecycle of civil project operations.
            Click any module to explore its features.
          </p>
        </div>
      </section>

      {/* Module Tabs */}
      <div
        style={{
          position: 'sticky',
          top: '68px',
          zIndex: 50,
          background: 'var(--bg-surface)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: '0 2px 16px hsl(30,20%,50%,0.08)',
        }}
      >
        <div
          className="container scrollbar-hide"
          style={{ overflowX: 'auto', display: 'flex', gap: '4px', padding: '10px 24px' }}
        >
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveTab(mod.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: activeTab === mod.id ? `1px solid ${mod.color}44` : '1px solid transparent',
                background: activeTab === mod.id ? `${mod.color}12` : 'transparent',
                color: activeTab === mod.id ? mod.color : 'var(--text-muted)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 200ms ease',
                fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => {
                if (activeTab !== mod.id) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                }
              }}
              onMouseLeave={e => {
                if (activeTab !== mod.id) {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {mod.icon}
              {mod.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Module Detail */}
      <section className="section">
        <div className="container">
          {activeModule && (
            <div
              key={activeModule.id}
              className="animate-in"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}
            >
              {/* Left: Content */}
              <div>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: `${activeModule.color}15`,
                    border: `1px solid ${activeModule.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: activeModule.color,
                    marginBottom: '24px',
                  }}
                >
                  {activeModule.icon}
                </div>
                <h2 style={{ marginBottom: '16px' }}>{activeModule.title}</h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '32px', fontSize: '1rem' }}>
                  {activeModule.description}
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
                  {activeModule.bullets.map((b) => (
                    <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={16} color={activeModule.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                      {b}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn-primary"
                >
                  Try in Beta <ArrowRight size={16} />
                </button>
              </div>

              {/* Right: Visual placeholder */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: '20px',
                  border: `1px solid ${activeModule.color}22`,
                  height: '420px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  boxShadow: `0 0 60px ${activeModule.color}08`,
                }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '20px',
                    background: `${activeModule.color}12`,
                    border: `2px solid ${activeModule.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: activeModule.color,
                    fontSize: '36px',
                  }}
                >
                  {activeModule.icon}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', maxWidth: '200px' }}>
                  {activeModule.label} module live in the beta platform
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    borderRadius: '9999px',
                    border: `1px solid ${activeModule.color}40`,
                    background: `${activeModule.color}10`,
                    color: activeModule.color,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 200ms',
                  }}
                >
                  <Play size={13} />
                  Open Live Demo
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Technology Strip */}
      <section className="section-sm" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <p style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '32px' }}>
            Built with modern open-source technologies
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '40px', flexWrap: 'wrap' }}>
            {['React 19', 'Node.js', 'SQLite', 'Leaflet', 'ReactFlow', 'Recharts', 'Vite', 'TailwindCSS'].map((tech) => (
              <span
                key={tech}
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="container-narrow">
          <h2 style={{ marginBottom: '16px' }}>
            See it all in the{' '}
            <span className="gradient-text-amber">Live Beta</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1rem' }}>
            All 7 capability areas are live and fully functional in the beta platform.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ fontSize: '1rem', padding: '16px 32px' }}>
            <Play size={16} fill="#fff" /> Open the Beta Platform
          </button>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
};

export default PlatformCapabilities;
