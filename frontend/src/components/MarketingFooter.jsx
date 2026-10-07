import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

/* Every link goes somewhere a visitor can read. These columns used to point
   at the app's own screens (/dashboard, /po, /grn, /boq, /mb, /bills …),
   which for anyone not signed in meant a trip to the sign-in page. The
   module links open that module on the platform page. */
const footerLinks = {
  Product: [
    { label: 'Platform overview', to: '/platform' },
    { label: 'How it works', to: '/how-it-works' },
    { label: 'Features', to: '/#features' },
    { label: 'Product film', to: '/see-maksops' },
  ],
  Modules: [
    { label: 'Catalogue & enquiries', to: '/platform?module=catalogue' },
    { label: 'Quotations', to: '/platform?module=quotations' },
    { label: 'Vendor quotes', to: '/platform?module=vendor-quotes' },
    { label: 'Goods receipt & stock', to: '/platform?module=inventory' },
    { label: 'Production', to: '/platform?module=production' },
    { label: 'GST invoicing', to: '/platform?module=gst' },
    { label: 'Projects & BOQ (optional)', to: '/platform?module=projects' },
  ],
  'Get going': [
    { label: 'Test Maks Ops', to: '/login' },
    { label: 'Get started', to: '/get-started' },
    { label: 'Sign in', to: '/login' },
  ],
};

const MarketingFooter = () => {
  return (
    <footer
      style={{
        background: 'var(--bg-deep)',
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: '80px',
        paddingBottom: '40px',
      }}
    >
      <div className="container">
        {/* Top grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
            gap: '48px',
            marginBottom: '64px',
          }}
        >
          {/* Brand col */}
          <div>
            <Link
              to="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textDecoration: 'none',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 16px hsl(28,100%,54%,0.35)',
                }}
              >
                <Zap size={18} color="#fff" fill="#fff" />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 'var(--t-xl)',
                  letterSpacing: '-0.03em',
                  background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--brand-amber) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Maks Ops
              </span>
            </Link>
            <p
              style={{
                fontSize: 'var(--t-base)',
                color: 'var(--text-muted)',
                lineHeight: 1.7,
                marginBottom: '24px',
                maxWidth: '280px',
              }}
            >
              The operations platform for growing SMEs — sales, procurement,
              production and GST billing in one connected flow.
            </p>
            {/* Version pill */}
            <span className="pill pill-amber"><Zap size={11} /> Beta v1.0</span>
          </div>

          {/* Link cols */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--t-sm)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  marginBottom: '20px',
                }}
              >
                {title}
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      style={{
                        fontSize: 'var(--t-base)',
                        color: 'var(--text-muted)',
                        textDecoration: 'none',
                        transition: 'color 200ms ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onMouseEnter={(e) => (e.target.style.color = 'var(--brand-amber)')}
                      onMouseLeave={(e) => (e.target.style.color = 'var(--text-muted)')}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="divider" style={{ marginBottom: '32px' }} />

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-muted)' }}>
            © 2026 Maks Ops. Built by{' '}
            <span style={{ color: 'var(--brand-amber)' }}>Abhishek Gupta</span>
            {' '}for growing SMEs.
          </p>
          {/* This read "Backend: Port 5000 · Frontend: Port 5173", beside a
              pulsing green dot — localhost port numbers, live on
              maksops.co.in, in the footer of the product being sold. The dot
              was not a status indicator either: it pulsed green regardless of
              whether anything was actually up, which is worse than no
              indicator at all.

              Replaced with something true. A real status light would have to
              be wired to a health check, and on a free tier that sleeps after
              15 minutes it would spend much of its day reporting "down". */}
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-muted)', margin: 0 }}>
            Hyderabad, India
          </p>
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 900px) {
          footer > .container > div:first-child {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 600px) {
          footer > .container > div:first-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
};

export default MarketingFooter;
