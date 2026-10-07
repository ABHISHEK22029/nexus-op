import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FolderGit2, FileText, Users, ShoppingCart, Truck, BookOpen,
  Receipt, CheckCircle2, ArrowRight, Zap, Play, ChevronRight,
  MessageSquareQuote, ClipboardCheck, Factory
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import useInView from '../hooks/useInView';
import FlowShowcase from '../components/marketing/flow/FlowShowcase';

/* The fourth and last local copy of useInView, deleted. All four had drifted
   — different thresholds, none of them disconnecting after they fired — and
   each one kept an observer attached for the life of the session. */

/* Rewritten to the fabrication track, so this page tells the SAME story as
   the engine on the home page. It previously walked through Create a Project,
   Define BOQ, Raise Indent, Measurement Book, RA Bill — the contracting flow —
   while the home page described a workshop taking an order and making a part.
   A prospect who clicked "See the full walkthrough" landed on a different
   product. Contracting is still in the product and still on the platform
   page; it is no longer the only way this is explained. */
const steps = [
  {
    number: 1,
    icon: <MessageSquareQuote size={28} />,
    title: "An enquiry arrives",
    description: "Someone asks whether you can make a part. That question stops being a WhatsApp message and becomes a record.",
    color: "#FF7A00",
    details: [
      "Capture it before the customer exists as a record",
      "Drawings and specifications attach to the enquiry itself",
      "Enquiries from your public catalogue arrive already attached to a product",
      "Whoever quotes it is not working from memory",
    ],
  },
  {
    number: 2,
    icon: <FileText size={28} />,
    title: "You quote it",
    description: "Priced on your letterhead, with HSN codes and the GST treatment the ship-to address calls for.",
    color: "#3B82F6",
    details: [
      "Your logo, address and bank details come from your company profile",
      "Edit the number, date or validity in place",
      "Print or share a PDF that holds its alignment on paper",
      "A draft can change freely; a sent quotation locks to what may lawfully change",
    ],
  },
  {
    number: 3,
    icon: <ClipboardCheck size={28} />,
    title: "They accept",
    description: "Converting the quotation creates the customer order with its lines intact. No retyping.",
    color: "#22C55E",
    details: [
      "Lines carry across exactly as quoted",
      "The quotation locks, because a signed document should not keep changing",
      "Committed demand you can now buy against",
      "The order references the quotation it came from",
    ],
  },
  {
    number: 4,
    icon: <ShoppingCart size={28} />,
    title: "You buy the material",
    description: "Upload what vendors emailed — Excel, PDF or Word — and the lines are read out of the file rather than retyped.",
    color: "#A78BFA",
    details: [
      "Deterministic parsing; no model guessing at your prices",
      "Compare on a like-for-like total, not the headline",
      "See who did not quote a given line at all",
      "The original file stays openable, so any number can be checked",
    ],
  },
  {
    number: 5,
    icon: <Truck size={28} />,
    title: "Material lands",
    description: "Record the receipt against the purchase order with vehicle and batch. Stock moves on the receipt itself.",
    color: "#0EA5E9",
    details: [
      "Inventory and payables update together",
      "Short and over deliveries recorded as they happened",
      "Stock on the screen is stock on the floor",
      "Every movement traceable to the document that caused it",
    ],
  },
  {
    number: 6,
    icon: <Factory size={28} />,
    title: "You make the part",
    description: "Consume against the bill of materials, record finished output and scrap, and read live yield and true cost per piece.",
    color: "#EC4899",
    details: [
      "The bill of materials drives what is consumed",
      "Finished output and scrap are both recorded",
      "Live yield, material balance and cost per piece",
      "Scrap is where the margin goes, so it is not an optional field",
    ],
  },
  {
    number: 7,
    icon: <Receipt size={28} />,
    title: "You invoice, and get paid",
    description: "CGST and SGST within the state, IGST across it — chosen from the ship-to address, numbered sequentially as the rules require.",
    color: "#EF4444",
    details: [
      "Place of supply decides the tax split, automatically",
      "Sequential numbering per Rule 46(b)",
      "Corrections go through a credit or debit note, which is the lawful route",
      "The receivable ties back to the order it came from",
    ],
  },
];

const StepCard = ({ step, index, isLeft }) => {
  const [ref, inView] = useInView(0.1, { once: true });
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
              borderRadius: 'var(--r-md)',
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
            <p style={{ fontSize: 'var(--t-base)', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.7 }}>
              {step.description}
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
              {step.details.map((d) => (
                <li key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: 'var(--t-sm)', color: 'var(--text-secondary)', flexDirection: 'row-reverse' }}>
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
              borderRadius: 'var(--r-md)',
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
            <p style={{ fontSize: 'var(--t-base)', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.7 }}>
              {step.description}
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {step.details.map((d) => (
                <li key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: 'var(--t-sm)', color: 'var(--text-secondary)' }}>
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
  const [heroRef, heroInView] = useInView(0.01, { once: true });

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
              fontSize: 'var(--t-lg)',
              lineHeight: 1.8,
              opacity: heroInView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.2s',
            }}
          >
            A step-by-step walkthrough of how Maks Ops handles every stage of civil
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

      {/* ── THE WHOLE THING AT A GLANCE ──────────────────────────────────
             The same engine as the home page, deliberately. A visitor who
             clicked through from there should recognise what they are looking
             at, and this page is where they came for the detail — so the
             overview sits above the seven steps rather than being described
             twice in two different shapes. */}
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <span className="pill pill-amber" style={{ marginBottom: 14 }}>
              <Zap size={12} /> The whole flow
            </span>
            <h2 style={{ maxWidth: 620, margin: '14px auto 0' }}>
              Seven stages,{' '}
              <span className="gradient-text-amber">one continuous record</span>
            </h2>
            <p style={{
              maxWidth: 560, margin: '14px auto 0',
              color: 'var(--text-muted)', lineHeight: 1.8,
            }}>
              Each stage produces a numbered document and moves a number. Nothing is
              retyped from the stage before it.
            </p>
          </div>
          {/* The same live walkthrough as the home page, without the margin
              notes — a visitor arriving from there should recognise it, and
              this page is where the seven stages are then explained in detail. */}
          <FlowShowcase notes={false} />
          <Link to="/see-maksops" className="mk-film-link">
            The whole business, chapter by chapter: watch the product film <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* Timeline Steps */}
      <section className="section">
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ maxWidth: 560, margin: '0 auto' }}>
              And the same seven,{' '}
              <span className="gradient-text-amber">in detail</span>
            </h2>
          </div>
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
              borderRadius: 'var(--r-md)',
              padding: '32px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--t-base)',
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
          <p style={{ color: 'var(--text-muted)', marginBottom: '36px', fontSize: 'var(--t-md)', lineHeight: 1.8 }}>
            Open the beta platform and follow these exact steps. All data is pre-seeded so you
            can explore the full cycle without any setup.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary"
              style={{ fontSize: 'var(--t-md)', padding: '16px 32px' }}
            >
              <Play size={16} fill="#fff" />
              Open the Beta Platform
            </button>
            <Link to="/platform" className="btn-ghost" style={{ fontSize: 'var(--t-md)', padding: '16px 32px' }}>
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
