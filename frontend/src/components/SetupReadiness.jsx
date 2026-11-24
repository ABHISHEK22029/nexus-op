/* ══════════════════════════════════════════════════════════
   SetupReadiness — why a screen is empty, said out loud.

   The deficiency engine returns nothing on a fresh install, and every
   feature above it therefore does nothing. Not because any of it is broken:
   because its inputs are empty. From the screens that is close to
   undiagnosable — you open Material Requirements, see an empty table, and
   conclude the feature does not work.

   Deliberately NOT a progress percentage. "82% set up" tells nobody what to
   do next. Each row says what is missing, what it costs you, and where to
   go — because "add BOMs" is a chore and "without this an order produces no
   material demand at all" is a reason.

   It disappears entirely once everything is in place. A permanent setup
   banner is one people stop seeing.

   Laid out as a checklist on the page's own surface, not an orange alert:
   it sits above everything on the Home screen, and a block of amber there
   made the whole page read as an error. Each row lines up the same way —
   the mark, what it is and how far along, why it matters, and a button
   that says what it does.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, CheckCircle2, CircleAlert, ListChecks, ArrowRight } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Where each check's fix actually lives, and what the button says — a
   row is a way through, not an instruction to go and find something. */
const FIX = {
  company: { to: '/company-profile', label: 'Open company profile' },
  name: { to: '/company-profile', label: 'Add your business name' },
  /* Straight to the rows that need it, each with a Link button. */
  stock_links: { to: '/inventory?unlinked=1', label: 'Link stock' },
  boms: { to: '/items', label: 'Add bills of materials' },
  vendor_links: { to: '/vendors?tab=supplies', label: 'Link vendors' },
  open_orders: { to: '/customer-orders', label: 'Go to orders' },
  parties: { to: '/customers', label: 'Add customers' },
};
/* Customers on file but no vendors: the button goes to vendors. */
const fixFor = (c) => (c.key === 'parties' && c.missing === 'vendors'
  ? { to: '/vendors', label: 'Add a vendor' } : FIX[c.key]);

export default function SetupReadiness({ compact = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    const token = getToken();
    fetch(`${API}/setup/readiness`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.ready) return null;   // nothing to say once it's set up

  const blocking = data.checks.filter(c => !c.ok);
  const done = data.checks.filter(c => c.ok);

  return (
    <section className="setup-ready" aria-label="Setting up">
      <button type="button" className="setup-ready-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="setup-ready-mark" aria-hidden="true"><ListChecks size={16} /></span>
        <span className="setup-ready-title">{data.headline}</span>
        <span className="setup-ready-count">{done.length} of {data.checks.length} done</span>
        <span className="setup-ready-chev" aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {open && (
        <div className="setup-ready-body">
          {blocking.map(c => {
            const fix = fixFor(c);
            return (
              <div key={c.key} className="setup-row" data-setup-row={c.key}>
                <CircleAlert size={16} className="setup-row-mark" aria-hidden="true" />
                <div className="setup-row-text">
                  <div className="setup-row-title">
                    {c.label}
                    {c.have && <span className="setup-row-have">{c.have}</span>}
                  </div>
                  {/* The cost, not the chore — this is what makes it worth doing. */}
                  <div className="setup-row-cost">{c.cost}</div>
                </div>
                {fix && (
                  <Link to={fix.to} className="setup-row-fix">
                    {fix.label} <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                )}
              </div>
            );
          })}

          {done.length > 0 && (
            <div className="setup-ready-done">
              <CheckCircle2 size={14} aria-hidden="true" />
              <span><b>Done:</b> {done.map(c => c.label.toLowerCase()).join(' · ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
