import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppNav from './components/AppNav';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const Vendors = lazy(() => import('./pages/Vendors'));
/* The 47-field VendorForm is no longer routed — /vendors/:id/edit uses
   VendorFormMinimal, so adding and editing a vendor are the same form. */
/* The 47-field, 5-tab vendor form is kept for editing an existing vendor,
   where the extra fields are occasionally wanted. Creating one now uses the
   short form — 22 of 36 columns had never been filled once on real data. */
const VendorFormMinimal = lazy(() => import('./pages/VendorFormMinimal'));
const PublicCatalogue = lazy(() => import('./pages/PublicCatalogue'));
const Enquiries = lazy(() => import('./pages/Enquiries'));
const CataloguePage = lazy(() => import('./pages/CataloguePage'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const Inventory = lazy(() => import('./pages/Inventory'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Bills = lazy(() => import('./pages/Bills'));
const ProcessFlow = lazy(() => import('./pages/ProcessFlow'));
const BOQ = lazy(() => import('./pages/BOQ'));
const Indent = lazy(() => import('./pages/Indent'));
const MeasurementBook = lazy(() => import('./pages/MeasurementBook'));
const Milestones = lazy(() => import('./pages/Milestones'));
const GRN = lazy(() => import('./pages/GRN'));
const Production = lazy(() => import('./pages/Production'));
const ProductionOrder = lazy(() => import('./pages/ProductionOrder'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerOrders = lazy(() => import('./pages/CustomerOrders'));
const SKUs = lazy(() => import('./pages/SKUs'));
const RawMaterials = lazy(() => import('./pages/RawMaterials'));
const Quotations = lazy(() => import('./pages/Quotations'));
const GrnBillBuilder = lazy(() => import('./pages/GrnBillBuilder'));
const GrnBillDoc = lazy(() => import('./pages/GrnBillDoc'));
const SalesInvoices = lazy(() => import('./pages/SalesInvoices'));
const SalesInvoiceBuilder = lazy(() => import('./pages/SalesInvoiceBuilder'));
const SalesInvoiceDoc = lazy(() => import('./pages/SalesInvoiceDoc'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const ImportData = lazy(() => import('./pages/Import'));
const Automation = lazy(() => import('./pages/Automation'));
const CompanyProfile = lazy(() => import('./pages/CompanyProfile'));
const Configurator = lazy(() => import('./pages/Configurator'));
const MaterialRequirements = lazy(() => import('./pages/MaterialRequirements'));
const VendorSupplies = lazy(() => import('./pages/VendorSupplies'));
const Items = lazy(() => import('./pages/Items'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const SmartKnowledge = lazy(() => import('./pages/SmartKnowledge'));
const KnowledgeArticle = lazy(() => import('./pages/KnowledgeArticle'));
const SalesQuotations = lazy(() => import('./pages/SalesQuotations'));
const SalesQuotationDoc = lazy(() => import('./pages/SalesQuotationDoc'));
const Payables = lazy(() => import('./pages/Payables'));
const DeliveryChallans = lazy(() => import('./pages/DeliveryChallans'));
const DeliveryChallanDoc = lazy(() => import('./pages/DeliveryChallanDoc'));
const CreditDebitNotes = lazy(() => import('./pages/CreditDebitNotes'));
const CreditDebitNoteDoc = lazy(() => import('./pages/CreditDebitNoteDoc'));
const Welcome = lazy(() => import('./pages/Welcome'));
const PlatformCapabilities = lazy(() => import('./pages/PlatformCapabilities'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const GetStarted = lazy(() => import('./pages/GetStarted'));
const POInvoice = lazy(() => import('./pages/POInvoice'));
const RABillInvoice = lazy(() => import('./pages/RABillInvoice'));
const BetaWelcome = lazy(() => import('./pages/BetaWelcome'));
const FirstRun = lazy(() => import('./pages/FirstRun'));
const BetaOnboarding = lazy(() => import('./pages/BetaOnboarding'));
import { PermissionProvider, usePermissions } from './context/PermissionContext';
import { ProjectProvider, useProject } from './context/ProjectContext';
import { AuthProvider } from './context/AuthContext';
import { UiConfigProvider } from './context/UiConfigContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import ProductTour from './components/ProductTour';
import AskAi from './components/AskAi';
import AccountButton from './components/AccountButton';

/* ─── There is no top bar any more ─────────────────────────
   It was ~275 lines inline here, then a tidier TopBar component, and now
   nothing: a full-width strip above every page carrying six controls, only
   one of which was worth permanent space.

   Quick Create duplicated the "+ Add …" button every list page already has,
   in the place you are already looking. "Context:" is a project selector for
   a business that may run no projects — it moved into the left rail with the
   rest of the navigation. The theme switch is set once. Sign out is a
   once-a-day action that was as loud as the primary one.

   What is left is components/AccountButton — one round avatar, top right,
   opening the account card. Pages get the whole width and the full height. */

/* ─── App Layout (with sidebar) — auth-gated AND role-gated ─────────
   RoleRoute sits here rather than on each of the 60 routes below. It works
   out the governing permission from the URL via lib/navResources, which is
   the same map the sidebar uses to decide which links to show — so the nav
   and the guard cannot disagree about what a role may open.

   Wrapping each route individually would have been more explicit and less
   safe: it guarantees the next route added is the one that forgets. Here a
   path that isn't in the map is ungated deliberately and visibly, in one
   file, rather than by omission scattered across sixty lines.

   Still only a courtesy — the server refuses regardless. The point is that
   someone who cannot use a screen gets a sentence explaining why instead of
   an empty table and a console full of 403s. */
/* Send a genuinely new install to the first-run screen once.

   "New" means the company profile has never been answered — not that the
   user is new, because everyone here shares one organisation. The check is
   deliberately fail-open: if /company-profile cannot be reached, the app
   loads normally rather than trapping a working user behind a setup form
   because the network blinked. */
const NeedsSetup = ({ children }) => {
  const [state, setState] = React.useState('checking');
  const location = useLocation();

  React.useEffect(() => {
    const token = localStorage.getItem('nexus_token');
    if (!token) { setState('ok'); return; }
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/company-profile`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(p => setState(p && !p.setup_completed_at && !p.name ? 'setup' : 'ok'))
      .catch(() => setState('ok'));
  }, []);

  if (state === 'checking') return null;
  if (state === 'setup' && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }
  return children;
};

const AppLayout = ({ children }) => (
  <ProtectedRoute>
    <NeedsSetup>
      <div className="app-layout">
        <AppNav />
        <main className="app-main" style={{ position: 'relative' }}>
          <AccountButton />
          <div className="app-page">
            <RoleRoute>{children}</RoleRoute>
          </div>
        </main>
        <ProductTour />
        <AskAi />
      </div>
    </NeedsSetup>
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
  /* Each screen arrives when it is opened, rather than all sixty arriving
     before the login form can render. The fallback is deliberately quiet —
     a spinner that flashes for eighty milliseconds is worse than nothing,
     and these chunks are small now that they are separate. */
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>}>
    <Routes>
      {/* ── Auth ── */}
      {/* The public catalogue. Outside AppLayout on purpose: a stranger
          arriving from a WhatsApp link has no token, so the nav, the
          permission context and the first-run gate would all either crash
          or redirect them to a login they have no business seeing. */}
      <Route path="/c/:slug"               element={<PublicCatalogue />} />
      <Route path="/c/:slug/:productSlug"  element={<PublicCatalogue />} />

      <Route path="/login"       element={<Login />} />
      <Route path="/signup"      element={<Signup />} />
      {/* Unauthenticated: an invited person has no password yet. The link
          in their message is the credential. */}
      <Route path="/accept-invite" element={<AcceptInvite />} />
      {/* First run: two questions, no sidebar, no wall. The older
          /onboarding and /beta-onboarding flows are still routed for anyone
          who wants the full company-details form, but nothing sends a new
          user into them any more. */}
      <Route path="/welcome"     element={<ProtectedRoute><FirstRun /></ProtectedRoute>} />
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
      <Route path="/vendors/new"       element={<AppLayout><VendorFormMinimal /></AppLayout>} />
      <Route path="/vendors/:id/edit"  element={<AppLayout><VendorFormMinimal /></AppLayout>} />
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
      <Route path="/catalogue"       element={<AppLayout><CataloguePage /></AppLayout>} />
      <Route path="/enquiries"       element={<AppLayout><Enquiries /></AppLayout>} />
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
      <Route path="/knowledge"         element={<AppLayout><SmartKnowledge /></AppLayout>} />
      <Route path="/knowledge/:slug"   element={<AppLayout><KnowledgeArticle /></AppLayout>} />
      <Route path="/sales-quotations"     element={<AppLayout><SalesQuotations /></AppLayout>} />
      <Route path="/sales-quotations/:id" element={<AppLayout><SalesQuotationDoc /></AppLayout>} />
      <Route path="/payables"             element={<AppLayout><Payables /></AppLayout>} />
      <Route path="/delivery-challans"     element={<AppLayout><DeliveryChallans /></AppLayout>} />
      <Route path="/delivery-challans/:id" element={<AppLayout><DeliveryChallanDoc /></AppLayout>} />
      <Route path="/credit-debit-notes"     element={<AppLayout><CreditDebitNotes /></AppLayout>} />
      <Route path="/credit-debit-notes/:id" element={<AppLayout><CreditDebitNoteDoc /></AppLayout>} />
      {/* The Configurator sections are routable, so the rail panel can link
          straight to one and a refresh keeps your place. Without this the
          section lived in component state and reloading dropped you back to
          the tile home. */}
      <Route path="/configurator"           element={<AppLayout><Configurator /></AppLayout>} />
      <Route path="/configurator/:section"  element={<AppLayout><Configurator /></AppLayout>} />
      <Route path="/users"             element={<AppLayout><Users /></AppLayout>} />
      <Route path="/import"            element={<AppLayout><ImportData /></AppLayout>} />
      <Route path="/automation"        element={<AppLayout><Automation /></AppLayout>} />
      <Route path="/company-profile"   element={<AppLayout><CompanyProfile /></AppLayout>} />
      <Route path="/material-requirements" element={<AppLayout><MaterialRequirements /></AppLayout>} />
      <Route path="/items"           element={<AppLayout><Items /></AppLayout>} />
      {/* Vendor Supplies folded into the Vendors screen as a tab. Kept as a
          redirect so old links and bookmarks still land in the right place. */}
      <Route path="/vendor-supplies" element={<Navigate to="/vendors?tab=supplies" replace />} />
      <Route path="/_vendor-supplies"    element={<AppLayout><VendorSupplies /></AppLayout>} />
      <Route path="/customers/:id"      element={<AppLayout><CustomerDetail /></AppLayout>} />
      <Route path="/bills/:id"         element={<ProtectedRoute><RABillInvoice /></ProtectedRoute>} />
      <Route path="/activity"          element={<AppLayout><ActivityLog /></AppLayout>} />
      <Route path="/flow"              element={<AppLayout><ProcessFlow /></AppLayout>} />
      <Route path="/boq"               element={<AppLayout><BOQ /></AppLayout>} />
      <Route path="/indent"            element={<AppLayout><Indent /></AppLayout>} />
      <Route path="/mb"                element={<AppLayout><MeasurementBook /></AppLayout>} />
      <Route path="/milestones"        element={<AppLayout><Milestones /></AppLayout>} />
      <Route path="*"                  element={<NotFound />} />
    </Routes>
    </Suspense>
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
        {/* Permissions sit just inside auth: they're fetched with the
            session and everything below — nav, route guards, action
            buttons — asks this rather than guessing from a role name. */}
        <PermissionProvider>
          <UiConfigProvider>
            <ProjectProvider>
              <Router>
                <AppRoutes />
              </Router>
            </ProjectProvider>
          </UiConfigProvider>
        </PermissionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
