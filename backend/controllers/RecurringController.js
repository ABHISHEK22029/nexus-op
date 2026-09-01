/* ══════════════════════════════════════════════════════════
   RecurringController — recurring transactions + reminder engine
   • recurring_profiles: schedules that auto-create an expense or a
     sales invoice on a cadence (daily / weekly / monthly).
   • The scheduler pass (runPass) generates everything due today and
     fires overdue-invoice reminders. It runs on an in-process interval
     and can be triggered on demand from the Automation page ("Run now").
   Nothing is hardcoded — amounts, categories, GST, terms all come from
   what the user entered on the profile.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { notify } = require('../notify');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);
const DOC_TYPES = ['expense', 'sales_invoice'];
const FREQ = ['daily', 'weekly', 'monthly'];

function amountInWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Rupees Zero Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = (n) => (Math.floor(n / 100) ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let out = '', crore = Math.floor(num / 10000000); num %= 10000000;
  let lakh = Math.floor(num / 100000); num %= 100000;
  let thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (num) out += three(num);
  return 'Rupees ' + out.trim().replace(/\s+/g, ' ') + ' Only';
}

const intervalSql = (freq) =>
  freq === 'daily' ? "interval '1 day'" : freq === 'weekly' ? "interval '7 days'" : "interval '1 month'";

/* ── CRUD (owner-scoped) ───────────────────────────────── */
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT rp.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM recurring_runs rr WHERE rr.profile_id = rp.id) AS generated_count
         FROM recurring_profiles rp
         LEFT JOIN customers c ON c.id = rp.customer_id
        ${admin ? '' : 'WHERE rp.owner_id = $1'}
        ORDER BY rp.active DESC, rp.next_run ASC`,
      admin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  const { docType, title, customerId, amount, frequency, nextRun, notes, payload } = req.body;
  if (!DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'docType must be expense or sales_invoice' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Give the schedule a title / description' });
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Enter an amount greater than 0' });
  if (!FREQ.includes(frequency || 'monthly')) return res.status(400).json({ error: 'frequency must be daily, weekly or monthly' });
  if (!nextRun) return res.status(400).json({ error: 'Pick the first run date' });
  if (docType === 'sales_invoice' && !customerId) return res.status(400).json({ error: 'Pick a customer to bill' });
  try {
    const { rows } = await db.query(
      `INSERT INTO recurring_profiles (owner_id, doc_type, title, customer_id, amount, frequency, next_run, notes, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user?.id || null, docType, title.trim(), customerId || null, r2(amount), frequency || 'monthly',
       nextRun, notes || null, payload ? JSON.stringify(payload) : null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  const fields = ['title', 'amount', 'frequency', 'next_run', 'active', 'customer_id', 'notes', 'payload'];
  const map = { title: 'title', amount: 'amount', frequency: 'frequency', nextRun: 'next_run', active: 'active', customerId: 'customer_id', notes: 'notes', payload: 'payload' };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) {
      sets.push(`${col} = $${sets.length + 1}`);
      vals.push(col === 'payload' && req.body[k] ? JSON.stringify(req.body[k]) : req.body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  try {
    const r = await db.query(`UPDATE recurring_profiles SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
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
     VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7) RETURNING id`,
    [p.owner_id, pl.category || 'Recurring', p.title, p.amount, pl.paidTo || null, pl.paymentMode || null,
     `Auto-generated from recurring schedule #${p.id}`]
  );
  return { type: 'expense', id: rows[0].id, ref: `Expense ₹${Number(p.amount).toLocaleString('en-IN')}` };
}

async function generateInvoice(client, p) {
  const pl = p.payload || {};
  const gstRate = pl.gstRate != null ? Number(pl.gstRate) : 18;
  const termsDays = pl.termsDays != null ? Number(pl.termsDays) : 30;
  // Interstate from customer vs company GSTIN (same rule as manual invoices).
  let interstate = false;
  if (p.customer_id) {
    let company = null;
    try { company = (await client.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    const cust = (await client.query('SELECT * FROM customers WHERE id = $1', [p.customer_id])).rows[0];
    const companyState = String(company?.stateCode || (company?.gstin || '').substring(0, 2) || '');
    const custState = String(cust?.gstin || '').substring(0, 2);
    interstate = !!custState && !!companyState && custState !== companyState;
  }
  const subTotal = r2(p.amount);
  const gstTotal = r2(subTotal * gstRate / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(subTotal + gstTotal);
  const cnt = await client.query('SELECT COUNT(*) FROM sales_invoices');
  const invNumber = `INV-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
  const { rows } = await client.query(
    `INSERT INTO sales_invoices (owner_id, customer_id, invoice_number, invoice_date, due_date,
       sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes, status)
     VALUES ($1,$2,$3,CURRENT_DATE,(CURRENT_DATE + ($4 || ' days')::interval)::date,
       $5,0,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,'Draft') RETURNING id`,
    [p.owner_id, p.customer_id, invNumber, String(termsDays),
     subTotal, gstRate, interstate, cgst, sgst, igst, gstTotal, net, amountInWords(net),
     `Auto-generated from recurring schedule #${p.id}`]
  );
  const invId = rows[0].id;
  await client.query(
    `INSERT INTO sales_invoice_items (sales_invoice_id, description, hsn, uom, quantity, rate, amount, sort_order)
     VALUES ($1,$2,$3,'nos',1,$4,$5,0)`,
    [invId, p.title, pl.hsn || null, subTotal, subTotal]
  );
  return { type: 'sales_invoice', id: invId, ref: invNumber };
}

/* ── The scheduler pass ────────────────────────────────── */
// ownerId: limit to one owner (self-service "run now"); null = everyone (interval).
async function runPass(ownerId = null) {
  const summary = { generated: 0, invoices: 0, expenses: 0, reminders: 0, items: [] };

  // 1) Generate everything due today.
  const due = (await db.query(
    `SELECT * FROM recurring_profiles
      WHERE active = TRUE AND next_run <= CURRENT_DATE
      ${ownerId ? 'AND owner_id = $1' : ''}`,
    ownerId ? [ownerId] : []
  )).rows;

  for (const p of due) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const g = p.doc_type === 'expense' ? await generateExpense(client, p) : await generateInvoice(client, p);
      await client.query(
        `INSERT INTO recurring_runs (profile_id, result_type, result_id, result_ref) VALUES ($1,$2,$3,$4)`,
        [p.id, g.type, g.id, g.ref]
      );
      await client.query(
        `UPDATE recurring_profiles
            SET last_run = CURRENT_DATE,
                runs_count = runs_count + 1,
                next_run = (next_run + ${intervalSql(p.frequency)})::date
          WHERE id = $1`,
        [p.id]
      );
      await client.query('COMMIT');
      summary.generated++;
      if (g.type === 'sales_invoice') summary.invoices++; else summary.expenses++;
      summary.items.push({ profile: p.title, created: g.ref });
      notify(p.owner_id || 'admins', {
        type: 'RECURRING_GENERATED',
        title: `Recurring ${p.doc_type === 'expense' ? 'expense' : 'invoice'} created`,
        message: `${g.ref} from schedule “${p.title}”`,
        entityType: g.type, entityId: g.id,
        link: g.type === 'sales_invoice' ? `/sales-invoices/${g.id}` : '/expenses',
      });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[scheduler] profile ${p.id} failed:`, e.message);
    } finally { client.release(); }
  }

  // 2) Overdue-invoice reminders — fire once when an invoice first goes overdue.
  const overdue = (await db.query(
    `SELECT si.*, c.name AS customer_name
       FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id
      WHERE si.due_date IS NOT NULL
        AND si.due_date < CURRENT_DATE
        AND si.status <> 'Paid'
        AND si.net_amount > COALESCE(si.amount_paid, 0)
        AND si.reminder_stage = 0
        ${ownerId ? 'AND si.owner_id = $1' : ''}`,
    ownerId ? [ownerId] : []
  )).rows;

  for (const inv of overdue) {
    const daysOver = Math.max(1, Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000));
    const outstanding = r2((inv.net_amount || 0) - (inv.amount_paid || 0));
    notify(inv.owner_id || 'admins', {
      type: 'INVOICE_OVERDUE',
      title: `Invoice overdue · ${inv.invoice_number}`,
      message: `${inv.customer_name || 'Customer'} — ₹${outstanding.toLocaleString('en-IN')} outstanding, ${daysOver} day(s) past due`,
      entityType: 'sales_invoice', entityId: inv.id, link: `/sales-invoices/${inv.id}`,
    });
    await db.query('UPDATE sales_invoices SET reminder_stage = 1 WHERE id = $1', [inv.id]);
    summary.reminders++;
  }

  return summary;
}
exports.runPass = runPass;

// POST /recurring/run-now
exports.runNow = async (req, res) => {
  try {
    const summary = await runPass(isAdmin(req) ? null : req.user.id);
    res.json({ success: true, ...summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /recurring/:id/runs — history for one schedule
exports.runs = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM recurring_runs WHERE profile_id = $1 ORDER BY id DESC LIMIT 50', [req.params.id]);
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
      if (s.generated || s.reminders)
        console.log(`[scheduler] generated ${s.generated} doc(s), ${s.reminders} reminder(s)`);
    } catch (e) { console.error('[scheduler] pass error:', e.message); }
    finally { running = false; }
  };
  // First pass shortly after boot, then hourly.
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000);
  console.log('[scheduler] recurring + reminder engine started');
};
