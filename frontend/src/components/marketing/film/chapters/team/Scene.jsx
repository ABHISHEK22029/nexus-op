import React from 'react';
import { Users, UserPlus, Settings, Copy, Mail, Plus, Check } from 'lucide-react';
import { Show, Typed, Cursor, Pill } from '../../../flow/kit';
import { ScreenHead, Tiles } from '../../shell/screen';
import AppShell from '../../shell/AppShell';
import { ROLES, RESOURCE_LABELS } from '../../data/roles.snapshot';
import { canFor, ROLE_ORDER, STORE_KEEPER } from '../../data/roleViews';
import { visibleItems } from '../../../../../lib/navigation';

/* 02 — Users.jsx (Team), AddPersonModal, the Configurator's Roles &
   permissions grid and its New role card, and the app's own menu as each
   role sees it. Every permission drawn here comes from the backend's role
   table (roles.snapshot.js); every menu from lib/navigation.js. */
export const Icon = Users;

const PEOPLE = [
  ['Arjun Rao', 'arjun@precisionfab.example', 'Owner', 'Management', 'today'],
  ['Priya Nair', 'priya@precisionfab.example', 'Sales', 'Sales', 'today'],
  ['Kavya Reddy', 'kavya@precisionfab.example', 'Finance', 'Accounts', 'yesterday'],
  ['Suresh Babu', 'suresh@precisionfab.example', 'Production', 'Shop floor', '3 days ago'],
];
const NEWCOMER = ['Ramesh Kumar', 'ramesh@precisionfab.example', 'Procurement', 'Purchase', 'never'];

function Team({ t }) {
  const added = t >= 12200;
  const rows = added ? [...PEOPLE, NEWCOMER] : PEOPLE;
  return (
    <div className="fm-screen">
      <ScreenHead icon={Users} title="Team" sub="Who works here, and what each person's role lets them do."
        right={(
          <span className="fm-sh-actions">
            <span className="fl-btn"><Settings size={13} /> Manage roles</span>
            <span className="fl-cursor-host is-inline">
              <span className={`fl-btn primary${t >= 5400 && t < 5650 ? ' is-pressed' : ''}`}><UserPlus size={13} /> Add person</span>
              <Cursor on={t >= 4600 && t < 6000} click={t >= 5400 && t < 5650} />
            </span>
          </span>
        )} />
      <Tiles items={[['People', rows.length], ['Active', 4, 'ok'], ['Inactive', 0], ['Never signed in', added ? 1 : 0]]} />
      <div className="fm-table">
        <div className="fm-tr is-head"><span>Person</span><span>Role</span><span>Department</span><span>Status</span><span>Last signed in</span></div>
        {rows.map(([name, email, role, dept, last]) => (
          <div key={name} className={`fm-tr${name === NEWCOMER[0] ? ' is-new' : ''}`}>
            <span className="fm-person"><i>{name[0]}</i><b>{name}<small>{email}</small></b></span>
            <span><Pill tone={role === 'Owner' ? 'amber' : 'neutral'}>{role}</Pill></span>
            <span className="fm-muted">{dept}</span>
            <span>{last === 'never' ? <Pill tone="info">Invited</Pill> : <Pill tone="ok" dot>Active</Pill>}</span>
            <span className="fm-muted">{last === 'never' ? '—' : last}</span>
          </div>
        ))}
      </div>
      {t >= 6000 && t < 12200 && <Invite t={t} />}
    </div>
  );
}

function Invite({ t }) {
  const sent = t >= 10000;
  return (
    <div className="fm-modal-wrap">
      <div className="fm-modal fl-enter">
        <b className="fm-modal-h"><UserPlus size={16} /> Add someone to the team</b>
        {!sent ? (
          <>
            <label className="fm-pf-field"><small>Name</small><span className="fm-input is-app"><Typed text={NEWCOMER[0]} t={t} start={6500} cps={20} ph="e.g. Ramesh Kumar" /></span></label>
            <label className="fm-pf-field"><small>Email</small><span className="fm-input is-app"><Typed text={NEWCOMER[1]} t={t} start={7300} cps={30} ph="they sign in with this" /></span></label>
            <div className="fm-row2">
              <label className="fm-pf-field"><small>Role</small><span className="fm-input is-app is-select">{t >= 8400 ? 'Procurement' : 'Viewer'}</span></label>
              <label className="fm-pf-field"><small>What they do <em>optional</em></small><span className="fm-input is-app"><Typed text="Purchase" t={t} start={8700} cps={16} ph="e.g. Purchase, Stores, Accounts" /></span></label>
            </div>
            <span className="fl-cursor-host">
              <span className={`fl-btn primary is-wide${t >= 9600 && t < 9850 ? ' is-pressed' : ''}`}><Mail size={13} /> Send invitation</span>
              <Cursor on={t >= 9000 && t < 10100} click={t >= 9600 && t < 9850} />
            </span>
          </>
        ) : (
          <div className="fm-invite fl-enter-soft">
            <span className="fm-invite-ok"><Check size={15} /> Invitation ready for {NEWCOMER[0]}</span>
            <span className="fm-input is-app is-mono">maksops.co.in/accept-invite?token=••••••••••••</span>
            <span className="fm-sh-actions"><span className="fl-btn primary"><Copy size={13} /> Copy link</span><span className="fl-btn">Open Gmail</span></span>
            <small className="fm-muted">Works once, expires in seven days.</small>
          </div>
        )}
      </div>
    </div>
  );
}

const GRID = ['enquiries', 'sales-quotations', 'customer-orders', 'po', 'po-approval', 'grn', 'production', 'sales-invoices', 'payables'];
const Chips = ({ actions = [], off = [] }) => (
  <span className="fm-rw">
    {['read', 'write', 'delete'].map((a) => (
      <i key={a} className={actions.includes(a) && !off.includes(a) ? 'is-on' : ''}>{a[0]}</i>
    ))}
  </span>
);

function Roles({ t, custom }) {
  const showKeeper = custom && t >= 30200;
  const poOff = custom && t >= 32000;
  const cols = [...ROLE_ORDER.map((r) => [r, ROLES[r].permissions]), ...(showKeeper ? [['Store Keeper', STORE_KEEPER.permissions]] : [])];
  return (
    <div className="fm-screen">
      <ScreenHead icon={Settings} title="Configurator" sub="Accounts, roles and what each role is allowed to do."
        right={custom && <span className="fl-btn primary"><Plus size={13} /> New role</span>} />
      <div className="fm-table fm-grid-roles" style={{ '--cols': cols.length }}>
        <div className="fm-tr is-head"><span>Resource</span>{cols.map(([r]) => <span key={r} className={r === 'Store Keeper' ? 'is-new-col' : ''}>{r}</span>)}</div>
        {GRID.map((res, i) => (
          <Show key={res} on={custom || t >= 13200 + i * 140} className="fm-tr">
            <span className="fm-res"><b>{RESOURCE_LABELS[res] || res}</b><small>{res}</small></span>
            {cols.map(([r, perms]) => (
              <span key={r} className={r === 'Store Keeper' ? 'is-new-col' : ''}>
                <Chips actions={r === 'Store Keeper' && res === 'po' && !poOff ? (ROLES.Procurement.permissions.po || []) : perms[res]} />
              </span>
            ))}
          </Show>
        ))}
      </div>
      {custom && t < 30200 && (
        <div className="fm-modal-wrap is-light">
          <div className="fm-modal fl-enter">
            <b className="fm-modal-h">New role</b>
            <p className="fm-muted fm-modal-p">Start from an existing role and adjust — a blank role can do nothing at all, and “like Sales, but also…” is usually what's meant.</p>
            <div className="fm-row2">
              <label className="fm-pf-field"><small>Name</small><span className="fm-input is-app"><Typed text="Store Keeper" t={t} start={28000} cps={18} ph="Store Keeper" /></span></label>
              <label className="fm-pf-field"><small>Start from</small><span className="fm-input is-app is-select">{t >= 29000 ? 'Procurement' : 'Owner'}</span></label>
            </div>
            <label className="fm-pf-field"><small>What this role is for</small><span className="fm-input is-app"><Typed text="Receives material and keeps the store" t={t} start={29200} cps={40} /></span></label>
            <span className="fl-cursor-host is-inline"><span className={`fl-btn primary${t >= 29900 ? ' is-pressed' : ''}`}>Create</span><Cursor on={t >= 29400} click={t >= 29900} /></span>
          </div>
        </div>
      )}
      {poOff && <Show on className="fm-note-chip">Store Keeper: purchase orders read-only — receives goods, does not buy.</Show>}
    </div>
  );
}

const SEEN = [
  ['Owner', 19500, 'Everything, including Configure — and signing off purchase orders.'],
  ['Sales', 21300, 'Sales and enquiries. Purchases shows only Vendors; nothing about what you owe suppliers.'],
  ['Procurement', 23100, 'Vendors, quotes, purchase orders and goods received — but not sign-off, and not payables.'],
  ['Finance', 25000, 'Invoices, payables and credit notes — and signing off purchase orders.'],
];

function Views({ t, layout }) {
  const cur = [...SEEN].reverse().find(([, at]) => t >= at) || SEEN[0];
  const [role, , says] = cur;
  const can = canFor(role);
  const buying = visibleItems('purchases', can, role, { contracting: false }).filter((i) => i.path);
  return (
    <div className="fm-views">
      <div className="fm-views-bar">
        <span className="fm-muted">Seen as</span>
        {SEEN.map(([r]) => <span key={r} className={`fm-chip${r === role ? ' is-on' : ''}`}>{r}</span>)}
      </div>
      <div className="fm-views-shell">
        <AppShell path="/purchase-orders" role={role} can={can} layout={layout}>
          <div className="fm-screen">
            <div className="fm-views-card fl-enter-soft" key={role}>
              <b>What {role} sees</b>
              <p>{says}</p>
              <small className="fm-muted">Purchases menu: {buying.map((i) => i.label).join(' · ') || 'none'}</small>
            </div>
          </div>
        </AppShell>
      </div>
    </div>
  );
}

export default function Scene({ t, beat, layout }) {
  if (beat.key === 'roles') return <Roles t={t} />;
  if (beat.key === 'custom') return <Roles t={t} custom />;
  if (beat.key === 'views') return <Views t={t} layout={layout} />;
  return <Team t={t} />;
}
