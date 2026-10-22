import React from 'react';
import { Check, Crown, Handshake, ShoppingCart, Factory, Wallet, Users } from 'lucide-react';
import { canFor } from '../film/data/roleViews';

/* ══════════════════════════════════════════════════════════════════════
   Who can do what — the homepage's one dark reading band.

   Each tick is the role's real write permission, read from the backend's
   own role table (film/data/roles.snapshot.js, checked against
   backend/shared/roles.js), so the page cannot promise an access the app
   doesn't give. The staircase of ticks is the point: each role owns its
   stretch of the flow, and the Owner owns all of it.

   Divs with table roles rather than a <table>: index.css styles every
   tbody td in the light theme with !important, and that would reach into
   this dark band. data-theme="dark" scopes the theme tokens to their dark
   values for this section alone. Styles: mk-roles-* in styles/motion.css.
   ══════════════════════════════════════════════════════════════════════ */

const ACTIONS = [
  ['Send quotations', 'sales-quotations'],
  ['Take customer orders', 'customer-orders'],
  ['Raise invoices', 'sales-invoices'],
  ['Compare vendor quotes', 'quotations'],
  ['Raise purchase orders', 'po'],
  ['Receive goods', 'grn'],
  ['Adjust stock', 'inventory'],
  ['Run production', 'production'],
  ['Sign off purchase orders', 'po-approval'],
  ['Record expenses', 'expenses'],
  ['Manage the team', 'users'],
];
const ROLES = [
  { role: 'Owner', Icon: Crown, color: '#FF7A00' },
  { role: 'Sales', Icon: Handshake, color: '#3B82F6' },
  { role: 'Procurement', Icon: ShoppingCart, color: '#A78BFA' },
  { role: 'Production', Icon: Factory, color: '#06B6D4' },
  { role: 'Finance', Icon: Wallet, color: '#22C55E' },
].map((r) => ({ ...r, can: canFor(r.role) }));

const RolesGrid = () => (
  <div className="mk-roles-grid" role="table" aria-label="What each role can change">
    <div className="mk-roles-row mk-roles-headrow" role="row">
      <span role="columnheader"><span className="mk-sr">Action</span></span>
      {ROLES.map(({ role, Icon, color }) => (
        <span key={role} role="columnheader" className="mk-roles-col" style={{ '--role': color }}>
          <span className="mk-roles-ico" aria-hidden="true">{React.createElement(Icon, { size: 15 })}</span>
          <span className="mk-roles-name">{role}</span>
        </span>
      ))}
    </div>
    {ACTIONS.map(([label, res]) => (
      <div key={res} className="mk-roles-row" role="row">
        <span role="rowheader" className="mk-roles-act">{label}</span>
        {ROLES.map(({ role, color, can }) => (
          <span key={role} role="cell" className="mk-roles-cell">
            {can(res, 'write')
              ? <span className="mk-roles-yes" style={{ '--role': color }}><Check size={13} strokeWidth={3} aria-hidden="true" /><span className="mk-sr">{role}: yes</span></span>
              : <span className="mk-roles-no"><span className="mk-sr">{role}: no</span></span>}
          </span>
        ))}
      </div>
    ))}
  </div>
);

export default function RolesBand() {
  return (
    <section className="section mk-roles-band" data-theme="dark">
      <div className="container mk-roles-layout">
        <div className="mk-roles-copy">
          <span className="mk-eyebrow"><Users size={13} /> Roles and access</span>
          <h2>Everyone in one place. <span className="gradient-text-amber">Each does their part.</span></h2>
          <p>Each person changes only what their role allows. Add a read-only Viewer, or make your own role.</p>
          <ul className="mk-roles-legend" aria-hidden="true">
            {ROLES.map(({ role, Icon, color }) => (
              <li key={role} style={{ '--role': color }}><span className="mk-roles-ico">{React.createElement(Icon, { size: 13 })}</span>{role}</li>
            ))}
          </ul>
        </div>
        <RolesGrid />
      </div>
    </section>
  );
}
