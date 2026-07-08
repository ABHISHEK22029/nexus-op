/* ══════════════════════════════════════════════════════════
   AiController — "Ask AI" assistant (OpenRouter, read-only, grounded)
   • Domain-restricted: only Nexus-OP + the signed-in user's own
     operations/data (and their clients like Hi-MAK). Refuses off-topic.
   • Grounded via a catalog of READ-ONLY tools over the live DB + a
     full-text Knowledge Base search. Never writes/mutates anything.
   • Provider-agnostic: talks to OpenRouter's OpenAI-compatible API, so
     the model is a config value (OPENROUTER_MODEL) and the only secret
     is OPENROUTER_API_KEY (in the gitignored .env / Render env).
   ══════════════════════════════════════════════════════════ */
const db = require('../db');

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const isAdmin = (req) => req.user?.role === 'Admin';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const SYSTEM_PROMPT = `You are "Ask AI", the built-in assistant inside Nexus-OP — an operations/ERP platform for Indian SME manufacturers and fabricators (clients include Hi-MAK and Kirashi).

WHAT YOU DO
- Help the signed-in user operate Nexus-OP and understand THEIR OWN business data inside it.
- Answer questions about their live data (customer orders, quotations, purchase orders, GRN, inventory, production/BOM, sales invoices, payments, expenses, approvals) using the read-only tools provided.
- Explain how to use Nexus-OP features using the search_knowledge_base tool.
- Point the user to the exact screen to use (e.g. "Open Procurement → Purchase Orders").

HARD RULES
- READ-ONLY: you never create, edit, delete, approve, or change anything. If asked to perform an action, explain where the user can do it themselves.
- STRICTLY ON-TOPIC: only answer questions about Nexus-OP, how to use it, and the user's business/operations within it (their orders, vendors, customers like Hi-MAK, invoices, production, etc.). If a question is NOT about Nexus-OP or the user's use of it — general knowledge, science, math, trivia, coding help, current events, personal advice (e.g. "what is the value of Planck length") — politely decline in ONE sentence and steer back, e.g.: "I can only help with Nexus-OP and your operations here — try asking about your orders, invoices, inventory, production, or how to use a feature."
- GROUNDED: base data answers on tool results only. Never invent order numbers, IDs, amounts, or dates. If the data isn't available, say so plainly.

STYLE
- Concise and practical. Use short bullet points. Use ₹ and Indian number formatting.
- When you used knowledge-base articles, mention them by title.
- Prefer calling a tool over guessing. If a question needs data, call the relevant tool first.`;

/* ── read-only tool catalog (OpenAI function-calling schema) ── */
const TOOLS = [
  { type: 'function', function: { name: 'get_business_overview', description: 'High-level snapshot of the user\'s operations: open orders, POs pending approval, overdue invoices (count + total), low-stock item count, active projects.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_overdue_invoices', description: 'Customer sales invoices past their due date and not fully paid, with outstanding amount and days overdue.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_pending_po_approvals', description: 'Purchase orders held for sign-off (above the approval threshold).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_low_stock', description: 'Inventory items at or below a stock threshold.', parameters: { type: 'object', properties: { threshold: { type: 'number', description: 'Quantity at/below which to flag (default 10).' } } } } },
  { type: 'function', function: { name: 'find_customer_order', description: 'Look up customer orders by order number or customer name; returns status and line items.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Order number (e.g. CO-0007) or customer name.' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'search_customers', description: 'Find customers by name; returns GSTIN, state, contact.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_sku_bom', description: 'Get the recipe / bill of materials (components + qty per unit) for a product/SKU by name.', parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] } } },
  { type: 'function', function: { name: 'list_open_quotations', description: 'Customer quotations that are still open (not yet converted to an order or rejected), with customer, amount and status.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_vendor_payables', description: 'What the business owes vendors: outstanding GRN bills with amount due, days overdue, and total payable.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_recent_dispatches', description: 'Recent delivery challans (goods dispatched to customers) with customer, value and status.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'search_knowledge_base', description: 'Search Nexus-OP help articles (how-to / guides) for answering "how do I…" questions.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
];

/* ── tool handlers (owner/project scoped; admin sees all) ── */
const HANDLERS = {
  async get_business_overview(_args, req) {
    const admin = isAdmin(req);
    const uid = req.user.id;
    const own = admin ? '' : ' AND owner_id = $1';
    const proj = admin ? '' : ' AND "projectId" IN (SELECT id FROM projects WHERE owner_id = $1)';
    const p = admin ? [] : [uid];
    const [orders, pos, inv, low, proj_c, pay] = await Promise.all([
      db.query(`SELECT COUNT(*) c FROM customer_orders WHERE status <> 'Closed'${own}`, p),
      db.query(`SELECT COUNT(*) c FROM purchase_orders WHERE approval_status = 'Pending Approval'${proj}`, p),
      db.query(`SELECT COUNT(*) c, COALESCE(SUM(net_amount - COALESCE(amount_paid,0)),0) t FROM sales_invoices WHERE due_date < CURRENT_DATE AND status <> 'Paid' AND net_amount > COALESCE(amount_paid,0)${own}`, p),
      db.query(`SELECT COUNT(*) c FROM inventory WHERE quantity <= 10${proj}`, p),
      db.query(admin ? 'SELECT COUNT(*) c FROM projects' : 'SELECT COUNT(*) c FROM projects WHERE owner_id = $1', p),
      db.query(`SELECT COALESCE(SUM(net_amount - COALESCE(amount_paid,0)),0) t FROM grn_bills gb WHERE net_amount > COALESCE(amount_paid,0)${admin ? '' : ' AND gb."projectId" IN (SELECT id FROM projects WHERE owner_id = $1)'}`, p),
    ]);
    return {
      openCustomerOrders: Number(orders.rows[0].c),
      posPendingApproval: Number(pos.rows[0].c),
      receivablesOverdue: { count: Number(inv.rows[0].c), outstanding: inr(inv.rows[0].t) },
      payablesToVendors: inr(pay.rows[0].t),
      lowStockItems: Number(low.rows[0].c),
      activeProjects: Number(proj_c.rows[0].c),
    };
  },

  async list_overdue_invoices(_args, req) {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT si.invoice_number, c.name AS customer, si.net_amount, COALESCE(si.amount_paid,0) AS paid, si.due_date,
              (CURRENT_DATE - si.due_date) AS days_overdue
         FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id
        WHERE si.due_date < CURRENT_DATE AND si.status <> 'Paid' AND si.net_amount > COALESCE(si.amount_paid,0)
        ${admin ? '' : 'AND si.owner_id = $1'}
        ORDER BY si.due_date ASC LIMIT 25`,
      admin ? [] : [req.user.id]);
    if (!rows.length) return { message: 'No overdue invoices. 🎉' };
    return rows.map(r => ({ invoice: r.invoice_number, customer: r.customer, outstanding: inr(r.net_amount - r.paid), dueDate: r.due_date, daysOverdue: r.days_overdue }));
  },

  async list_pending_po_approvals(_args, req) {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT "poNumber", "itemName", quantity, "unitPrice"
         FROM purchase_orders WHERE approval_status = 'Pending Approval'
        ${admin ? '' : 'AND "projectId" IN (SELECT id FROM projects WHERE owner_id = $1)'}
        ORDER BY id DESC LIMIT 25`,
      admin ? [] : [req.user.id]);
    if (!rows.length) return { message: 'No purchase orders are waiting for sign-off.' };
    return rows.map(r => ({ po: r.poNumber, item: r.itemName, qty: r.quantity, unitPrice: r.unitPrice != null ? inr(r.unitPrice) : null }));
  },

  async list_low_stock(args, req) {
    const admin = isAdmin(req);
    const th = Number(args?.threshold) > 0 ? Number(args.threshold) : 10;
    const params = admin ? [th] : [req.user.id, th];
    const { rows } = await db.query(
      `SELECT "itemName", quantity, uom FROM inventory
        WHERE quantity <= ${admin ? '$1' : '$2'}
        ${admin ? '' : 'AND "projectId" IN (SELECT id FROM projects WHERE owner_id = $1)'}
        ORDER BY quantity ASC LIMIT 30`, params);
    if (!rows.length) return { message: `No items at or below ${th}.` };
    return rows.map(r => ({ item: r.itemName, quantity: r.quantity, uom: r.uom }));
  },

  async find_customer_order(args, req) {
    const admin = isAdmin(req);
    const q = `%${(args?.query || '').trim()}%`;
    const { rows } = await db.query(
      `SELECT co.id, co.order_number, co.status, c.name AS customer
         FROM customer_orders co LEFT JOIN customers c ON c.id = co.customer_id
        WHERE (co.order_number ILIKE $1 OR c.name ILIKE $1)
        ${admin ? '' : 'AND co.owner_id = $2'}
        ORDER BY co.id DESC LIMIT 5`,
      admin ? [q] : [q, req.user.id]);
    if (!rows.length) return { message: 'No matching customer orders.' };
    const out = [];
    for (const o of rows) {
      const items = (await db.query('SELECT description, quantity, unit FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [o.id])).rows;
      out.push({ order: o.order_number, customer: o.customer, status: o.status, items: items.map(i => `${i.quantity} ${i.unit} × ${i.description}`) });
    }
    return out;
  },

  async search_customers(args, req) {
    const admin = isAdmin(req);
    const q = `%${(args?.query || '').trim()}%`;
    const { rows } = await db.query(
      `SELECT name, gstin, state, contact_name, phone FROM customers
        WHERE name ILIKE $1 ${admin ? '' : 'AND owner_id = $2'} ORDER BY name LIMIT 10`,
      admin ? [q] : [q, req.user.id]);
    if (!rows.length) return { message: 'No matching customers.' };
    return rows.map(r => ({ name: r.name, gstin: r.gstin, state: r.state, contact: r.contact_name, phone: r.phone }));
  },

  async get_sku_bom(args, req) {
    const admin = isAdmin(req);
    const q = `%${(args?.sku || '').trim()}%`;
    const sku = (await db.query(
      `SELECT id, name, unit FROM skus WHERE name ILIKE $1 ${admin ? '' : 'AND owner_id = $2'} ORDER BY name LIMIT 1`,
      admin ? [q] : [q, req.user.id])).rows[0];
    if (!sku) return { message: 'No matching SKU/product.' };
    const lines = (await db.query('SELECT component_name, qty_per_unit, uom FROM sku_bom WHERE sku_id = $1 ORDER BY id', [sku.id])).rows;
    if (!lines.length) return { sku: sku.name, message: 'No recipe (BOM) set for this product yet. Set one on Catalog → SKUs → Recipe.' };
    return { sku: sku.name, perUnit: lines.map(l => `${l.qty_per_unit} ${l.uom} ${l.component_name}`) };
  },

  async list_vendor_payables(_args, req) {
    const admin = isAdmin(req);
    const scope = admin ? '' : 'AND gb."projectId" IN (SELECT id FROM projects WHERE owner_id = $1)';
    const params = admin ? [] : [req.user.id];
    const { rows } = await db.query(
      `SELECT gb.bill_number, v.name AS vendor, (gb.net_amount - COALESCE(gb.amount_paid,0)) AS outstanding,
              (CURRENT_DATE - COALESCE(gb.due_date, gb.bill_date)) AS days_overdue, gb.payment_status
         FROM grn_bills gb LEFT JOIN vendors v ON v.id = gb.vendor_id
        WHERE gb.net_amount > COALESCE(gb.amount_paid,0) ${scope}
        ORDER BY COALESCE(gb.due_date, gb.bill_date) ASC LIMIT 25`, params);
    if (!rows.length) return { message: 'Nothing outstanding to vendors. 🎉' };
    const total = rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);
    return { totalPayable: inr(total), bills: rows.map(r => ({ bill: r.bill_number, vendor: r.vendor, outstanding: inr(r.outstanding), daysOverdue: r.days_overdue > 0 ? r.days_overdue : 0, status: r.payment_status })) };
  },

  async list_recent_dispatches(_args, req) {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT dc.challan_number, c.name AS customer, dc.total_value, dc.status, dc.vehicle_no, dc.challan_date
         FROM delivery_challans dc LEFT JOIN customers c ON c.id = dc.customer_id
        ${admin ? '' : 'WHERE dc.owner_id = $1'}
        ORDER BY dc.id DESC LIMIT 20`,
      admin ? [] : [req.user.id]);
    if (!rows.length) return { message: 'No delivery challans yet.' };
    return rows.map(r => ({ challan: r.challan_number, customer: r.customer, value: inr(r.total_value), status: r.status, vehicle: r.vehicle_no, date: r.challan_date }));
  },

  async list_open_quotations(_args, req) {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT sq.quote_number, c.name AS customer, sq.net_amount, sq.status, sq.valid_until
         FROM sales_quotations sq LEFT JOIN customers c ON c.id = sq.customer_id
        WHERE sq.status NOT IN ('Converted','Rejected')
        ${admin ? '' : 'AND sq.owner_id = $1'}
        ORDER BY sq.id DESC LIMIT 25`,
      admin ? [] : [req.user.id]);
    if (!rows.length) return { message: 'No open quotations.' };
    return rows.map(r => ({ quote: r.quote_number, customer: r.customer, amount: inr(r.net_amount), status: r.status, validUntil: r.valid_until }));
  },

  async search_knowledge_base(args, req) {
    const q = (args?.query || '').trim();
    if (!q) return [];
    const { rows } = await db.query(
      `SELECT slug, title, summary, category,
              ts_rank(search_tsv, plainto_tsquery('english', $1)) AS rank,
              LEFT(body, 700) AS snippet
         FROM kb_articles
        WHERE is_published AND search_tsv @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC LIMIT 4`, [q]);
    return rows.map(r => ({ slug: r.slug, title: r.title, category: r.category, summary: r.summary, snippet: r.snippet }));
  },
};

async function callOnce(messages, useTools) {
  const body = { model: MODEL, messages, temperature: 0.2 };
  if (useTools) { body.tools = TOOLS; body.tool_choice = 'auto'; }
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'https://nexus-op.app',
      'X-Title': 'Nexus-OP Ask AI',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message || { content: '' };
}

// POST /ai/ask   body: { messages: [{role,content}], context? }
exports.ask = async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'Ask AI is not configured yet. Add OPENROUTER_API_KEY to enable it.' });
  }
  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const clean = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Ask a question.' });
  }
  // Optional page context (which screen the user is on) helps grounding.
  const ctx = typeof req.body?.context === 'string' && req.body.context.trim()
    ? `\n\nContext: the user is currently on the "${req.body.context.trim()}" screen.` : '';

  const messages = [{ role: 'system', content: SYSTEM_PROMPT + ctx }, ...clean];
  const sources = [];
  const toolsUsed = [];
  try {
    for (let i = 0; i < 5; i++) {
      const msg = await callOnce(messages, true);
      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          const name = tc.function?.name;
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore */ }
          toolsUsed.push(name);
          let result;
          try { result = HANDLERS[name] ? await HANDLERS[name](args, req) : { error: 'unknown tool' }; }
          catch (e) { result = { error: e.message }; }
          if (name === 'search_knowledge_base' && Array.isArray(result)) {
            result.forEach(r => { if (!sources.find(s => s.slug === r.slug)) sources.push({ slug: r.slug, title: r.title }); });
          }
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(result).slice(0, 6000) });
        }
        continue;
      }
      return res.json({ answer: msg.content || '', sources, toolsUsed });
    }
    // Ran out of tool iterations — force a final answer with no more tools.
    const final = await callOnce(messages, false);
    return res.json({ answer: final.content || '', sources, toolsUsed });
  } catch (e) {
    console.error('[ask-ai]', e.message);
    return res.status(502).json({ error: 'The AI service had a problem answering. Please try again.' });
  }
};

/* ── Knowledge Base read endpoints (shared with Smart Knowledge UI) ── */
exports.kbList = async (req, res) => {
  try {
    const { q, category } = req.query;
    let sql = `SELECT id, slug, title, category, article_type, summary, tags, keywords, view_count, updated_at FROM kb_articles WHERE is_published`;
    const params = [];
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    if (q) { params.push(q); sql += ` AND search_tsv @@ plainto_tsquery('english', $${params.length}) ORDER BY ts_rank(search_tsv, plainto_tsquery('english', $${params.length})) DESC`; }
    else sql += ` ORDER BY category, title`;
    const { rows } = await db.query(sql, params);
    res.json({ articles: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.kbGet = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM kb_articles WHERE slug = $1 AND is_published', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Article not found' });
    db.query('UPDATE kb_articles SET view_count = view_count + 1 WHERE id = $1', [rows[0].id]).catch(() => {});
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
