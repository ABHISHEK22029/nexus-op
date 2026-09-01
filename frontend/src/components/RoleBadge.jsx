/* ══════════════════════════════════════════════════════════
   RoleBadge — shows the role you actually have.

   Replaces a "View as:" dropdown that let anyone pick Admin from a menu.
   That control changed a local variable and nothing else, so it never
   affected a single server response — but it looked exactly like a
   privilege switch, which is a bad thing for a control to look like when
   it isn't one.

   This is read-only by design. Hovering explains what the role covers, so
   a 403 elsewhere in the product is self-explanatory rather than mysterious.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { UserCircle } from 'lucide-react';
import { usePermissions } from '../context/PermissionContext';

/* Kept in step with shared/roles.js on the server, but purely descriptive —
   nothing here grants anything. */
const BLURB = {
  Administrator: 'Full access across every workspace, including user accounts.',
  Owner: 'Full access to your own workspace. User accounts stay with an administrator.',
  Sales: 'Quotes, customers, orders and invoices. Reads stock and production.',
  Procurement: 'Vendors, purchase orders, indents and goods receipt. Cannot approve its own POs.',
  Production: 'Work orders, production and projects. Reads material availability.',
  Finance: 'Invoices, bills, payments and credit notes. Approves purchase orders.',
  Viewer: 'Reads everything, changes nothing.',
};

export default function RoleBadge() {
  const { role, roleLabel, loading, user } = usePermissions();

  if (loading) return null;
  if (!role) return null;

  const label = roleLabel || role;
  return (
    <div
      title={`${user?.email || ''}\n${BLURB[role] || ''}`.trim()}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8, padding: '6px 12px',
        cursor: 'default',
      }}
    >
      <UserCircle size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        Signed in as
      </span>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-amber)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}
