import React from 'react';
import {
  Lock, Users, Check, FileText, ShoppingBag, ShoppingCart, BadgeCheck, PackageCheck, Factory, ReceiptText, Wallet,
} from 'lucide-react';
import { canFor, ROLE_ORDER } from '../../film/data/roleViews';
import { SELLER } from '../../data/transaction';
import { Lines, Thread } from '../parts';
import { box } from '../geo';

/* ══════════════════════════════════════════════════════════════════════
   Act 6 — one organisation, the right access for each person. (45.5–
   49.5 s; from 45.5 s)

   Five of the app's default roles, side by side, and what each may do.
   Most roles can look at most things — what sets them apart is what they
   can change: Sales quotes and invoices, Procurement buys and receives,
   Production produces, and only Finance (and the Owner) can sign off a
   purchase order, which is the sign-off the ad showed in act 3. Nothing
   is drawn by hand: each tick is the role's own write permission
   (film/data/roles.snapshot.js, checked against backend/shared/roles.js
   by check-film.mjs). Change a role in the app and this picture changes.

   On a phone the roles pass one at a time, sideways.
   ══════════════════════════════════════════════════════════════════════ */

/* what a person in the role can do, by the permission that allows it */
const ACTIONS = [
  ['Send quotations', 'sales-quotations', FileText],
  ['Take orders', 'customer-orders', ShoppingBag],
  ['Raise POs', 'po', ShoppingCart],
  ['Sign off POs', 'po-approval', BadgeCheck],
  ['Receive goods', 'grn', PackageCheck],
  ['Run production', 'production', Factory],
  ['Raise invoices', 'sales-invoices', ReceiptText],
  ['Record expenses', 'expenses', Wallet],
  ['Manage the team', 'users', Users],
];
const ROLES = ROLE_ORDER.map((role) => {
  const can = canFor(role);
  const open = new Set(ACTIONS.filter(([, res]) => can(res, 'write')).map(([label]) => label));
  return { role, open, count: open.size };
});

const L = {
  wide: {
    head: [120, 150, 1040, 56], col: (i) => [120 + i * 212, 236, 196, 430],
    bus: 'M 640 206 L 640 220 M 218 236 L 218 220 L 1062 220 L 1062 236 M 430 220 L 430 236 M 642 220 L 642 236 M 854 220 L 854 236',
  },
  narrow: { head: [16, 112, 388, 56], col: (i) => [16 + i * 316, 184, 300, 470], bus: null },
};

function RoleCard({ r, at, on, layout }) {
  return (
    <div className={`ad-role${on ? ' is-on' : ''}`} style={box(at)}>
      <span className="ad-role-h"><b>{r.role}</b><small>can do {r.count} of {ACTIONS.length}</small></span>
      <span className="ad-role-list">
        {ACTIONS.map((a, k) => {
          const [label] = a;
          const Ico = a[2];
          const open = r.open.has(label);
          return (
            <span key={label} className={open ? 'is-open' : 'is-shut'} style={{ '--k': k }}>
              <Ico size={layout === 'narrow' ? 14 : 13} />
              {label}
              {open ? <Check size={12} className="ad-lock" /> : <Lock size={11} className="ad-lock" />}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export default function Org({ t, layout }) {
  const l = L[layout];
  const narrow = layout === 'narrow';
  /* on a phone: one role at a time, sliding left */
  const shown = Math.max(0, Math.min(ROLES.length - 1, Math.floor((t - 500) / 650)));
  return (
    <div className={`ad-act ad-org is-${layout}`}>
      <div className={`ad-org-head${t >= 100 ? ' is-on' : ''}`} style={box(l.head)}>
        <span className="fm-cat-logo">PF</span>
        <span><b>{SELLER.name}</b><small>One organisation · {ROLES.length} roles</small></span>
        <span className="ad-org-n"><Users size={14} /> Team &amp; roles</span>
      </div>
      {l.bus && <Lines layout={layout}><Thread d={l.bus} on={t >= 200} dur={700} /></Lines>}
      {narrow ? (
        <div className="ad-role-track" style={{ transform: `translateX(${-shown * 316}px)` }}>
          {ROLES.map((r, i) => <RoleCard key={r.role} r={r} at={l.col(i)} on={t >= 300} layout={layout} />)}
        </div>
      ) : (
        ROLES.map((r, i) => <RoleCard key={r.role} r={r} at={l.col(i)} on={t >= 350 + i * 200} layout={layout} />)
      )}
    </div>
  );
}
