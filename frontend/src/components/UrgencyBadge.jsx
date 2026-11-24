/* ══════════════════════════════════════════════════════════
   UrgencyBadge — how late, kept apart from what state it is in.

   A row's status says where it is in the work (Open, Sent, Part paid). How
   late it is is a different question, and folding the two into one pill
   hid the second one. From the agent portal: a small badge beside the
   number, only the most pressing signal, in a colour ladder of its own —
   amber when it is close, red when it has passed. Nothing at all when the
   date is comfortably ahead, or the thing is done.
   ══════════════════════════════════════════════════════════ */
import React from 'react';

const DAY = 86400000;
/* Whole days from today (India) to a date: 0 today, negative when past. */
function daysUntil(d) {
  if (!d) return null;
  const day = String(d).slice(0, 10);
  const target = new Date(`${day}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / DAY);
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A customer order's ship-by date, unless it has gone. */
export function orderUrgency(o) {
  if (!o || ['Delivered', 'Closed'].includes(o.status)) return null;
  const d = daysUntil(o.expected_shipment_date);
  if (d == null) return null;
  if (d < 0) return { tone: 'late', text: `Ship date passed · ${plural(-d, 'day')}`, title: 'Past the date this order was to ship by' };
  if (d === 0) return { tone: 'soon', text: 'Ships today', title: 'This order is due to ship today' };
  if (d <= 3) return { tone: 'soon', text: `Ships in ${plural(d, 'day')}`, title: 'Due to ship within three days' };
  return null;
}

/** An invoice's due date, while money is still owed on it. Drafts count, as
    on the dashboard: most invoices that went out are still drafts. */
export function invoiceUrgency(inv) {
  if (!inv || ['Paid', 'Cancelled'].includes(inv.status)) return null;
  const owed = (Number(inv.net_amount) || 0) - (Number(inv.amount_paid) || 0) - (Number(inv.credited) || 0);
  if (owed <= 0.5) return null;
  const d = daysUntil(inv.due_date);
  if (d == null) return null;
  if (d < 0) return { tone: 'late', text: `Overdue · ${plural(-d, 'day')}`, title: 'Past its due date with money still owed' };
  if (d === 0) return { tone: 'soon', text: 'Due today', title: 'Payment is due today' };
  if (d <= 3) return { tone: 'soon', text: `Due in ${plural(d, 'day')}`, title: 'Payment is due within three days' };
  return null;
}

export default function UrgencyBadge({ u }) {
  if (!u) return null;
  return <span className={`urgency urgency-${u.tone}`} title={u.title} data-urgency={u.tone}>{u.text}</span>;
}
