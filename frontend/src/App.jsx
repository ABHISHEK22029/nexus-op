import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import WorkOrders from './pages/WorkOrders';
import Vendors from './pages/Vendors';
import PurchaseOrders from './pages/PurchaseOrders';
import Inventory from './pages/Inventory';
import ActivityLog from './pages/ActivityLog';
import Bills from './pages/Bills';
import ProcessFlow from './pages/ProcessFlow';
import BOQ from './pages/BOQ';
import Indent from './pages/Indent';
import MeasurementBook from './pages/MeasurementBook';
import Milestones from './pages/Milestones';
import GRN from './pages/GRN';
import Welcome from './pages/Welcome';
import PlatformCapabilities from './pages/PlatformCapabilities';
import HowItWorks from './pages/HowItWorks';
import { RoleProvider, useRole } from './context/RoleContext';
import { ProjectProvider, useProject } from './context/ProjectContext';
import { useTheme } from './context/ThemeContext';
import { UserCircle, Settings, Sun, Moon } from 'lucide-react';

/* ─── Top Header (App Layer only) ──────────────────────── */
const TopHeader = () => {
  const { role, setRole } = useRole();
  const { projects, activeProject, setActiveProject } = useProject();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        left: 0,
        padding: '12px 20px',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '10px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Project context selector */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px', padding: '6px 14px',
        }}
      >
        <Settings size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Context:</span>
        <select
          value={activeProject ? activeProject.id : ''}
          onChange={(e) => setActiveProject(projects.find((p) => p.id === parseInt(e.target.value)))}
          style={{
            background: 'transparent', border: 'none',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)',
            outline: 'none', cursor: 'pointer', maxWidth: '200px', padding: 0,
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Role selector */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px', padding: '6px 14px',
        }}
      >
        <UserCircle size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>View as:</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            background: 'transparent', border: 'none',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-amber)',
            outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="Admin">Admin 👑</option>
          <option value="Engineer">Engineer 👷</option>
          <option value="Finance">Finance 💼</option>
          <option value="Vendor">Vendor 🏢</option>
        </select>
      </div>

      {/* ── Theme Toggle ── */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light (Warm) Mode' : 'Switch to Dark Mode'}
        style={{
          width: '62px', height: '32px',
          borderRadius: '99px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'hsl(30,18%,78%)'}`,
          background: isDark ? 'hsl(222, 38%, 14%)' : 'hsl(36, 60%, 91%)',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'all 300ms ease',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
        }}
      >
        {/* Labels */}
        <span style={{
          position: 'absolute',
          fontSize: '0.55rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          color: isDark ? 'rgba(255,255,255,0.35)' : 'hsl(22,92%,50%)',
          left: isDark ? 'auto' : '6px',
          right: isDark ? '6px' : 'auto',
          userSelect: 'none',
          zIndex: 0,
          textTransform: 'uppercase',
        }}>
          {isDark ? 'DARK' : 'LIGHT'}
        </span>
        {/* Knob */}
        <div style={{
          position: 'absolute',
          width: '24px', height: '24px',
          borderRadius: '50%',
          background: isDark
            ? 'linear-gradient(135deg, #3B4A6B, #4B5A80)'
            : 'linear-gradient(135deg, hsl(22,92%,52%), hsl(38,95%,58%))',
          left: isDark ? '4px' : 'calc(100% - 28px)',
          transition: 'all 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px hsl(22,92%,50%,0.45)',
          zIndex: 1,
        }}>
          {isDark
            ? <Moon size={12} color="rgba(180,200,255,0.9)" />
            : <Sun size={12} color="#fff" />}
        </div>
      </button>
    </div>
  );
};

/* ─── App Layout (with sidebar) ────────────────────────── */
const AppLayout = ({ children }) => (
  <div className="app-layout">
    <Sidebar />
    <main
      className="app-main"
      style={{ padding: '24px 28px 28px', paddingTop: '72px', position: 'relative' }}
    >
      <TopHeader />
      {children}
    </main>
  </div>
);

/* ─── Marketing Layout (full screen, no sidebar) ────────── */
const MarketingLayout = ({ children }) => (
  <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
    {children}
  </div>
);

/* ─── Route Controller ──────────────────────────────────── */
const AppRoutes = () => {
  return (
    <Routes>
      {/* ── Marketing Layer ── */}
      <Route path="/"              element={<MarketingLayout><Welcome /></MarketingLayout>} />
      <Route path="/platform"      element={<MarketingLayout><PlatformCapabilities /></MarketingLayout>} />
      <Route path="/how-it-works"  element={<MarketingLayout><HowItWorks /></MarketingLayout>} />

      {/* ── App Layer ── */}
      <Route path="/dashboard"  element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/projects"   element={<AppLayout><Projects /></AppLayout>} />
      <Route path="/workorders" element={<AppLayout><WorkOrders /></AppLayout>} />
      <Route path="/vendors"    element={<AppLayout><Vendors /></AppLayout>} />
      <Route path="/po"         element={<AppLayout><PurchaseOrders /></AppLayout>} />
      <Route path="/inventory"  element={<AppLayout><Inventory /></AppLayout>} />
      <Route path="/grn"        element={<AppLayout><GRN /></AppLayout>} />
      <Route path="/bills"      element={<AppLayout><Bills /></AppLayout>} />
      <Route path="/activity"   element={<AppLayout><ActivityLog /></AppLayout>} />
      <Route path="/flow"       element={<AppLayout><ProcessFlow /></AppLayout>} />
      <Route path="/boq"        element={<AppLayout><BOQ /></AppLayout>} />
      <Route path="/indent"     element={<AppLayout><Indent /></AppLayout>} />
      <Route path="/mb"         element={<AppLayout><MeasurementBook /></AppLayout>} />
      <Route path="/milestones" element={<AppLayout><Milestones /></AppLayout>} />
    </Routes>
  );
};

/* ─── Root App ──────────────────────────────────────────── */
function App() {
  return (
    <ProjectProvider>
      <RoleProvider>
        <Router>
          <AppRoutes />
        </Router>
      </RoleProvider>
    </ProjectProvider>
  );
}

export default App;
