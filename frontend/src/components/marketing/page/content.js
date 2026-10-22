/* ══════════════════════════════════════════════════════════════════════
   What the three marketing pages say.

   Each page has one film, at the top. Everything under it explains with
   pictures that are NOT that film again: small animated diagrams of how a
   thing works (`diagram`, drawn by page/Diagrams.jsx from
   FeatureDiagrams), icons, short points, and the catalogue a customer
   actually browses. The words are kept short and set out to be scanned —
   a title, one line, a few points — never a paragraph.

   Plain JavaScript (no JSX). scripts/test-marketing.cjs measures each page
   against its length and word budget as a visitor sees it.
   ══════════════════════════════════════════════════════════════════════ */
import {
  Store, FileText, ClipboardCheck, Scale, PackageCheck, Factory, ReceiptText, Users,
  MessageCircle, StickyNote, Calculator, Sheet, Inbox, Boxes, Wallet,
  Sparkles, FolderGit2, BookOpen, Printer, Building2, Globe, ShoppingCart, Truck, Bell, Link2, Clapperboard,
  Contact, BarChart3, FileMinus,
} from 'lucide-react';
import { makeIds } from '../data/transaction';

/* ── Home ── */

/* The chips under the ad: each plays the ad from a feature. `scenes` are
   the ad's scenes (ad/script.js) that light the chip while they play. */
export const AD_CHIPS = [
  { label: 'Catalogue', Icon: Store, at: 11500, scenes: ['catalogue', 'enquiry'] },
  { label: 'Quotation', Icon: FileText, at: 22000, scenes: ['quote', 'approve'] },
  { label: 'Order check', Icon: ClipboardCheck, at: 30500, scenes: ['order', 'needs'] },
  { label: 'Vendor quotes', Icon: Scale, at: 38500, scenes: ['quotes', 'po', 'signoff'] },
  { label: 'Stock', Icon: PackageCheck, at: 49500, scenes: ['grn'] },
  { label: 'Production', Icon: Factory, at: 55000, scenes: ['production'] },
  { label: 'Invoice & paid', Icon: ReceiptText, at: 60500, scenes: ['deliver', 'thread'] },
  { label: 'Team & AI', Icon: Users, at: 73000, scenes: ['roles', 'ai', 'numbers', 'alerts'] },
];

/* One order through the business, in the order it happens: three lanes
   (Sell, Buy, Make & get paid), three stages each. A stage is a diagram of
   what it does, a name, a few words and the record it leaves; pressing it
   plays that part of the ad (`play`, ms). Read across, then down. */
const IDS = makeIds();
export const LANES = [
  { key: 'sell', title: 'Sell', tag: 'Quote in a click.', tone: 'amber', stages: [
    { title: 'Catalogue', line: 'Browsed without a login', diagram: 'search', record: IDS.enq, play: 11500 },
    { title: 'Quotation', line: 'GST by place of supply', diagram: 'gst', record: IDS.qt, play: 22000 },
    { title: 'Order', line: 'Made from the quote', diagram: 'qt-co', record: IDS.co, play: 30500 },
  ] },
  { key: 'buy', title: 'Buy', tag: 'Pay the lowest price.', tone: 'violet', stages: [
    { title: 'Vendor quotes', line: 'Read out, not retyped', diagram: 'parse', record: 'xlsx · pdf · docx', play: 38500 },
    { title: 'Purchase order', line: 'Lowest, like for like', diagram: 'compare', record: IDS.po, play: 43000 },
    { title: 'Receipt', line: 'Stock moves on its own', diagram: 'stock', record: IDS.grn, play: 49500 },
  ] },
  { key: 'make', title: 'Make & get paid', tag: 'Every kilo counted.', tone: 'green', stages: [
    { title: 'Production', line: 'Yield, scrap counted', diagram: 'yield', record: IDS.prod, play: 55000 },
    { title: 'Dispatch', line: 'Challan and e-way bill', diagram: 'co-dc', record: IDS.dc, play: 60500 },
    { title: 'Invoice', line: 'Invoiced, then paid', diagram: 'inv-paid', record: IDS.inv, play: 60500 },
  ] },
];

/* What sits around the flow, named and no more. */
export const ALSO_INSIDE = [
  { label: 'Documents that print right', Icon: Printer },
  { label: 'Customers & vendors', Icon: Contact },
  { label: 'Expenses & reports', Icon: BarChart3 },
  { label: 'Credit & debit notes', Icon: FileMinus },
  { label: 'Projects & BOQ', Icon: FolderGit2 },
  { label: 'Ask AI', Icon: Sparkles },
  { label: 'Smart Knowledge', Icon: BookOpen },
];

/* Before Maks Ops, and with it — the ad's opening, as a table. */
export const BEFORE_AFTER = [
  { before: 'Orders on WhatsApp', B: MessageCircle, after: 'Every enquiry in one inbox', A: Inbox },
  { before: 'Stock in a notebook', B: StickyNote, after: 'Live stock, and what to buy', A: Boxes },
  { before: 'Vendor quotes in PDFs', B: FileText, after: 'Quotes compared side by side', A: Scale },
  { before: 'GST worked out by hand', B: Calculator, after: 'GST by place of supply', A: ReceiptText },
  { before: 'Bills in Excel', B: Sheet, after: 'Invoices and payments tracked', A: Wallet },
];

/* What's new — real releases, newest first (from the commit history). */
export const NEWS = [
  { date: '21 Oct 2026', title: 'Your first sale in 3 minutes' },
  { date: '21 Oct 2026', title: 'What to buy counts open orders' },
  { date: '15 Oct 2026', title: 'Invite your team by email' },
  { date: '08 Oct 2026', title: 'Stock from Excel or CSV' },
];

/* ── How It Works: the walkthrough's seven stages, in three phases ── */
export const PHASES = [
  { key: 'sell', title: 'Sell', tone: 'amber', steps: [0, 1, 2] },
  { key: 'buy', title: 'Buy and make', tone: 'violet', steps: [3, 4, 5] },
  { key: 'paid', title: 'Get paid', tone: 'green', steps: [6] },
];
/* One per stage of the walkthrough (flow/story.jsx SCENES, same order):
   a line, and what it covers as a few short tags. */
export const STEPS = [
  { title: 'Capture the enquiry', diagram: 'search', line: 'From your catalogue or a phone call.',
    tags: ['Drawings attached', 'Tied to the product', 'No customer record needed'] },
  { title: 'Send the quote', diagram: 'gst', line: 'Your letterhead, HSN and the right GST.',
    tags: ['Logo & bank details', 'PDF that prints right', 'Locks once sent'] },
  { title: 'Confirm the order', diagram: 'qt-co', line: 'The accepted quote becomes the order.',
    tags: ['Lines carried across', 'Stock checked', 'Points back to the quote'] },
  { title: 'Buy the material', diagram: 'compare', line: 'Vendor quotes read and compared.',
    tags: ['Excel · PDF · Word', 'Missed lines flagged', 'Original file kept'] },
  { title: 'Receive the goods', diagram: 'stock', line: 'Stock goes up on the receipt itself.',
    tags: ['Vehicle & batch', 'Short or over, recorded', 'Every movement traced'] },
  { title: 'Make the parts', diagram: 'yield', line: 'Output and scrap give live yield.',
    tags: ['Bill of materials', 'Scrap counted', 'Cost per piece'] },
  { title: 'Invoice and get paid', diagram: 'inv-paid', line: 'GST from the ship-to. Payment tracked.',
    tags: ['CGST + SGST or IGST', 'Numbered in sequence', 'Credit & debit notes'] },
];

/* ── See Maks Ops: the film's eighteen chapters, in five acts ── */
export const FILM_ACTS = [
  { title: 'Set up', tone: 'blue', chapters: ['opening', 'workspace', 'team'] },
  { title: 'Sell', tone: 'amber', chapters: ['catalogue', 'customer', 'enquiry', 'quotation', 'order'] },
  { title: 'Buy', tone: 'violet', chapters: ['requirements', 'vendor-quotes', 'purchase-order', 'receipt'] },
  { title: 'Make and deliver', tone: 'green', chapters: ['production', 'dispatch', 'invoice'] },
  { title: 'Run the business', tone: 'blue', chapters: ['money', 'attention', 'close'] },
];
/* Each chapter of the film as a card: an icon, and what it shows in a line
   (the chapter's full text is in the folded transcript). */
export const CHAPTER_CARDS = {
  opening: { Icon: Clapperboard, line: 'One record, from the catalogue to cash.' },
  workspace: { Icon: Building2, line: 'GSTIN, bank and logo, set once, on every document.' },
  team: { Icon: Users, line: 'Each person sees only what their role allows.' },
  catalogue: { Icon: Store, line: 'Your products on a public page, ready to share.' },
  customer: { Icon: Globe, line: 'The customer searches, picks and sends an enquiry.' },
  enquiry: { Icon: Inbox, line: 'The enquiry becomes a quotation, already filled in.' },
  quotation: { Icon: FileText, line: 'Priced and accepted, with GST by place of supply.' },
  order: { Icon: ClipboardCheck, line: 'The order checks whether stock can build it.' },
  requirements: { Icon: Boxes, line: 'What every open order needs, and from whom.' },
  'vendor-quotes': { Icon: Scale, line: 'Excel, PDF or Word quotes, compared like for like.' },
  'purchase-order': { Icon: ShoppingCart, line: 'Over your limit, it waits for the right person.' },
  receipt: { Icon: PackageCheck, line: 'Stock goes up on the receipt itself.' },
  production: { Icon: Factory, line: 'Output, scrap and the true cost per piece.' },
  dispatch: { Icon: Truck, line: 'A challan from the order, with the e-way bill.' },
  invoice: { Icon: ReceiptText, line: 'From your own series, then marked paid.' },
  money: { Icon: Wallet, line: 'Expenses, schedules, receivables and margin.' },
  attention: { Icon: Bell, line: 'Where work is waiting, and AI to ask.' },
  close: { Icon: Link2, line: 'Every document points back to the one before.' },
};
