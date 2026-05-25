import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FolderGit2, FileText, Users, ShoppingCart, Truck, BookOpen,
  Receipt, CheckCircle2, ArrowRight, Zap, Play, ChevronRight
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';

const useInView = (threshold = 0.15) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
};

const steps = [
  {
    number: 1,
    icon: <FolderGit2 size={28} />,
    title: 'Create a Project',
    description: 'Start by creating a project context — the master record all data flows from.',
    color: '#3B82F6',
    details: [
      'Set project name, client, and type (Civil / Generic)',
      'Define start date and expected end date',
      'All modules — vendors, POs, bills — are scoped to this project',
      'Switch context anytime from the top bar',
    ],
  },
  {
    number: 2,
    icon: <Users size={28} />,
    title: 'Onboard Vendors',
    description: 'Register contractor firms with financial and compliance details.',
    color: '#A78BFA',
    details: [
      'Enter vendor name, PAN, GSTIN, and bank details',
      'Assign specialty (Earthwork, Concrete, Bitumen, etc.)',
      'Set performance rating (1–5 stars)',
      'Vendor is now selectable in Work Order and PO creation',
    ],
  },
  {
    number: 3,
    icon: <FileText size={28} />,
    title: 'Define BOQ Items',
    description: 'Set the Bill of Quantities — your pricing bible for the project.',
    color: '#EC4899',
    details: [
      'Create items: EW-01 (Earthwork Excavation), BT-03 (Bituminous Concrete), etc.',
      'Specify unit (Cum, MT, Sqm, RM) and estimated quantity',
      'Enter the unit rate (₹/unit) — this drives all billing math',
      'BOQ items link to Indents, MBs, and RA Bills',
    ],
  },
  {
    number: 4,
    icon: <ShoppingCart size={28} />,
    title: 'Raise Indents & Issue Purchase Orders',
    description: 'Site needs material? Raise an indent. Procurement converts it to a PO.',
    color: '#FF7A00',
    details: [
      'Indent: "I need 50 Cum of sand" — linked to work order + BOQ item',
      'Procurement reviews and raises a Purchase Order against a vendor',
      'PO status: Pending → Finance Approved → Dispatched',
      'Full audit trail in Activity Log',
    ],
  },
  {
    number: 5,
    icon: <Truck size={28} />,
    title: 'Record GRN at Site',
    description: 'When material arrives on-site, record the Goods Receipt Note.',
    color: '#22C55E',
    details: [
      'Select the Purchase Order and record actual received quantity',
      'Inventory auto-updates with new stock',
      'Partial deliveries supported — GRN per delivery batch',
      'PO status automatically moves to Delivered',
    ],
  },
  {
    number: 6,
    icon: <BookOpen size={28} />,
    title: 'Log Measurements in MB',
    description: 'Site engineers enter certified field measurements into the Measurement Book.',
    color: '#F59E0B',
    details: [
      'Specify chainage: CH 10+500 to CH 10+600 (100m stretch)',
      'Enter dimensions: Length × Width × Depth',
      'System computes yield automatically',
      'MB entries are the certified basis for RA Bill generation',
    ],
  },
  {
    number: 7,
    icon: <Receipt size={28} />,
    title: 'Generate the RA Bill',
    description: 'Bills are computed automatically from certified MB quantities and BOQ rates.',
    color: '#EF4444',
    details: [
      'Select BOQ item → system aggregates all MB entries',
      'Net Qty = Cumulative MB Qty − Previously Billed Qty',
      'Gross Amount = Net Qty × BOQ Unit Rate',
      'Deductions: −2% TDS (Income Tax) + −5% Retention',
      'Net Payable = Gross − TDS − Retention',
    ],
  },
];

const StepCard = ({ step, index, isLeft }) => {
  const [ref, inView] = useInView(0.1);
  return (
    <div
      ref={ref}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 1fr',
        gap: '0',
        alignItems: 'flex-start',
        marginBottom: '0',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(32px)',
        transition: `all 0.6s ease ${index * 80}ms`,
      }}
    >
      {/* Left content area */}
      {isLeft ? (
        <div style={{ padding: '0 40px 48px 0', textAlign: 'right' }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${step.color}22`,
              borderRadius: '16px',
              padding: '28px',
              transition: 'all 250ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${step.color}44`;
              e.currentTarget.style.transform = 'translateX(-4px)';
              e.currentTarget.style.boxShadow = `0 8px 32px ${step.color}10`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = `${step.color}22`;
              e.currentTarget.style.transform = 'translateX(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <h3 style={{ marginBottom: '10px', color: 'var(--text-primary)' }}>{step.title}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.7 }}>
              {step.description}
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
              {step.details.map((d) => (
                <li key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)', flexDirection: 'row-reverse' }}>
                  <CheckCircle2 size={14} color={step.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* Center line + circle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${step.color}22, ${step.color}44)`,
            border: `2px solid ${step.color}66`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: step.color,
            boxShadow: `0 0 24px ${step.color}22`,
            flexShrink: 0,
            zIndex: 1,
            position: 'relative',
          }}
        >
          {step.icon}
        </div>
        <div
          style={{
            width: '2px',
            flex: 1,
            minHeight: '80px',
            background: `linear-gradient(to bottom, ${step.color}44, var(--border-subtle))`,
          }}
        />
      </div>

      {/* Right content area */}
      {!isLeft ? (
        <div style={{ padding: '0 0 48px 40px' }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${step.color}22`,
              borderRadius: '16px',
              padding: '28px',
              transition: 'all 250ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${step.color}44`;
              e.currentTarget.style.transform = 'translateX(4px)';
              e.currentTarget.style.boxShadow = `0 8px 32px ${step.color}10`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = `${step.color}22`;
              e.currentTarget.style.transform = 'translateX(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <h3 style={{ marginBottom: '10px', color: 'var(--text-primary)' }}>{step.title}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.7 }}>
              {step.description}
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {step.details.map((d) => (
                <li key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={14} color={step.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
};

const HowItWorks = () => {
  const navigate = useNavigate();
  const [heroRef, heroInView] = useInView(0.01);

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <MarketingNav />

      {/* Hero */}
      <section
        ref={heroRef}
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
          <div className="blob blob-amber" style={{ width: '400px', height: '400px', top: '-15%', left: '-5%', opacity: 0.1 }} />
          <div className="blob blob-blue" style={{ width: '350px', height: '350px', bottom: '-10%', right: '-5%', opacity: 0.08 }} />
        </div>
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <span
            className="pill pill-amber"
            style={{ marginBottom: '20px', opacity: heroInView ? 1 : 0, transition: 'opacity 0.5s' }}
          >
            <Zap size={12} /> Complete Workflow Guide
          </span>
          <h1
            style={{
              maxWidth: '700px',
              margin: '0 auto 20px',
              opacity: heroInView ? 1 : 0,
              transform: heroInView ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease 0.1s',
            }}
          >
            From Site to Statement,{' '}
            <span className="gradient-text-amber">In One Flow</span>
          </h1>
          <p
            style={{
              maxWidth: '560px',
              margin: '0 auto 40px',
              color: 'var(--text-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.8,
              opacity: heroInView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.2s',
            }}
          >
            A step-by-step walkthrough of how Nexus Op handles every stage of civil
            project procurement and billing — from project creation to RA Bill generation.
          </p>
          {/* Step counter badges */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              opacity: heroInView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.3s',
            }}
          >
            {steps.map((s) => (
              <span
                key={s.number}
                className="pill"
                style={{
                  background: `${s.color}12`,
                  border: `1px solid ${s.color}30`,
                  color: s.color,
                }}
              >
                {s.number}. {s.title}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Steps */}
      <section className="section">
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
          {steps.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} isLeft={i % 2 === 0} />
          ))}
        </div>
      </section>

      {/* RA Bill Formula highlight */}
      <section
        className="section-sm"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="container-narrow" style={{ textAlign: 'center' }}>
          <span className="pill pill-amber" style={{ marginBottom: '20px' }}>
            <Receipt size={12} /> RA Bill Formula
          </span>
          <h3 style={{ marginBottom: '32px' }}>The Math Behind Every Bill</h3>
          <div
            style={{
              background: 'hsl(225, 40%, 6%, 0.6)',
              border: '1px solid var(--border-default)',
              borderRadius: '16px',
              padding: '32px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              lineHeight: 2,
              textAlign: 'left',
              color: 'var(--text-secondary)',
            }}
          >
            <div><span style={{ color: '#22C55E' }}>Net Qty</span>         = Cumulative MB Qty − Previously Billed Qty</div>
            <div><span style={{ color: '#3B82F6' }}>Gross Amount</span>    = Net Qty × BOQ Unit Rate (₹)</div>
            <div><span style={{ color: '#EF4444' }}>TDS (2%)</span>        = Gross Amount × 0.02</div>
            <div><span style={{ color: '#F59E0B' }}>Retention (5%)</span>  = Gross Amount × 0.05</div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '8px', paddingTop: '8px' }}>
              <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>Net Payable</span>   = Gross Amount − TDS − Retention
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="container-narrow">
          <h2 style={{ marginBottom: '16px' }}>
            Ready to{' '}
            <span className="gradient-text-amber">experience the flow?</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '36px', fontSize: '1rem', lineHeight: 1.8 }}>
            Open the beta platform and follow these exact steps. All data is pre-seeded so you
            can explore the full cycle without any setup.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary"
              style={{ fontSize: '1rem', padding: '16px 32px' }}
            >
              <Play size={16} fill="#fff" />
              Open the Beta Platform
            </button>
            <Link to="/platform" className="btn-ghost" style={{ fontSize: '1rem', padding: '16px 32px' }}>
              Explore Capabilities
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
};

export default HowItWorks;
