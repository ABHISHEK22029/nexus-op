/* 01 — your workspace: the business, its tax and bank details, and the
   checklist that says what is still missing. */
export default {
  key: 'workspace',
  title: 'Your workspace',
  kicker: 'Set up once, printed everywhere',
  surface: 'app',
  duration: 24000,
  beats: [
    { key: 'firstrun', at: 0, surface: 'bare',
      voice: 'Start with your business: its name, and how many people work there.' },
    { key: 'profile', at: 7500, path: '/company-profile',
      voice: 'Add your GSTIN and bank details once. Every quotation and invoice prints them.' },
    { key: 'ready', at: 15500, path: '/material-requirements',
      voice: 'A checklist says what is still missing, and what it costs you, until it is done.' },
  ],
  sr: 'Setting up the workspace: the business name and size, then the company profile with GSTIN, state code, PAN and bank details, then the setup checklist showing what is still missing — a bill of materials and vendors for the materials — each with Fix this.',
  seo: {
    body: 'A new organisation is ready in a minute: the business name, its GSTIN, PAN and bank details for documents, and the invoice defaults. Until the essentials are in place, a checklist names what is missing and what it costs — no letterhead, no payment details, no material plan.',
  },
  truth: [
    ['pages/FirstRun.jsx', 'Set up your workspace'],
    ['pages/FirstRun.jsx', 'What is your business called?'],
    ['pages/FirstRun.jsx', 'How many people work there?'],
    ['pages/CompanyProfile.jsx', 'Tax & registration'],
    ['pages/CompanyProfile.jsx', 'Bank details'],
    ['components/SetupReadiness.jsx', 'Fix this'],
  ],
};
