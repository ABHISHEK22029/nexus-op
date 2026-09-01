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

/**
 * Guards a page. With no `resource` prop it derives one from the current
 * path, which is how AppLayout applies it to every route at once — wrapping
 * 60 routes by hand guarantees the 61st is forgotten.
 */
export default function RoleRoute({ resource, action = 'read', children }) {
  const { can, loading, roleLabel, role } = usePermissions();
  const location = useLocation();

  // Don't flash "no access" while we're still asking who this is.
  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Checking access…</div>;

  if (isAdminOnlyPath(location.pathname)) {
    if (role === 'Administrator') return children;
    return <Denied role={role} roleLabel={roleLabel} what="the Configurator" action="open" />;
  }

  const res = resource || resourceForPath(location.pathname);
  if (!res) return children;                 // deliberately ungated
  if (can(res, action)) return children;
  return <Denied role={role} roleLabel={roleLabel} what={friendly(res)} action={action === 'read' ? 'view' : 'change'} />;
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
