import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

const footerLinks = {
  Platform: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Projects', to: '/projects' },
    { label: 'Work Orders', to: '/workorders' },
    { label: 'Vendors', to: '/vendors' },
    { label: 'BOQ', to: '/boq' },
  ],
  Operations: [
    { label: 'Purchase Orders', to: '/po' },
    { label: 'GRN', to: '/grn' },
    { label: 'Inventory', to: '/inventory' },
    { label: 'Measurement Book', to: '/mb' },
    { label: 'RA Bills', to: '/bills' },
  ],
  Resources: [
    { label: 'Platform Overview', to: '/platform' },
    { label: 'How It Works', to: '/how-it-works' },
    { label: 'Process Flow', to: '/flow' },
    { label: 'Activity Log', to: '/activity' },
    { label: 'Milestones', to: '/milestones' },
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
                  fontSize: '1.2rem',
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
                fontSize: '0.875rem',
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
            <span className="pill pill-amber">⚡ Beta v1.0</span>
          </div>

          {/* Link cols */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.8rem',
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
                        fontSize: '0.875rem',
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
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            © 2026 Maks Ops. Built by{' '}
            <span style={{ color: 'var(--brand-amber)' }}>Abhishek Gupta</span>
            {' '}for growing SMEs.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--accent-emerald)',
                  display: 'inline-block',
                  animation: 'pulse-amber 2s infinite',
                }}
              />
              Backend: Port 5000 · Frontend: Port 5173
            </span>
          </div>
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
