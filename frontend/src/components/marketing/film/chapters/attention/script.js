/* 16 — what needs attention: the menu's badges, the notifications, and
   asking the AI about your own data. */
export default {
  key: 'attention',
  title: 'Attention & AI',
  kicker: 'Where work is waiting',
  surface: 'app',
  path: '/purchase-orders',
  badges: { '/purchase-orders': 1, '/quotations': 2, '/enquiries': 1, '/customer-orders': 2 },
  duration: 25000,
  beats: [
    { key: 'badges', at: 0,
      voice: 'Where work is waiting, the menu says so: what is unread, what needs signing, what is still missing.' },
    { key: 'notes', at: 7500, path: '/activity', badges: {},
      voice: 'The right people are told: an enquiry in, an order to sign off, goods received, a payment in.' },
    { key: 'ai', at: 15000, path: '/activity', badges: {},
      voice: 'Or just ask. Ask AI answers from your own data: what is overdue, what needs you, what is running low.' },
  ],
  sr: 'Attention: the menu’s live counts — a purchase order awaiting approval, vendor quotes still short of three; the notifications in the account menu — new enquiry ENQ-0042, approval needed for PFW/FY2026-27/018, goods received GRN-00031, payment received for INV-0147; and Ask AI answering what needs approval from the company’s own data.',
  seo: {
    body: 'The menu shows where work is waiting — enquiries not yet read, purchase orders awaiting approval, challans missing an e-way bill — and notifications reach the people who act on them, in their own company only. Ask AI answers questions about your own records: what is overdue, what needs approval, what is low on stock.',
  },
  truth: [
    ['lib/navigation.js', 'awaiting approval'],
    ['lib/navigation.js', 'still short of three quotes'],
    ['lib/navigation.js', 'not yet read'],
    ['components/NotificationBell.jsx', 'Mark all read'],
    ['components/AskAi.jsx', 'Answers about your Maks Ops data'],
    ['components/AskAi.jsx', 'What needs my approval?'],
  ],
};
