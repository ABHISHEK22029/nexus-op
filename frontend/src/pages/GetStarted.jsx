import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  Rocket, Database, ArrowRight, Sparkles, Building2,
  FolderGit2, Users, ShoppingCart, FileText, Truck,
  CheckCircle, Zap, Play, Star, Shield, ChevronRight, Loader2
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';

/* ── Sample data that gets loaded in "Explore" mode ── */
const SAMPLE_ORG = {
  name: 'Kirashi Business Synergies Pvt. Ltd.',
  tradeName: 'Kirashi',
  gstin: '36ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  state: 'Telangana',
  industry: 'Construction / EPC',
};

const SAMPLE_PROJECTS = [
  {
    id: 1,
    name: 'Workshop — Bowrampeta Phase 1',
    code: 'NX-2026-001',
    client: 'HMDA',
    value: 25000000,
    status: 'active',
    progress: 42,
  },
  {
    id: 2,
    name: 'ORR Package NW-04',
    code: 'NX-2026-002',
    client: 'NHAI',
    value: 180000000,
    status: 'active',
    progress: 18,
  },
];

const GetStarted = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  const handleStartFresh = () => {
    setLoadingType('fresh');
    setLoading(true);
    // Small delay for the animation, then navigate to onboarding
    setTimeout(() => {
      navigate('/onboarding');
    }, 600);
  };

  const handleExploreDemo = () => {
    setLoadingType('demo');
    setLoading(true);
    // Store sample data in localStorage so the app can pick it up
    localStorage.setItem('nexus_demo_mode', 'true');
    localStorage.setItem('nexus_org', JSON.stringify(SAMPLE_ORG));
    localStorage.setItem('nexus_onboarded', 'true');
    setTimeout(() => {
      navigate('/dashboard');
    }, 800);
  };

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <MarketingNav />

      {/* ── Main Container ── */}
      <div
        style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: '40px 24px',
        }}
      >
        {/* Background mesh */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
            opacity: 0.25,
            pointerEvents: 'none',
          }}
        />
        {/* Warm glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '700px',
            height: '700px',
            background: 'radial-gradient(ellipse, hsl(28,100%,54%,0.08) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '900px', width: '100%' }}>
          {/* Logo */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 16px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'hsl(0,0%,100%,0.7)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              marginBottom: '28px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                background: 'var(--brand-amber)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '15px',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                boxShadow: 'var(--shadow-amber)',
              }}
            >
              N
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
                Nexus-OP
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Infrastructure Intelligence
              </div>
            </div>
          </div>

          {/* Heading */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
              marginBottom: '14px',
              lineHeight: 1.15,
            }}
          >
            How would you like to{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, hsl(40,100%,60%) 0%, var(--brand-amber) 60%, hsl(20,90%,45%) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              get started?
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.05rem',
              color: 'var(--text-secondary)',
              maxWidth: '520px',
              margin: '0 auto 48px',
              lineHeight: 1.7,
            }}
          >
            Set up your own organization from scratch, or explore with pre-loaded sample data to see how Nexus-OP works.
          </p>

          {/* ── Two Cards ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              maxWidth: '760px',
              margin: '0 auto',
            }}
          >
            {/* Card 1: Start Fresh */}
            <div
              onClick={!loading ? handleStartFresh : undefined}
              onMouseEnter={() => setHoveredCard('fresh')}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: 'var(--bg-surface)',
                border: `2px solid ${hoveredCard === 'fresh' ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                borderRadius: '20px',
                padding: '36px 28px',
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 300ms ease',
                transform: hoveredCard === 'fresh' ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: hoveredCard === 'fresh'
                  ? '0 12px 40px hsl(22,92%,50%,0.15)'
                  : 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
                opacity: loading && loadingType !== 'fresh' ? 0.5 : 1,
              }}
            >
              {/* Subtle corner glow */}
              <div
                style={{
                  position: 'absolute',
                  top: '-30px',
                  right: '-30px',
                  width: '120px',
                  height: '120px',
                  background: 'radial-gradient(circle, hsl(28,100%,54%,0.08), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Icon */}
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: 'hsl(28,100%,54%,0.12)',
                  border: '1px solid hsl(28,100%,54%,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-amber)',
                  marginBottom: '20px',
                }}
              >
                {loading && loadingType === 'fresh' ? (
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Rocket size={24} />
                )}
              </div>

              {/* Title & desc */}
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                }}
              >
                Start Fresh
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px' }}>
                Set up your organization, GSTIN, team roles, and create your first project from scratch.
              </p>

              {/* Steps preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {[
                  { icon: <Building2 size={14} />, label: 'Organization & GSTIN setup' },
                  { icon: <Users size={14} />, label: 'Choose your role' },
                  { icon: <FolderGit2 size={14} />, label: 'Create first project' },
                ].map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: 'var(--brand-amber)' }}>{step.icon}</span>
                    {step.label}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--brand-amber)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {loading && loadingType === 'fresh' ? 'Setting up...' : 'Begin Setup'}
                <ArrowRight size={16} />
              </div>

              {/* Time estimate pill */}
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  padding: '3px 10px',
                  background: 'hsl(28,100%,54%,0.1)',
                  border: '1px solid hsl(28,100%,54%,0.25)',
                  borderRadius: '99px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--brand-amber)',
                  letterSpacing: '0.03em',
                }}
              >
                ~3 min
              </div>
            </div>

            {/* Card 2: Explore with Sample Data */}
            <div
              onClick={!loading ? handleExploreDemo : undefined}
              onMouseEnter={() => setHoveredCard('demo')}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: 'var(--bg-surface)',
                border: `2px solid ${hoveredCard === 'demo' ? 'var(--accent-emerald)' : 'var(--border-default)'}`,
                borderRadius: '20px',
                padding: '36px 28px',
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 300ms ease',
                transform: hoveredCard === 'demo' ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: hoveredCard === 'demo'
                  ? '0 12px 40px hsl(158,68%,38%,0.12)'
                  : 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
                opacity: loading && loadingType !== 'demo' ? 0.5 : 1,
              }}
            >
              {/* Corner glow */}
              <div
                style={{
                  position: 'absolute',
                  top: '-30px',
                  right: '-30px',
                  width: '120px',
                  height: '120px',
                  background: 'radial-gradient(circle, hsl(158,68%,38%,0.08), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Icon */}
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: 'hsl(158,68%,38%,0.12)',
                  border: '1px solid hsl(158,68%,38%,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-emerald)',
                  marginBottom: '20px',
                }}
              >
                {loading && loadingType === 'demo' ? (
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Database size={24} />
                )}
              </div>

              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                }}
              >
                Explore with Sample Data
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px' }}>
                Jump right in with pre-loaded Kirashi demo data — projects, vendors, POs, and bills.
              </p>

              {/* What's included */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {[
                  { icon: <FolderGit2 size={14} />, label: '2 sample projects loaded' },
                  { icon: <ShoppingCart size={14} />, label: '6 purchase orders with GST' },
                  { icon: <FileText size={14} />, label: 'BOQ, MB & RA Bill examples' },
                ].map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-emerald)' }}>{step.icon}</span>
                    {step.label}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--accent-emerald)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {loading && loadingType === 'demo' ? 'Loading data...' : 'Explore Now'}
                <Play size={14} fill="currentColor" />
              </div>

              {/* Instant pill */}
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  padding: '3px 10px',
                  background: 'hsl(158,68%,38%,0.1)',
                  border: '1px solid hsl(158,68%,38%,0.25)',
                  borderRadius: '99px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--accent-emerald)',
                  letterSpacing: '0.03em',
                }}
              >
                Instant
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              justifyContent: 'center',
              marginTop: '40px',
              flexWrap: 'wrap',
            }}
          >
            {[
              { icon: <Shield size={14} />, text: 'PostgreSQL Powered' },
              { icon: <Zap size={14} />, text: '15 Core Modules' },
              { icon: <Star size={14} />, text: 'Indian GST Compliant' },
              { icon: <CheckCircle size={14} />, text: 'HMDA ORR Ready' },
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

          {/* Footer note */}
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-disabled)',
              marginTop: '24px',
            }}
          >
            You can switch between modes anytime from Settings.
            Demo data can be cleared with one click.
          </p>
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default GetStarted;
