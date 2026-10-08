/* ══════════════════════════════════════════════════════════
   RecurringController — recurring transactions + reminder engine
   • recurring_profiles: schedules that auto-create an expense or a
     sales invoice on a cadence (daily / weekly / monthly / quarterly /
     yearly).
   • The scheduler pass (runPass) generates everything due today and
     fires overdue-invoice reminders. It runs on an in-process interval
     and can be triggered on demand from the Automation page ("Run now").
   Nothing is hardcoded — amounts, categories, GST, terms all come from
   what the user entered on the profile.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { allocate } = require('../shared/docSeries');
const { assertOwned } = require('../shared/ownerScope');
const { isCrossTenant, can } = require('../shared/roles');
const { notify } = require('../notify');
const { amountInWords } = require('../shared/amountInWords');
const { resolveTax } = require('./SalesInvoiceController');

/* "Today" is India's today. CURRENT_DATE is the database's day, which is
   UTC: from midnight to 05:30 IST, today's schedules were not yet due and
   an invoice that fell due yesterday was not yet overdue. */
const TODAY = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);
const ownerOf = (req) => req.user?.orgId ?? req.user?.id ?? null;
/* how many missed occurrences one pass will catch up, per schedule */
const CATCH_UP_MAX = 62;
const DOC_TYPES = ['expense', 'sales_invoice'];
const FREQ = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
/* A schedule raises its document unattended, so setting one up needs the
   right to raise that document. Otherwise a role that may not raise
   invoices could schedule one for today and press Run now. */
const DOC_RESOURCE = { expense: 'expenses', sales_invoice: 'sales-invoices' };
const mayRaise = (req, docType) => can(req.user?.role, DOC_RESOURCE[docType], 'write', req.user?.orgId);
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 });
const fmtDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/* ── When the next one falls ───────────────────────────────
   Days and weeks are plain day counts. Months, quarters and years count
   from the schedule's own day of the month (its anchor), clamped to the
   last day of a shorter month: a schedule on the 31st runs 31 Jan,
   28 Feb, 31 Mar, 30 Apr. Adding a month to the previous date — what
   `next_run + interval '1 month'` did — left it on the 28th for good
   after February. A 29 Feb yearly schedule falls on 28 Feb in ordinary
   years and 29 Feb in leap years. Dates stay 'YYYY-MM-DD' strings,
   worked in UTC, so no timezone can move a day. */
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const pad2 = (n) => String(n).padStart(2, '0');
function nextOccurrence(iso, frequency, anchorDay) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (frequency === 'daily' || frequency === 'weekly') {
    return new Date(Date.UTC(y, m - 1, d + (frequency === 'weekly' ? 7 : 1))).toISOString().slice(0, 10);
  }
  const first = new Date(Date.UTC(y, m - 1 + (MONTHS[frequency] || 1), 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(Math.min(anchorDay || d, last))}`;
}
exports.nextOccurrence = nextOccurrence;
/* The anchor is kept in the payload, because next_run is overwritten as
   the schedule advances. One saved before this has none and keeps the
   day of its current next run. */
/* A schedule started on a month's last day stays on the month end — 30 Apr,
   31 May, 30 Jun — instead of settling on the 30th. Stored as 31, which the
   clamp in nextOccurrence turns into each month's last day. */
const dayOf = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return d === new Date(Date.UTC(y, m, 0)).getUTCDate() ? 31 : d;
};
const anchorOf = (p) => Number(p.payload?.anchorDay) || dayOf(p.next_run);
exports.dayOf = dayOf;

/* A real calendar day as 'YYYY-MM-DD'. 30 Feb or "next tuesday" reached
   Postgres and came back as a 500. */
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '2000-01-01' && s <= '2099-12-31';
}

/* What was sent, checked: everything on create, whatever is present on an
   edit (which used to save an amount of 0, a blank title or an unknown
   frequency straight through). Returns a message, or null. */
async function problem(owner, b, docType, partial) {
  const has = (k) => b[k] !== undefined;
  if (!partial || has('title')) {
    if (typeof b.title !== 'string' || !b.title.trim()) return 'Give the schedule a title / description';
    if (b.title.trim().length > 200) return 'Keep the title under 200 characters';
  }
  if (!partial || has('amount')) {
    const a = typeof b.amount === 'number' || (typeof b.amount === 'string' && b.amount.trim()) ? Number(b.amount) : NaN;
    if (!(a > 0)) return 'Enter an amount greater than 0';
    if (a >= 1e15) return 'That amount is too large';
  }
  if (!FREQ.includes(partial ? (b.frequency ?? 'monthly') : (b.frequency || 'monthly'))) return `frequency must be one of ${FREQ.join(', ')}`;
  if (!partial || has('nextRun')) {
    if (!b.nextRun) return 'Pick the first run date';
    if (!validDate(b.nextRun)) return 'That first run date is not a real date';
  }
  if (has('active') && typeof b.active !== 'boolean') return 'active must be true or false';
  if (docType === 'sales_invoice' && (!partial || has('customerId')) && !b.customerId) return 'Pick a customer to bill';
  /* Your own customer only. Anyone's could be named here, and the run then
     raised this company's invoice to another company's customer. */
  if (b.customerId != null && b.customerId !== '') {
    if (!Number.isInteger(Number(b.customerId))) return 'Pick a customer to bill';
    const own = await db.query('SELECT 1 FROM customers WHERE id = $1 AND owner_id = $2', [Number(b.customerId), owner]);
    if (!own.rowCount) return 'Pick one of your own customers';
  }
  if (has('payload') && b.payload !== null) {
    const pl = b.payload;
    if (typeof pl !== 'object' || Array.isArray(pl)) return 'payload must be an object';
    const set = (v) => v != null && v !== '';
    if (set(pl.gstRate) && !(Number(pl.gstRate) >= 0 && Number(pl.gstRate) <= 100)) return 'The GST rate must be between 0 and 100';
    if (set(pl.termsDays) && !(Number.isInteger(Number(pl.termsDays)) && Number(pl.termsDays) >= 0 && Number(pl.termsDays) <= 365)) {
      return 'Payment terms must be a whole number of days, 0 to 365';
    }
  }
  return null;
}
const denied = (res, docType) => res.status(403).json({
  error: 'Not permitted',
  detail: `Your role cannot raise ${docType === 'expense' ? 'expenses' : 'sales invoices'}, so it cannot schedule them either.`,
});

/* ── CRUD (owner-scoped) ───────────────────────────────── */
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT rp.*, c.name AS customer_name,
              (SELECT COUNT(*)::int FROM recurring_runs rr WHERE rr.profile_id = rp.id) AS generated_count
         FROM recurring_profiles rp
         LEFT JOIN customers c ON c.id = rp.customer_id
        ${admin ? '' : 'WHERE rp.owner_id = $1'}
        ORDER BY rp.active DESC, rp.next_run ASC`,
      admin ? [] : [ownerOf(req)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  const b = req.body || {};
  const { docType, title, customerId, amount, frequency, nextRun, notes, payload } = b;
  if (!DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'docType must be expense or sales_invoice' });
  if (!mayRaise(req, docType)) return denied(res, docType);
  try {
    const bad = await problem(ownerOf(req), b, docType, false);
    if (bad) return res.status(400).json({ error: bad });
    const pl = { ...(payload || {}), anchorDay: dayOf(nextRun) };
    const { rows } = await db.query(
      `INSERT INTO recurring_profiles (owner_id, doc_type, title, customer_id, amount, frequency, next_run, notes, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ownerOf(req), docType, title.trim(), docType === 'sales_invoice' ? Number(customerId) : null, r2(amount), frequency || 'monthly',
       nextRun, notes || null, JSON.stringify(pl)]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  const b = req.body || {};
  const map = { title: 'title', amount: 'amount', frequency: 'frequency', nextRun: 'next_run', active: 'active', customerId: 'customer_id', notes: 'notes', payload: 'payload' };
  if (!Object.keys(map).some((k) => b[k] !== undefined)) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const p = await assertOwned(db, req, res, 'recurring_profiles', req.params.id, { columns: 'id, owner_id, doc_type, payload' });
    if (!p) return;
    // Pausing or resuming only stops or restarts what was already allowed.
    if (Object.keys(map).some((k) => k !== 'active' && b[k] !== undefined) && !mayRaise(req, p.doc_type)) return denied(res, p.doc_type);
    const bad = await problem(p.owner_id, b, p.doc_type, true);
    if (bad) return res.status(400).json({ error: bad });
    const vals = {
      title: b.title?.trim(), amount: b.amount !== undefined ? r2(b.amount) : undefined, frequency: b.frequency,
      next_run: b.nextRun, active: b.active, customer_id: b.customerId === undefined ? undefined : (b.customerId ? Number(b.customerId) : null),
      notes: b.notes,
    };
    /* A new first date moves the anchor; a new payload keeps it. */
    if (b.payload !== undefined || b.nextRun !== undefined) {
      const pl = { ...(b.payload !== undefined ? b.payload || {} : p.payload || {}) };
      const anchor = b.nextRun !== undefined ? dayOf(b.nextRun) : p.payload?.anchorDay;
      if (anchor) pl.anchorDay = anchor; else delete pl.anchorDay;
      vals.payload = JSON.stringify(pl);
    }
    const cols = Object.keys(vals).filter((c) => vals[c] !== undefined);
    const r = await db.query(
      `UPDATE recurring_profiles SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map((c) => vals[c]), p.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'recurring_profiles', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM recurring_profiles WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── Generators ────────────────────────────────────────── */
async function generateExpense(client, p) {
  const pl = p.payload || {};
  const { rows } = await client.query(
    `INSERT INTO expenses (owner_id, category, description, amount, expense_date, paid_to, payment_mode, notes)
     VALUES ($1,$2,$3,$4,$8::date,$5,$6,$7) RETURNING id`,
    [p.owner_id, pl.category || 'Recurring', p.title, p.amount, pl.paidTo || null, pl.paymentMode || null,
     `Auto-generated from recurring schedule #${p.id}`, p.next_run]
  );
  return { type: 'expense', id: rows[0].id, ref: `Expense ₹${inr(p.amount)}` };
}

/* What a recurring invoice bills for: "May 2026", or the day for a weekly or
   daily one. Shown on an invoice issued after its due day, so three missed
   months raised together still say which month each one is for. */
function periodOf(iso, frequency) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (frequency === 'monthly') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (frequency === 'quarterly') return `the quarter from ${day}`;
  if (frequency === 'yearly') return `the year from ${day}`;
  return day;
}

async function generateInvoice(client, p) {
  const pl = p.payload || {};
  /* A missed invoice is issued TODAY, not on the day it was due. Dated in
     the past it took a number after invoices dated later — 30 May numbered
     after 8 Oct — and could land in a financial year already filed. GST
     wants serial numbers in date order, so the date is today, the number
     follows on, and the line says which period it bills. Expenses are
     records of a cost, not tax invoices, and keep their own dates. */
  const issued = todayIST();
  const late = String(p.next_run).slice(0, 10) < issued;
  const period = periodOf(p.next_run, p.frequency);
  /* The same tax rule as an invoice raised by hand (resolveTax): CGST+SGST
     or IGST by the place of supply — the customer's shipping state, then
     billing state, then GSTIN. This compared GSTINs alone, so a customer
     with no GSTIN in another state, or one shipped to another state, was
     charged CGST+SGST. No request here — the organisation comes from the
     profile itself. */
  const tax = await resolveTax(client, p.owner_id, p.customer_id);
  const c = tax.customer;
  /* A schedule saved before the create check could name another company's
     customer. Refuse rather than bill them on this company's invoice. */
  if (!c || String(c.owner_id) !== String(p.owner_id)) throw new Error('its customer is not one of this company\'s — pick the customer again');
  const gstRate = pl.gstRate != null && pl.gstRate !== '' ? Number(pl.gstRate) : 18;
  const termsDays = pl.termsDays != null && pl.termsDays !== ''
    ? Number(pl.termsDays) : (c.payment_terms_days ?? tax.company?.default_payment_terms_days ?? 30);
  const interstate = tax.interstate;
  const subTotal = r2(p.amount);
  const gstTotal = r2(subTotal * gstRate / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(subTotal + gstTotal);
  /* The scheduler runs unattended, so a collision here is the one nobody
     would be watching for: a recurring invoice generated at the same moment
     somebody raised one by hand would have taken the same number. The owner
     comes from the recurring profile, since there is no request behind this.
     Numbered on its issue date, so the series stays in date order. */
  const invNumber = await allocate(client, { ownerId: p.owner_id, docType: 'sales_invoice', date: new Date(`${issued}T00:00:00`) });
  const { rows } = await client.query(
    `INSERT INTO sales_invoices (owner_id, customer_id, invoice_number, invoice_date, due_date,
       sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes, status,
       place_of_supply, place_of_supply_code, terms,
       bill_to_name, bill_to_address, bill_to_gstin, bill_to_state,
       ship_to_name, ship_to_address, ship_to_gstin, ship_to_state)
     VALUES ($1,$2,$3,$15::date,($15::date + ($4 || ' days')::interval)::date,
       $5,0,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,'Draft',
       $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING id`,
    [p.owner_id, p.customer_id, invNumber, String(termsDays),
     subTotal, gstRate, interstate, cgst, sgst, igst, gstTotal, net, amountInWords(net),
     late ? `Auto-generated from recurring schedule #${p.id} — for ${period}, raised late by catch-up`
       : `Auto-generated from recurring schedule #${p.id}`, issued,
     tax.placeOfSupply || null, tax.placeOfSupplyCode || null, tax.company?.invoice_terms || null,
     c.name || null, c.billing_address || null, c.gstin || null, c.state || null,
     c.name || null, c.shipping_address || c.billing_address || null, c.gstin || null, c.shipping_state || c.state || null]
  );
  const invId = rows[0].id;
  await client.query(
    `INSERT INTO sales_invoice_items (sales_invoice_id, description, hsn, uom, quantity, rate, amount, sort_order)
     VALUES ($1,$2,$3,'nos',1,$4,$5,0)`,
    [invId, late ? `${p.title} — ${period}` : p.title, pl.hsn || null, subTotal, subTotal]
  );
  return { type: 'sales_invoice', id: invId, ref: invNumber, issued, period: late ? period : null };
}

/* One notification per schedule per pass. A catch-up of a month of daily
   expenses posted thirty, and pushed everything else out of the bell. */
async function tell(p, made) {
  const kind = p.doc_type === 'expense' ? 'expense' : 'invoice';
  const last = made[made.length - 1];
  const one = made.length === 1;
  await notify({ org: p.owner_id }, {
    type: 'RECURRING_GENERATED',
    title: one ? `Recurring ${kind} created` : `${made.length} recurring ${kind}s created`,
    message: one ? `${last.ref} from schedule “${p.title}”`
      : `${made.length} ${kind}s from schedule “${p.title}”, dated ${fmtDay(made[0].date)} to ${fmtDay(last.date)}`,
    entityType: last.type, entityId: last.id,
    link: last.type === 'sales_invoice' ? (one ? `/sales-invoices/${last.id}` : '/sales-invoices') : '/expenses',
  });
}

/* ── The scheduler pass ────────────────────────────────── */
// ownerId: limit to one owner (self-service "run now"); null = everyone (interval).
async function runPass(ownerId = null) {
  const summary = { generated: 0, invoices: 0, expenses: 0, reminders: 0, items: [], failed: [], behind: [] };
  /* A schedule that fell behind (the server asleep, a first run in the
     past) used to catch up ONE occurrence per pass, so every press of "Run
     now" made one more expense, which looked like it was inventing them.
     Each pass now catches a schedule all the way up: one document per missed
     occurrence, each dated on the day it was due. */

  // 1) Generate everything due today.
  const due = (await db.query(
    `SELECT * FROM recurring_profiles
      WHERE active = TRUE AND next_run <= ${TODAY}
      ${ownerId ? 'AND owner_id = $1' : ''}`,
    ownerId ? [ownerId] : []
  )).rows;

  for (const first of due) {
   let p = first, n = 0;
   const made = [];
   for (; n < CATCH_UP_MAX && p; n++) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      /* Claim this schedule before generating from it. The list above is
         read without a lock, so two passes at once — two server instances,
         or "Run now" pressed during the hourly pass — both saw it due and
         both generated: the same invoice twice. SKIP LOCKED lets the other
         pass move on; the next_run test catches one that already ran. */
      const claim = await client.query(
        `SELECT * FROM recurring_profiles
          WHERE id = $1 AND active = TRUE AND next_run <= ${TODAY}
          FOR UPDATE SKIP LOCKED`, [p.id]);
      if (!claim.rowCount) { await client.query('ROLLBACK'); p = null; continue; }
      p = claim.rows[0];                       // this occurrence, with its own due date
      const g = p.doc_type === 'expense' ? await generateExpense(client, p) : await generateInvoice(client, p);
      await client.query(
        `INSERT INTO recurring_runs (profile_id, result_type, result_id, result_ref) VALUES ($1,$2,$3,$4)`,
        [p.id, g.type, g.id, g.ref]
      );
      await client.query(
        `UPDATE recurring_profiles
            SET last_run = ${TODAY},
                runs_count = runs_count + 1,
                next_run = $2::date
          WHERE id = $1`,
        [p.id, nextOccurrence(p.next_run, p.frequency, anchorOf(p))]
      );
      await client.query('COMMIT');
      made.push({ ...g, date: p.next_run });
      summary.generated++;
      if (g.type === 'sales_invoice') summary.invoices++; else summary.expenses++;
      summary.items.push({ profile: p.title, created: g.ref, type: g.type, id: g.id, date: p.next_run });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[scheduler] profile ${p.id} failed:`, e.message);
      /* Said in the answer. Swallowed, "Run now" reported "Nothing was due
         today" for a schedule that was due and had failed. */
      summary.failed.push({ profile: first.title, error: e.message });
      p = null;
    } finally { client.release(); }
   }
   if (made.length) await tell(first, made);
   /* Stopped by the cap rather than caught up: say so, or the next press
      quietly makes 62 more and looks like a fault. */
   if (p && n >= CATCH_UP_MAX) {
     const left = (await db.query(`SELECT next_run FROM recurring_profiles WHERE id = $1 AND active = TRUE AND next_run <= ${TODAY}`, [first.id])).rows[0];
     if (left) summary.behind.push({ profile: first.title, next_run: left.next_run });
   }
  }

  // 2) Overdue-invoice reminders: once, when an invoice first goes overdue,
  //    for companies that have not switched reminders off.
  /* Marked and read in one statement. Read first and marked after, two
     passes at once (the hourly one and "Run now", or two presses) both saw
     the invoice as not yet reminded and both sent: the same reminder twice.
     The second UPDATE waits on the row, re-checks reminder_stage, finds 1
     and skips it. */
  const overdue = (await db.query(
    `WITH hit AS (
       UPDATE sales_invoices si SET reminder_stage = 1
        WHERE si.due_date IS NOT NULL
          AND si.due_date < ${TODAY}
          AND si.status <> 'Paid'
          AND si.net_amount > COALESCE(si.amount_paid, 0)
          AND si.reminder_stage = 0
          AND COALESCE((SELECT a.reminders_enabled FROM automation_settings a WHERE a.owner_id = si.owner_id), TRUE)
          ${ownerId ? 'AND si.owner_id = $1' : ''}
       RETURNING si.id, si.owner_id, si.invoice_number, si.customer_id, si.net_amount, si.amount_paid,
                 (${TODAY} - si.due_date) AS days_over)
     SELECT hit.*, c.name AS customer_name FROM hit LEFT JOIN customers c ON c.id = hit.customer_id`,
    ownerId ? [ownerId] : []
  )).rows;

  for (const inv of overdue) {
    const daysOver = Math.max(1, Number(inv.days_over) || 1);
    const outstanding = r2((inv.net_amount || 0) - (inv.amount_paid || 0));
    await notify({ org: inv.owner_id }, {
      type: 'INVOICE_OVERDUE',
      title: `Invoice overdue · ${inv.invoice_number}`,
      message: `${inv.customer_name || 'Customer'} — ₹${outstanding.toLocaleString('en-IN')} outstanding, ${daysOver} day(s) past due`,
      entityType: 'sales_invoice', entityId: inv.id, link: `/sales-invoices/${inv.id}`,
    });
    summary.reminders++;
  }

  return summary;
}
exports.runPass = runPass;

// POST /recurring/run-now
/* Always this company's own schedules. It used to run EVERY company's for
   a platform admin, and for a team member who was not the owner it passed
   their user id, which owns no schedules, so it did nothing. */
exports.runNow = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const summary = await runPass(owner);
    /* The next one still to come. One still behind (the cap) is in
       `behind`, and one that failed in `failed`. */
    const next = (await db.query(
      `SELECT title, next_run FROM recurring_profiles
        WHERE owner_id = $1 AND active = TRUE AND next_run > ${TODAY} ORDER BY next_run ASC LIMIT 1`,
      [owner])).rows[0] || null;
    res.json({ success: true, ...summary, next });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /recurring/:id/runs — history for one schedule
/* Yours only: this read the history of any schedule by id. Each run comes
   with its document's own date (a catch-up makes several in one run, each
   dated the day it was due) and whether that document is still there, so
   a deleted one is not shown as a link to nothing. */
exports.runs = async (req, res) => {
  try {
    const p = await assertOwned(db, req, res, 'recurring_profiles', req.params.id, { columns: 'id, owner_id' });
    if (!p) return;
    const { rows } = await db.query(
      `SELECT rr.*, COALESCE(e.expense_date, si.invoice_date)::text AS doc_date,
              (e.id IS NOT NULL OR si.id IS NOT NULL) AS doc_exists
         FROM recurring_runs rr
         LEFT JOIN expenses e ON rr.result_type = 'expense' AND e.id = rr.result_id AND e.owner_id = $2
         LEFT JOIN sales_invoices si ON rr.result_type = 'sales_invoice' AND si.id = rr.result_id AND si.owner_id = $2
        WHERE rr.profile_id = $1
        ORDER BY rr.id DESC LIMIT 50`, [p.id, p.owner_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── In-process scheduler ──────────────────────────────── */
let running = false;
exports.startScheduler = () => {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const s = await runPass(null);
      if (s.generated || s.reminders || s.failed.length)
        console.log(`[scheduler] generated ${s.generated} doc(s), ${s.reminders} reminder(s), ${s.failed.length} failed`);
    } catch (e) { console.error('[scheduler] pass error:', e.message); }
    finally { running = false; }
  };
  // First pass shortly after boot, then hourly.
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000);
  console.log('[scheduler] recurring + reminder engine started');
};
