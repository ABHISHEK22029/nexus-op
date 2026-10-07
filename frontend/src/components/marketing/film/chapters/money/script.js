/* 15 — money: expenses, schedules that run themselves, and the numbers. */
export default {
  key: 'money',
  title: 'Money',
  kicker: 'What came in, what went out',
  surface: 'app',
  path: '/expenses',
  duration: 22000,
  beats: [
    { key: 'expenses', at: 0, voice: 'Day-to-day costs go in as expenses: what for, how much, and who was paid.' },
    { key: 'recurring', at: 6500, path: '/automation',
      voice: 'Rent, retainers and maintenance contracts run themselves, on a schedule you set.' },
    { key: 'reports', at: 13500, path: '/reports',
      voice: 'And the numbers come together: billed, received, owed and spent. Every register exports.' },
  ],
  sr: 'Money: expenses for factory rent, electricity and diesel, with who was paid; a monthly schedule for the ₹65,000 factory rent, with Run now; and Reports & Export with total sales invoiced, receivables outstanding, purchase bills, expenses and the operational margin, and a CSV of every register.',
  seo: {
    body: 'Record expenses as they happen, put the regular ones — rent, retainers, maintenance contracts — on a schedule that raises them by itself, and see the business in one place: sales invoiced, receivables outstanding, purchase bills, expenses and the margin, with every register a click from a spreadsheet.',
  },
  truth: [
    ['pages/Automation.jsx', 'Expense we pay'],
    ['pages/Automation.jsx', 'Invoice we bill'],
    ['pages/Automation.jsx', 'Create schedule'],
    ['pages/Automation.jsx', 'Run now'],
    ['pages/Reports.jsx', 'Receivables Outstanding'],
    ['pages/Reports.jsx', 'Operational Margin'],
    ['pages/Reports.jsx', 'Export registers'],
  ],
};
