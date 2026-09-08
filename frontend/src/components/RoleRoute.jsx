/* ══════════════════════════════════════════════════════════
   RoleRoute — don't route someone to a screen that will only 403.

   This is a courtesy, not a security boundary; the server refuses
   regardless. The value is that someone who cannot use a screen gets a
   sentence explaining why, instead of a page of empty tables and failed
   requests that reads like the product is broken.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { usePermissions } from '../context/PermissionContext';
import { resourceForPath, isAdminOnlyPath } from '../lib/navResources';
import { optionalModuleForPath } from '../lib/navigation';

/**
 * Guards a page. With no `resource` prop it derives one from the current
 * path, which is how AppLayout applies it to every route at once — wrapping
 * 60 routes by hand guarantees the 61st is forgotten.
 */
export default function RoleRoute({ resource, action = 'read', children }) {
  const { can, loading, roleLabel, role, modules: orgModules } = usePermissions();
  const location = useLocation();

  // Don't flash "no access" while we're still asking who this is.
  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Checking access…</div>;

  /* A screen belonging to a feature area this organisation has not switched
     on. Different from a permission, and it says so: nothing is being
     withheld from this person, the product simply does not include that
     part here. Someone arriving on an old bookmark deserves that sentence
     rather than a page of empty tables. */
  const optional = optionalModuleForPath(location.pathname);
  if (optional && orgModules && orgModules[optional] === false) {
    return <ModuleOff module={optional} />;
  }

  if (isAdminOnlyPath(location.pathname)) {
    /* Owner too. This was the THIRD gate on the Configurator — the nav
       filter and the page's own check were both opened up, and this one
       still turned a founder away at the door with "Not part of your role"
       on a screen that had already been made to work for them.
     *
       An Owner administers their own organisation: every endpoint behind
       this screen is scoped to their org, built-in roles cannot be edited
       from here, and the cross-tenant Administrator role cannot be granted
       by anyone who does not already hold it. */
    if (role === 'Administrator' || role === 'Owner') return children;
    return <Denied role={role} roleLabel={roleLabel} what="the Configurator" action="open" />;
  }

  const res = resource || resourceForPath(location.pathname);
  if (!res) return children;                 // deliberately ungated
  if (can(res, action)) return children;
  return <Denied role={role} roleLabel={roleLabel} what={friendly(res)} action={action === 'read' ? 'view' : 'change'} />;
}

const MODULE_NAMES = {
  contracting: 'Contracting — bills of quantities, the measurement book, indents and RA bills',
};

function ModuleOff({ module }) {
  return (
    <div style={{ maxWidth: 470, margin: '48px auto', textAlign: 'center' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, margin: '0 auto 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      }}>
        <Lock size={20} style={{ color: 'var(--text-muted)' }} />
      </div>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px' }}>
        Not switched on for this business
      </h2>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 16px' }}>
        {MODULE_NAMES[module] || module} is turned off. Nothing has been deleted — switch it
        back on in <strong>Configure → Modules</strong> and everything is where you left it.
      </p>
      <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>Back to dashboard</Link>
    </div>
  );
}

function Denied({ role, roleLabel, what, action }) {

  return (
    <div style={{ maxWidth: 460, margin: '48px auto', textAlign: 'center' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, margin: '0 auto 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      }}>
        <Lock size={20} style={{ color: 'var(--text-muted)' }} />
      </div>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px' }}>
        Not part of your role
      </h2>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 16px' }}>
        You're signed in as <strong>{roleLabel || role || 'unknown'}</strong>, which doesn't
        cover {action === 'open' ? 'opening' : action === 'view' ? 'viewing' : 'changing'} {what}.
        Ask an administrator if you need it.
      </p>
      <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>Back to dashboard</Link>
    </div>
  );
}

const NAMES = {
  'sales-invoices': 'sales invoices', 'sales-quotations': 'quotations',
  'delivery-challans': 'delivery challans', 'customer-orders': 'customer orders',
  'credit-debit-notes': 'credit and debit notes', 'raw-materials': 'raw materials',
  'vendor-items': 'vendor supplies', 'work-orders': 'work orders',
  'material-requirements': 'material requirements', 'grn-bills': 'GRN bills',
  'company-profile': 'the company profile', 'automation-settings': 'automation settings',
  po: 'purchase orders', mb: 'the measurement book', boq: 'bills of quantities',
  users: 'user accounts', payables: 'accounts payable',
};
const friendly = (r) => NAMES[r] || String(r).replace(/-/g, ' ');
