import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import '../beta.css';

export default function BetaWelcome() {
  const navigate = useNavigate();
  const { setTheme } = useTheme();

  // Force light for the Cornerstone UI THROUGH the theme context, so state,
  // the data-theme attribute and localStorage never drift apart (which was
  // leaving the toggle on "light" while the app rendered dark). Restore the
  // user's real preference on exit.
  useEffect(() => {
    const prev = localStorage.getItem('nexus-theme') || 'light';
    setTheme('light');
    return () => setTheme(prev);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      
      <div className="welcome-mock" style={{ width: '100%' }}>
        <div className="welcome-bg">
          <div className="welcome-center">
            
            <div className="wc-logo">
              <div className="wc-logo-icon">N</div>
              <div style={{ textAlign: 'left' }}>
                <div className="wc-logo-text">Maks Ops</div>
                <div className="wc-logo-sub">Operational Intelligence</div>
              </div>
            </div>
            
            <h1 className="wc-heading">Welcome to <span>Maks Ops</span></h1>
            <p className="wc-sub">
              The operational intelligence platform for infrastructure project execution. Procurement, billing, site progress, and material tracking — all in one place.
            </p>
            
            <div className="wc-btns">
              <button className="btn-primary" onClick={() => navigate('/beta-onboarding')}>
                Get Started — takes ~3 minutes &rarr;
              </button>
              <button className="btn-ghost" onClick={() => navigate('/dashboard')}>
                Skip setup for now
              </button>
            </div>
            
            <div className="wc-trust">
              <span className="trust-item"><span className="trust-dot"></span> Secure &middot; JWT + RLS</span>
              <span className="trust-item"><span className="trust-dot"></span> Indian GST compliant</span>
              <span className="trust-item"><span className="trust-dot"></span> Works offline after first load</span>
            </div>

          </div>
        </div>
        
        {/* Step Indicator at the bottom */}
        <div className="step-bar">
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num active">1</div>
              <div className="step-label active-lbl">Welcome</div>
            </div>
            <div className="step-line"></div>
          </div>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num future">2</div>
              <div className="step-label">Org Setup</div>
            </div>
            <div className="step-line"></div>
          </div>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num future">3</div>
              <div className="step-label">Your Role</div>
            </div>
            <div className="step-line"></div>
          </div>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num future">4</div>
              <div className="step-label">First Project</div>
            </div>
            <div className="step-line"></div>
          </div>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num future">5</div>
              <div className="step-label">Tour</div>
            </div>
            <div className="step-line"></div>
          </div>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className="step-num future">6</div>
              <div className="step-label">Done</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
