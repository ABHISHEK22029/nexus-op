import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import WorkOrders from './pages/WorkOrders';
import Vendors from './pages/Vendors';
import VendorForm from './pages/VendorForm';
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
import Production from './pages/Production';
import ProductionOrder from './pages/ProductionOrder';
import Customers from './pages/Customers';
import CustomerOrders from './pages/CustomerOrders';
import SKUs from './pages/SKUs';
import RawMaterials from './pages/RawMaterials';
import Quotations from './pages/Quotations';
import GrnBillBuilder from './pages/GrnBillBuilder';
import GrnBillDoc from './pages/GrnBillDoc';
import SalesInvoices from './pages/SalesInvoices';
import SalesInvoiceBuilder from './pages/SalesInvoiceBuilder';
import SalesInvoiceDoc from './pages/SalesInvoiceDoc';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ImportData from './pages/Import';
import Welcome from './pages/Welcome';
import PlatformCapabilities from './pages/PlatformCapabilities';
import HowItWorks from './pages/HowItWorks';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import GetStarted from './pages/GetStarted';
import POInvoice from './pages/POInvoice';
import RABillInvoice from './pages/RABillInvoice';
import BetaWelcome from './pages/BetaWelcome';
import BetaOnboarding from './pages/BetaOnboarding';
import { RoleProvider, useRole } from './context/RoleContext';
import { ProjectProvider, useProject } from './context/ProjectContext';
import { useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UiConfigProvider } from './context/UiConfigContext';
import { ToastProvider } from './context/ToastContext';
import { UserCircle, Settings, Sun, Moon, Plus, LogOut } from 'lucide-react';
import QuickCreateModal from './components/QuickCreateModal';
import ProtectedRoute from './components/ProtectedRoute';
import ProductTour from './components/ProductTour';
import NotificationBell from './components/NotificationBell';

/* ─── Top Header (App Layer only) ──────────────────────── */
const TopHeader = () => {
  const { role, setRole } = useRole();
  const { projects, activeProject, setActiveProject } = useProject();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [activeModal, setActiveModal] = React.useState(null);

  // Close dropdown on click outside
  React.useEffect(() => {
    const handleOutsideClick = () => setIsDropdownOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

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
      {/* Quick Create Dropdown Menu */}
      <div 
        style={{ position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
            transition: 'all 150ms ease'
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.05)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          <Plus size={14} strokeWidth={3} />
          <span>Quick Create</span>
        </button>

        {isDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '200px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
              padding: '6px',
              zIndex: 100,
              animation: 'dropdownFade 150ms ease-out'
            }}
          >
            {[
              { label: 'New Project', value: 'project', info: 'Create active workspace' },
              { label: 'Onboard Vendor', value: 'vendor', info: 'Add partner details' },
              { label: 'Raise Indent', value: 'indent', info: 'Site material request' },
              { label: 'Raise PO', value: 'po', info: 'Issue supplier order' }
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  setActiveModal(item.value);
                  setIsDropdownOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  transition: 'background 150ms'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {item.info}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

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

      {/* ── Notifications ── */}
      <NotificationBell />

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

      {/* ── User + Logout ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px', padding: '4px 6px 4px 6px',
        }}
      >
        {/* Avatar (initial) */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
        }}>
          {(user?.role === 'Admin' ? 'A' : (user?.name || user?.email || 'U')).charAt(0)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, marginRight: 2 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.role === 'Admin' ? 'Admin' : (user?.name || user?.email || 'User')}
          </span>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--brand-amber)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {user?.role === 'Admin' ? 'Full Access' : (user?.role || 'Member')}
          </span>
        </div>
        <button
          onClick={() => { logout(); window.location.assign('/login'); }}
          title="Sign out"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-red, #ef4444)'; e.currentTarget.style.borderColor = 'var(--accent-red, #ef4444)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
        >
          <LogOut size={12} strokeWidth={2.5} /> Sign out
        </button>
      </div>

      {/* Render Quick Create Modal Overlay */}
      <QuickCreateModal
        type={activeModal} 
        isOpen={activeModal !== null} 
        onClose={() => setActiveModal(null)} 
        onSuccess={() => {
          // Refresh window to show newly created item on the page
          window.location.reload();
        }}
      />
    </div>
  );
};

/* ─── App Layout (with sidebar) — auth-gated ───────────── */
const AppLayout = ({ children }) => (
  <ProtectedRoute>
    <div className="app-layout">
      <Sidebar />
      <main
        className="app-main"
        style={{ padding: '24px 28px 28px', paddingTop: '72px', position: 'relative' }}
      >
        <TopHeader />
        {children}
      </main>
      <ProductTour />
    </div>
  </ProtectedRoute>
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
      {/* ── Auth ── */}
      <Route path="/login"       element={<Login />} />
      <Route path="/signup"      element={<Signup />} />
      <Route path="/onboarding"  element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/beta-welcome"  element={<ProtectedRoute><BetaWelcome /></ProtectedRoute>} />
      <Route path="/beta-onboarding"  element={<ProtectedRoute><BetaOnboarding /></ProtectedRoute>} />

      {/* ── Marketing Layer ── */}
      <Route path="/"              element={<MarketingLayout><Welcome /></MarketingLayout>} />
      <Route path="/nexus"         element={<Navigate to="/" replace />} />
      <Route path="/get-started"   element={<MarketingLayout><GetStarted /></MarketingLayout>} />
      <Route path="/platform"      element={<MarketingLayout><PlatformCapabilities /></MarketingLayout>} />
      <Route path="/how-it-works"  element={<MarketingLayout><HowItWorks /></MarketingLayout>} />

      {/* ── App Layer ── */}
      <Route path="/dashboard"         element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/projects"          element={<AppLayout><Projects /></AppLayout>} />
      <Route path="/workorders"        element={<AppLayout><WorkOrders /></AppLayout>} />
      <Route path="/vendors"           element={<AppLayout><Vendors /></AppLayout>} />
      <Route path="/vendors/new"       element={<AppLayout><VendorForm /></AppLayout>} />
      <Route path="/vendors/:id/edit"  element={<AppLayout><VendorForm /></AppLayout>} />
      <Route path="/purchase-orders"   element={<AppLayout><PurchaseOrders /></AppLayout>} />
      <Route path="/po"                element={<Navigate to="/purchase-orders" replace />} />
      <Route path="/po/:id"            element={<ProtectedRoute><POInvoice /></ProtectedRoute>} />
      <Route path="/inventory"         element={<AppLayout><Inventory /></AppLayout>} />
      <Route path="/grn"               element={<AppLayout><GRN /></AppLayout>} />
      <Route path="/grn/:grnId/bill"   element={<AppLayout><GrnBillBuilder /></AppLayout>} />
      <Route path="/grn-bills/:id"     element={<AppLayout><GrnBillDoc /></AppLayout>} />
      <Route path="/production"        element={<AppLayout><Production /></AppLayout>} />
      <Route path="/production/:id"    element={<AppLayout><ProductionOrder /></AppLayout>} />

      {/* ── Customer-order → procurement flow ── */}
      <Route path="/customers"       element={<AppLayout><Customers /></AppLayout>} />
      <Route path="/customer-orders" element={<AppLayout><CustomerOrders /></AppLayout>} />
      <Route path="/customer-orders/:coId/invoice" element={<AppLayout><SalesInvoiceBuilder /></AppLayout>} />
      <Route path="/sales-invoices"  element={<AppLayout><SalesInvoices /></AppLayout>} />
      <Route path="/sales-invoices/:id" element={<AppLayout><SalesInvoiceDoc /></AppLayout>} />
      <Route path="/skus"            element={<AppLayout><SKUs /></AppLayout>} />
      <Route path="/raw-materials"   element={<AppLayout><RawMaterials /></AppLayout>} />
      <Route path="/quotations"      element={<AppLayout><Quotations /></AppLayout>} />
      <Route path="/bills"             element={<AppLayout><Bills /></AppLayout>} />
      <Route path="/expenses"          element={<AppLayout><Expenses /></AppLayout>} />
      <Route path="/reports"           element={<AppLayout><Reports /></AppLayout>} />
      <Route path="/users"             element={<AppLayout><Users /></AppLayout>} />
      <Route path="/import"            element={<AppLayout><ImportData /></AppLayout>} />
      <Route path="/bills/:id"         element={<ProtectedRoute><RABillInvoice /></ProtectedRoute>} />
      <Route path="/activity"          element={<AppLayout><ActivityLog /></AppLayout>} />
      <Route path="/flow"              element={<AppLayout><ProcessFlow /></AppLayout>} />
      <Route path="/boq"               element={<AppLayout><BOQ /></AppLayout>} />
      <Route path="/indent"            element={<AppLayout><Indent /></AppLayout>} />
      <Route path="/mb"                element={<AppLayout><MeasurementBook /></AppLayout>} />
      <Route path="/milestones"        element={<AppLayout><Milestones /></AppLayout>} />
      <Route path="*"                  element={<NotFound />} />
    </Routes>
  );
};

/* ─── 404 ───────────────────────────────────────────────── */
const NotFound = () => {
  const loc = useLocation();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg-deep, #0a0f1a)', color: 'var(--text-primary, #e6eaf2)', padding: 24, textAlign: 'center' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 72, fontWeight: 800, color: 'var(--brand-amber, #f97316)', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Page not found</div>
      <div style={{ opacity: .6, fontSize: 14 }}>No route matches <code>{loc.pathname}</code></div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <a href="/dashboard" style={{ background: 'var(--brand-amber, #f97316)', color: '#0a0f1a', padding: '10px 22px', borderRadius: 8, fontWeight: 700, textDecoration: 'none' }}>Go to Dashboard</a>
        <a href="/" style={{ border: '1px solid var(--border-default, #2a3346)', color: 'inherit', padding: '10px 22px', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Home</a>
      </div>
    </div>
  );
};

/* ─── Root App ──────────────────────────────────────────── */
function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <UiConfigProvider>
          <ProjectProvider>
            <RoleProvider>
              <Router>
                <AppRoutes />
              </Router>
            </RoleProvider>
          </ProjectProvider>
        </UiConfigProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
