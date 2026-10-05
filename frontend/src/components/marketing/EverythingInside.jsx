import React, { useState } from 'react';
import {
  LayoutDashboard, Megaphone, ShoppingBag, ShoppingCart, Package,
  Factory, Wallet, Settings, SlidersHorizontal, AlertTriangle, Check,
} from 'lucide-react';
import useInView from '../../hooks/useInView';

/* ══════════════════════════════════════════════════════════════════════
   EverythingInside — the actual contents of the product.

   The marketing pages described about twelve things. The application has
   nine modules and roughly forty screens. Entire capabilities were absent
   from the sales material: stock with reorder levels and requirements
   planning, delivery challans with e-way bill tracking, credit and debit
   notes, payables ageing, expenses, reports, milestones, work orders,
   recurring automation, roles and permissions, data import, the activity
   log. A buyer comparing this against a competitor's feature list was
   reading a third of what they would actually get.

   This is taken from lib/navigation.js — the same definition the product's
   own menu is built from — so it is what ships, not what someone remembered
   to write down. If a module is added to the app and not added here, the
   test that counts them fails.

   Two things are deliberately NOT dressed up:
     · The contracting-only screens (BOQ, measurement book, RA bills,
       indents) are marked as such. They are real, and they are irrelevant
       to a fabricator; pretending otherwise inflates the list and wastes
       the reader's attention.
     · Nothing here claims an integration or a capability that does not
       exist. The list is long enough without help.
   ══════════════════════════════════════════════════════════════════════ */

const MODULES = [
  {
    key: 'marketing', label: 'Marketing', icon: <Megaphone size={17} />, tone: '#FF7A00',
    line: 'Where strangers find you, and ask.',
    items: [
      ['Catalogue', 'Your products with photographs, specs, HSN and categories — on a public page with its own link. No login to browse it.'],
      ['Enquiries', 'Questions arrive attached to the product they came from, flagged until somebody reads them.'],
    ],
  },
  {
    key: 'sales', label: 'Sales', icon: <ShoppingBag size={17} />, tone: '#22C55E',
    line: 'Win it, ship it, bill it.',
    items: [
      ['Customers', 'GSTIN, contacts, billing and shipping addresses, reused on every document.'],
      ['Quotations', 'Priced on your letterhead, editable in place, locked once sent.'],
      ['Orders', 'Converted from a quotation with its lines intact.'],
      ['Delivery challans', 'With e-way bill numbers — and a warning on any challan still missing one.'],
      ['Invoices', 'CGST/SGST or IGST by place of supply, numbered sequentially per Rule 46(b).'],
      ['Credit & debit notes', 'The lawful way to correct an issued invoice — flagged if one is not tied back to its invoice.'],
    ],
  },
  {
    key: 'purchases', label: 'Purchases', icon: <ShoppingCart size={17} />, tone: '#3B82F6',
    line: 'Source it, buy it, receive it, pay for it.',
    items: [
      ['Vendors', 'Directory of who supplies what.'],
      ['Quotation files', 'Upload the Excel, PDF or Word a vendor emailed; the line items are read out of it.'],
      ['Vendor quotes', 'Compare like-for-like, with a nudge while a part is still short of three quotes.'],
      ['Purchase orders', 'Pending → Approved → Dispatched → Delivered, with approvals flagged while they wait.'],
      ['Goods received', 'Receipt against the PO with vehicle and batch; stock moves on the receipt.'],
      ['Payables', 'What you owe each supplier, and how overdue it is.'],
      ['Indents', 'Site-raised material requests against a BOQ line.', 'contracting'],
    ],
  },
  {
    key: 'stock', label: 'Stock', icon: <Package size={17} />, tone: '#A78BFA',
    line: 'What you hold, what it is, what you are about to run out of.',
    items: [
      ['Stock on hand', 'Balances and every movement, with reorder levels so the list tells you what to buy.'],
      ['Items', 'One master for finished products and raw materials, with units and HSN.'],
      ['Requirements', 'What open orders will consume against what you actually hold.'],
    ],
  },
  {
    key: 'production', label: 'Production', icon: <Factory size={17} />, tone: '#EC4899',
    line: 'Make it, and know what it cost.',
    items: [
      ['Production orders', 'Consume to a bill of materials, record output and scrap, read live yield and cost per piece.'],
      ['Work orders', 'The jobs on the floor and who is on them.'],
      ['Projects', 'Group the work, with everything downstream scoped to it.'],
      ['Milestones', 'Dates that matter, with anything behind plan called out.'],
      ['Bill of quantities', 'Itemised quantities and agreed rates.', 'contracting'],
      ['Measurement book', 'Site measurements that drive running-account bills.', 'contracting'],
    ],
  },
  {
    key: 'money', label: 'Money', icon: <Wallet size={17} />, tone: '#EF4444',
    line: 'What came in, what went out, what it means.',
    items: [
      ['Expenses', 'Costs that are not purchase orders, against the job that caused them.'],
      ['Reports', 'The numbers behind all of the above.'],
      ['RA bills', 'Running-account bills with GST, TDS and retention.', 'contracting'],
    ],
  },
  {
    key: 'settings', label: 'Setup & people', icon: <Settings size={17} />, tone: '#0EA5E9',
    line: 'Your details, your team, your rules.',
    items: [
      ['Company profile', 'Logo, address, GSTIN and bank details — printed on every document from one place.'],
      ['Automation', 'Recurring bills and expenses generated on a schedule, with overdue reminders.'],
      ['Team', 'Who has a login.'],
      ['Roles & permissions', 'What each role may open and change, per resource.'],
      ['Change history', 'Who widened someone’s access, and when.'],
      ['Import data', 'Bring existing customers, vendors and items in rather than retyping them.'],
      ['Modules', 'Switch off the parts of the product this business does not use, so the menu is not full of someone else’s job.'],
    ],
  },
  {
    key: 'home', label: 'Knowing', icon: <LayoutDashboard size={17} />, tone: '#6366F1',
    line: 'What is happening, and how to do things.',
    items: [
      ['Dashboard', 'The state of the business on one screen.'],
      ['Ask AI', 'A read-only assistant that answers from your own records and explains any feature. It never changes anything.'],
      ['Knowledge base', 'Searchable guides for the whole platform.'],
      ['Activity', 'Who did what, in plain English.'],
      ['Process flow', 'The chain from vendor to bill, drawn.'],
    ],
  },
];

/* The nav badges. These are the product watching for you, and not one of
   them appeared anywhere in the marketing. Taken from the same navigation
   definition — each is a real endpoint and field. */
const WATCHES = [
  ['Quotations that have expired', 'warn'],
  ['Orders still open', 'info'],
  ['Delivery challans with no e-way bill', 'danger'],
  ['Credit notes not tied to an invoice', 'danger'],
  ['Purchase orders awaiting approval', 'warn'],
  ['Parts still short of three quotes', 'info'],
  ['Production orders with nothing produced', 'warn'],
  ['Milestones behind plan', 'danger'],
  ['Enquiries nobody has read', 'info'],
];

const TONES = {
  danger: 'var(--accent-red)',
  warn: 'var(--brand-amber)',
  info: 'var(--accent-blue)',
};

const ModuleCard = ({ m, i }) => {
  const [ref, seen] = useInView(0.12, { once: true });
  return (
    <div
      ref={ref}
      className={seen ? 'mk-rise' : undefined}
      style={{
        animationDelay: `${Math.min(i, 6) * 60}ms`,
        opacity: seen ? undefined : 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        padding: '18px 18px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center',
          color: m.tone, background: `${m.tone}16`, border: `1px solid ${m.tone}38`,
        }}>{m.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>{m.label}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{m.line}</div>
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 9 }}>
        {m.items.map(([name, desc, only]) => (
          <li key={name} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 9 }}>
            <Check size={13} style={{ color: m.tone, marginTop: 3 }} />
            <div>
              <span style={{
                fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)',
              }}>{name}</span>
              {/* Marked, not hidden. These screens are real but belong to
                  contracting; a fabricator should be able to skip them
                  rather than wonder whether they are being sold padding. */}
              {only === 'contracting' && (
                <span style={{
                  marginLeft: 7, fontSize: '0.58rem', fontWeight: 800, letterSpacing: '.04em',
                  color: 'var(--text-muted)', border: '1px solid var(--border-default)',
                  borderRadius: 999, padding: '1px 6px', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>contracting</span>
              )}
              <div style={{
                fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 2,
              }}>{desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const EverythingInside = () => {
  const [ref, seen] = useInView(0.05, { once: true });
  const total = MODULES.reduce((n, m) => n + m.items.length, 0);

  return (
    <div ref={ref}>
      <div style={{ textAlign: 'center', marginBottom: 34 }}>
        <p style={{
          margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem',
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>{total} screens</strong> across{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{MODULES.length} modules</strong>.
          Switch off the ones your business does not use.
        </p>
      </div>

      <div className="mk-inside-grid">
        {MODULES.map((m, i) => <ModuleCard key={m.key} m={m} i={i} />)}
      </div>

      {/* ── what it watches ── */}
      <div
        className={seen ? 'mk-rise' : undefined}
        style={{
          opacity: seen ? undefined : 0,
          marginTop: 24, padding: '22px 24px', borderRadius: 18,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <AlertTriangle size={17} style={{ color: 'var(--brand-amber)' }} />
          <h3 style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem',
            fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>
            And it watches these for you
          </h3>
        </div>
        <p style={{
          margin: '0 0 16px', color: 'var(--text-secondary)',
          fontSize: '0.86rem', lineHeight: 1.7, maxWidth: 680,
        }}>
          Not a report you remember to run — a count on the menu itself, so the thing
          that needs attention is visible before you go looking for it.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {WATCHES.map(([text, tone]) => (
            <span key={text} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 11px', borderRadius: 999,
              border: `1px solid ${TONES[tone]}44`,
              background: `${TONES[tone]}0f`,
              fontSize: '0.76rem', color: 'var(--text-secondary)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: TONES[tone], flexShrink: 0,
              }} />
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EverythingInside;
export { MODULES as INSIDE_MODULES, WATCHES as INSIDE_WATCHES };
