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
import useInView from '../hooks/useInView';
import {
  ParseLines, CompareBars, YieldRing, TaxSplit, DocMorph,
  StockLevel, SearchGrid, localKeyframes,
} from '../components/marketing/FeatureDiagrams';

/* The third copy of useInView has been deleted in favour of the shared hook.
   None of them disconnected after firing, and they had already drifted apart
   in threshold and options.

   Every reveal here is one-time, so these call sites pass once:true; the
   module diagrams take the third value (live visibility) so they stop when
   scrolled away from. */

/* Rewritten. The previous version described a different product to a
   different buyer: seven construction modules (BOQ, Indent, Measurement Book,
   RA Bills), written in implementation language — "ReactFlow + Dagre-powered
   automatic graph layout", "PO status distribution via Recharts" — and naming
   a specific real infrastructure project in what was meant to be generic
   copy. A fabricator evaluating this was reading about somebody else's
   highway job, in the vocabulary of the people who built the software.

   Now: what the product does, in the order a job actually moves through a
   workshop, with the contracting modules kept as the last two rather than
   the whole story. Each one carries a live diagram of its mechanism instead
   of the 420px empty placeholder that used to sit beside it. */
const modules = [
  {
    id: "quotations",
    icon: <FileText size={20} />,
    label: "Quotations",
    title: "From enquiry to a numbered quotation",
    color: "#FF7A00",
    diagram: (p) => <DocMorph {...p} from="ENQ" to="QT" />,
    description:
      "Capture what a customer asked for before they exist as a record, then price it on your letterhead with HSN codes and the right GST treatment. Edit the number, date or validity in place.",
    bullets: [
      "Drawings and specifications attach to the enquiry",
      "Your logo, address and bank details on every document",
      "Edit a draft freely; a sent quotation locks down to what may lawfully change",
      "One click turns an accepted quotation into a customer order",
    ],
  },
  {
    id: "vendor-quotes",
    icon: <ShoppingCart size={20} />,
    label: "Vendor quotes",
    title: "Compare what vendors actually sent",
    color: "#22C55E",
    diagram: ParseLines,
    description:
      "Vendors quote in Excel, PDF and Word. Upload the file they emailed and the line items are read out of it — description, HSN, quantity, rate — instead of being retyped into a spreadsheet, which is where the comparison usually goes wrong.",
    bullets: [
      "Excel, PDF and Word read deterministically — no model guessing at your prices",
      "The original file stays attached and openable, so any number can be checked",
      "Every parse reports how much of the file it understood",
      "Raise the purchase order on the winning quote",
    ],
  },
  {
    id: "comparison",
    icon: <BarChart3 size={20} />,
    label: "Comparison",
    title: "Like-for-like, not headline totals",
    color: "#3B82F6",
    diagram: CompareBars,
    description:
      "Line several quotations up side by side, see the best price on every row, and see who did not quote a row at all. The total compared is the comparable one.",
    bullets: [
      "Best price marked per line, not just per quotation",
      "Missing lines named explicitly",
      "A comparable total, plus a caveat when coverage differs",
      "Comparing eight lines against five is how you buy the dearer option",
    ],
  },
  {
    id: "inventory",
    icon: <Truck size={20} />,
    label: "Goods receipt",
    title: "Stock that matches the floor",
    color: "#A78BFA",
    diagram: StockLevel,
    description:
      "Record receipt against the purchase order with vehicle and batch. Inventory moves on the receipt itself, not on somebody remembering to adjust it afterwards.",
    bullets: [
      "Receipt against the PO, with vehicle and batch",
      "Inventory and payables update together",
      "Short and over deliveries recorded as they happened",
      "Every movement traceable to the document that caused it",
    ],
  },
  {
    id: "production",
    icon: <Package size={20} />,
    label: "Production",
    title: "Yield, including the scrap",
    color: "#EC4899",
    diagram: YieldRing,
    description:
      "Consume against the bill of materials, record finished output and scrap, and read live yield, material balance and true cost per piece.",
    bullets: [
      "Bill of materials drives what is consumed",
      "Finished output and scrap both recorded",
      "Live yield percentage and material balance",
      "Scrap is the line most systems drop, and it is where the margin goes",
    ],
  },
  {
    id: "gst",
    icon: <Receipt size={20} />,
    label: "GST invoicing",
    title: "Tax that follows place of supply",
    color: "#EF4444",
    diagram: TaxSplit,
    description:
      "CGST and SGST within the state, IGST across it — chosen from the ship-to address rather than typed and hoped for. Invoice numbers run sequentially per supplier, as Rule 46(b) requires.",
    bullets: [
      "Place of supply decides the split, automatically",
      "Sequential numbering per Rule 46(b)",
      "Credit and debit notes as the lawful correction to an issued invoice",
      "Print-ready documents that hold their alignment on paper",
    ],
  },
  {
    id: "catalogue",
    icon: <Workflow size={20} />,
    label: "Catalogue",
    title: "A shopfront with no login",
    color: "#6366F1",
    diagram: SearchGrid,
    description:
      "Publish your products with photographs, specifications and categories, and share one link. Enquiries arrive against a specific product rather than as a general question.",
    bullets: [
      "Photographs, specifications, HSN and categories",
      "One shareable link; nobody browsing needs an account",
      "Enquiries land attached to the product they came from",
      "The shortest route from a stranger to a quotation",
    ],
  },
  {
    id: "projects",
    icon: <FolderGit2 size={20} />,
    label: "Projects & BOQ",
    title: "For work billed against measurement",
    color: "#0EA5E9",
    diagram: (p) => <DocMorph {...p} from="BOQ" to="RA" tone="#0EA5E9" />,
    description:
      "If you run jobs against a bill of quantities, measurements recorded on site drive the running-account bill — quantity times agreed rate, with GST, TDS and retention applied as deductions.",
    bullets: [
      "Itemised BOQ with units and agreed rates",
      "Site measurements recorded against BOQ lines",
      "Bills computed from cumulative certified quantity",
      "Deductions shown, so the arithmetic can be checked",
    ],
  },
];

/* The panel beside each module's description. It shows the module's own
   diagram, scaled up, on a surface that reads as a device rather than a card
   — a thin top rail and a tinted glow in the module's colour, so switching
   modules changes the light in the panel as well as its contents.

   The diagram animates only while the panel is on screen (the third value
   from useInView), so eight of them are not looping in the background. */
const ModulePanel = ({ module }) => {
  const [ref, , visible] = useInView(0.15);
  const Diagram = module.diagram;
  return (
    <div
      ref={ref}
      key={module.id}
      className="mk-scale-in"
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${module.color}33`,
        minHeight: 318,
        padding: '24px 22px 20px',
        display: 'flex', flexDirection: 'column', gap: 18,
        boxShadow: `0 24px 60px -36px ${module.color}66, 0 1px 0 rgba(255,255,255,.04) inset`,
        overflow: 'hidden',
      }}
    >
      {/* a wash of the module's colour, so the panel changes temperature
          when you switch modules */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 70% at 50% -10%, ${module.color}1f, transparent 62%)`,
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
        background: `linear-gradient(90deg, transparent, ${module.color}, transparent)`,
        opacity: .75,
      }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
          color: module.color, background: `${module.color}18`,
          border: `1px solid ${module.color}3a`,
        }}>{module.icon}</span>
        <span style={{
          fontSize: 'var(--t-xs)', fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>{module.label}</span>
      </div>

      {/* The diagram, enlarged. transform rather than re-authoring each one
          at a second size: they are vector and composited, so it costs
          nothing and there is one definition of each drawing. */}
      <div style={{ position: 'relative', flex: 1, display: 'grid', placeItems: 'center' }}>
        {/* Scaled up rather than re-drawn at a second size: the diagrams are
             vector and composited, so this costs nothing and there stays one
             definition of each drawing. */}
        <div style={{ width: '100%', maxWidth: 300, transform: 'scale(1.5)', transformOrigin: 'center' }}>
          <Diagram on={visible} />
        </div>
      </div>

      <p style={{
        position: 'relative', margin: 0, textAlign: 'center',
        fontSize: 'var(--t-xs)', color: 'var(--text-muted)',
      }}>
        An illustration of the mechanism, not a screenshot.
      </p>
    </div>
  );
};

const PlatformCapabilities = () => {
  const [activeTab, setActiveTab] = useState('projects');
  const navigate = useNavigate();
  const [headerRef, headerInView] = useInView(0.1, { once: true });

  const activeModule = modules.find(m => m.id === activeTab);

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{localKeyframes}</style>
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
              fontSize: 'var(--t-lg)',
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
                borderRadius: 'var(--r-sm)',
                border: activeTab === mod.id ? `1px solid ${mod.color}44` : '1px solid transparent',
                background: activeTab === mod.id ? `${mod.color}12` : 'transparent',
                color: activeTab === mod.id ? mod.color : 'var(--text-muted)',
                fontSize: 'var(--t-base)',
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
                    borderRadius: 'var(--r-md)',
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
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '32px', fontSize: 'var(--t-md)' }}>
                  {activeModule.description}
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
                  {activeModule.bullets.map((b) => (
                    <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: 'var(--t-base)', color: 'var(--text-secondary)' }}>
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

              {/* Was a 420px placeholder holding the module's icon a second
                  time and the line "<label> module live in the beta platform".
                  A panel that promises the feature exists, where the feature
                  itself should be. Each module now draws its own mechanism. */}
              <ModulePanel module={activeModule} />
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="container-narrow">
          <h2 style={{ marginBottom: '16px' }}>
            See it all in the{' '}
            <span className="gradient-text-amber">Live Beta</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: 'var(--t-md)' }}>
            All 7 capability areas are live and fully functional in the beta platform.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ fontSize: 'var(--t-md)', padding: '16px 32px' }}>
            <Play size={16} fill="#fff" /> Open the Beta Platform
          </button>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
};

export default PlatformCapabilities;
