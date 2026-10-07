/* 02 — team and roles: invite people, see what each role may reach, and
   make a role of your own. The roles are the backend's own (generated into
   data/roles.snapshot.js); `claims` are checked against backend roles.js. */
export default {
  key: 'team',
  title: 'Team & roles',
  kicker: 'Everyone sees their part',
  surface: 'app',
  path: '/users',
  duration: 34000,
  beats: [
    { key: 'team', at: 0, voice: 'Bring in your team. Each person signs in with a login of their own.' },
    { key: 'invite', at: 6000,
      voice: 'Invite them by email, in the role they will work in. The link works once, and expires in a week.' },
    { key: 'roles', at: 13000, path: '/configurator/roles',
      voice: 'Each role’s access is laid out in one grid, and the server checks it on every request.' },
    { key: 'views', at: 19500, surface: 'bare',
      voice: 'So each person sees their part of the business. Procurement raises purchase orders; Finance signs them off.' },
    { key: 'custom', at: 27500, path: '/configurator/roles',
      voice: 'Need a role of your own? Start from one that is close, and change what it may do.' },
  ],
  sr: 'Team and roles: the Team page with Add person; an invitation for Ramesh Kumar as Procurement, with a one-time link; the Roles & permissions grid; the same app as seen by the Owner, Sales, Procurement and Finance, each with a different menu; and a new Store Keeper role started from Procurement, with purchase orders read-only.',
  seo: {
    body: 'Invite each person with a role — Owner, Sales, Procurement, Production, Finance or Viewer — and the menu, the screens and the server all follow it. Sales never sees what you owe suppliers; Procurement raises purchase orders but cannot sign them off; Finance can. Make your own roles by copying one and changing it.',
  },
  claims: [
    { role: 'Sales', resource: 'payables', action: 'read', expect: false },
    { role: 'Procurement', resource: 'po', action: 'write', expect: true },
    { role: 'Procurement', resource: 'po-approval', action: 'write', expect: false },
    { role: 'Finance', resource: 'po-approval', action: 'write', expect: true },
    { role: 'Owner', resource: 'po-approval', action: 'write', expect: true },
  ],
  truth: [
    ['pages/Users.jsx', 'Add person'],
    ['pages/Users.jsx', 'Manage roles'],
    ['pages/Users.jsx', 'Last signed in'],
    ['components/AddPersonModal.jsx', 'Add someone to the team'],
    ['components/AddPersonModal.jsx', 'Send invitation'],
    ['components/AddPersonModal.jsx', 'Copy link'],
    ['components/AddPersonModal.jsx', 'expires in seven days'],
    ['pages/Configurator.jsx', 'New role'],
    ['pages/Configurator.jsx', 'Start from'],
  ],
};
