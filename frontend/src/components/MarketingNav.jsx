import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronRight, Zap, Sun, Moon, LayoutDashboard } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const MarketingNav = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Platform', to: '/platform' },
    { label: 'How It Works', to: '/how-it-works' },
    { label: 'Features', to: '/#features' },
  ];

  /* Nav background adapts to theme */
  const navBg = isDark
    ? (isScrolled ? 'hsl(222, 38%, 9%, 0.97)' : 'hsl(222, 38%, 9%, 0.85)')
    : (isScrolled ? 'hsl(0, 0%, 100%, 0.97)' : 'hsl(0, 0%, 100%, 0.92)');

  const boxShadow = isScrolled
    ? `0 1px 0 var(--border-subtle), 0 4px 24px hsl(30,20%,50%,${isDark ? '0.3' : '0.12'})`
    : 'none';

  return (
    <nav
      className="mkt-nav"
      style={{ background: navBg, boxShadow, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${isDark ? 'var(--border-subtle)' : 'hsl(32,20%,88%)'}` }}
    >
      <div
        className="container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px' }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px hsl(28,100%,54%,0.4)',
          }}>
            <Zap size={18} color="#fff" fill="#fff" />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem',
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--brand-amber) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Maks Ops
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              style={({ isActive }) => ({
                padding: '8px 16px', borderRadius: '8px',
                fontSize: '0.9rem', fontWeight: 500,
                color: isActive ? 'var(--brand-amber)' : 'var(--text-secondary)',
                textDecoration: 'none', transition: 'all 200ms ease',
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--brand-amber)';
                e.currentTarget.style.background = isDark ? 'var(--bg-elevated)' : 'hsl(36,28%,94%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* CTA Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              width: '54px', height: '28px', borderRadius: '99px',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'hsl(30,18%,78%)'}`,
              background: isDark ? 'hsl(222, 38%, 14%)' : 'hsl(36, 55%, 91%)',
              cursor: 'pointer', position: 'relative',
              transition: 'all 300ms ease', flexShrink: 0,
              display: 'flex', alignItems: 'center', padding: '3px',
            }}
          >
            <div style={{
              position: 'absolute', width: '22px', height: '22px', borderRadius: '50%',
              background: isDark
                ? 'linear-gradient(135deg, #3B4A6B, #4B5A80)'
                : 'linear-gradient(135deg, hsl(22,92%,52%), hsl(38,95%,58%))',
              left: isDark ? '3px' : 'calc(100% - 25px)',
              transition: 'all 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px hsl(22,92%,50%,0.45)',
            }}>
              {isDark ? <Moon size={11} color="rgba(180,200,255,0.9)" /> : <Sun size={11} color="#fff" />}
            </div>
          </button>

          {token ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LayoutDashboard size={14} />
              {user?.name ? `Dashboard · ${user.role === 'Admin' ? 'Admin' : user.name.split(' ')[0]}` : 'Go to Dashboard'}
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="btn-ghost btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Test Beta
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            style={{
              display: 'none', background: 'none', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px',
            }}
            className="mobile-menu-btn"
          >
            {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileOpen && (
        <div style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px 24px 24px',
        }} className="animate-fade">
          {navLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              onClick={() => setIsMobileOpen(false)}
              style={({ isActive }) => ({
                display: 'block', padding: '12px 16px', borderRadius: '8px',
                fontSize: '0.95rem', fontWeight: 500,
                color: isActive ? 'var(--brand-amber)' : 'var(--text-secondary)',
                textDecoration: 'none', marginBottom: '4px',
              })}
            >
              {link.label}
            </NavLink>
          ))}
          <button
            onClick={() => { navigate(token ? '/dashboard' : '/login'); setIsMobileOpen(false); }}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
          >
            {token ? 'Go to Dashboard' : 'Sign In'} <ChevronRight size={16} />
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </nav>
  );
};

export default MarketingNav;
