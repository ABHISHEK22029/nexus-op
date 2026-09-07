#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   audit-integrity — every place a document says one thing and the records
   underneath say another.

   PO 4 was "Delivered" with nothing received. PO 20 held 1250 against an
   order for 150. Both were found by eye, which is not a method. This asks
   the same question of every flow at once, so the answer is a list rather
   than whatever somebody happened to notice.

   Each check states an invariant that must hold if the flow is working, and
   reports the rows that break it. Reporting only — nothing is changed here.
   Fixes live in fix-integrity.js so that finding and changing stay separate.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const TOL = 0.001;

/* Each check: a name, the invariant in words, and the SQL that finds
   violations. `severity` decides the ordering of the report. */
const CHECKS = [
  /* ── purchasing ───────────────────────────────────────── */
  {
    area: 'Purchasing', severity: 'BROKEN',
    name: 'a purchase order marked Delivered with nothing received',
    why: 'the goods can never be received — the receipt guard refuses a Delivered order',
    sql: `SELECT id, "poNumber", quantity AS ordered, received_quantity AS received, status
            FROM purchase_orders
           WHERE status = 'Delivered' AND COALESCE(received_quantity,0) <= 0
           ORDER BY id`,
  },
  {
    area: 'Purchasing', severity: 'BROKEN',
    name: 'received quantity disagrees with the receipts recorded against it',
    why: 'received_quantity is a cached total; if it drifts, every status derived from it is wrong',
    sql: `SELECT p.id, p."poNumber", p.received_quantity AS cached,
                 COALESCE((SELECT SUM("receivedQuantity") FROM grn WHERE "poId" = p.id),0) AS actual
            FROM purchase_orders p
           WHERE ABS(COALESCE(p.received_quantity,0)
                     - COALESCE((SELECT SUM("receivedQuantity") FROM grn WHERE "poId" = p.id),0)) > ${TOL}
           ORDER BY p.id`,
  },
  {
    area: 'Purchasing', severity: 'BROKEN',
    name: 'more received than was ever ordered, beyond the 10% tolerance',
    why: 'stock, stock value and the vendor bill are all overstated by the difference',
    sql: `SELECT id, "poNumber", "itemName", quantity AS ordered, received_quantity AS received,
                 ROUND((received_quantity / NULLIF(quantity,0))::numeric, 2) AS times_over
            FROM purchase_orders
           WHERE COALESCE(received_quantity,0) > COALESCE(quantity,0) * 1.10 + ${TOL}
           ORDER BY id`,
  },
  {
    area: 'Purchasing', severity: 'WARN',
    name: 'status does not match how much has arrived',
    why: 'the status is what people read; it should follow the quantities',
    sql: `SELECT id, "poNumber", quantity AS ordered, received_quantity AS received, status
            FROM purchase_orders
           WHERE status IN ('Delivered','Partially Received')
             AND COALESCE(received_quantity,0) > 0
             AND (
               (status = 'Delivered'          AND received_quantity < quantity - ${TOL}) OR
               (status = 'Partially Received' AND received_quantity >= quantity - ${TOL})
             )
           ORDER BY id`,
  },
  {
    area: 'Purchasing', severity: 'BROKEN',
    name: 'a goods receipt against a purchase order that no longer exists',
    why: 'stock arrived from nowhere and cannot be traced to a vendor or a price',
    sql: `SELECT g.id, g."poId", g."receivedQuantity"
            FROM grn g
           WHERE g."poId" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = g."poId")
           ORDER BY g.id`,
  },

  /* ── stock ────────────────────────────────────────────── */
  {
    area: 'Stock', severity: 'BROKEN',
    name: 'balance not explained by its own ledger',
    why: 'something changed the quantity without going through shared/stock',
    sql: `SELECT i.id, i."itemName", i.quantity AS balance,
                 COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE inventory_id = i.id),0) AS ledger
            FROM inventory i
           WHERE ABS(i.quantity - COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE inventory_id = i.id),0)) > ${TOL}
           ORDER BY i.id`,
  },
  {
    area: 'Stock', severity: 'BROKEN',
    name: 'negative stock',
    why: 'more was shipped or consumed than was ever held',
    sql: `SELECT id, "itemName", quantity FROM inventory WHERE quantity < -${TOL} ORDER BY id`,
  },
  {
    area: 'Stock', severity: 'BROKEN',
    name: 'stock row with no owner',
    why: 'invisible to every owner-scoped list, and to the reconciliation report',
    sql: `SELECT id, "itemName", quantity FROM inventory WHERE owner_id IS NULL ORDER BY id`,
  },
  {
    area: 'Stock', severity: 'WARN',
    name: 'the same item held on more than one row',
    why: 'a reorder level on one row is compared against a fraction of the stock',
    sql: `SELECT "itemName", COUNT(*) AS rows, SUM(quantity) AS total
            FROM inventory GROUP BY "itemName" HAVING COUNT(*) > 1
           ORDER BY COUNT(*) DESC, "itemName"`,
  },
  {
    area: 'Stock', severity: 'BROKEN',
    name: 'a ledger entry pointing at a stock row that no longer exists',
    why: 'the movement can never be reconciled against a balance',
    sql: `SELECT m.id, m.item_name, m.quantity, m.movement_type
            FROM stock_movements m
           WHERE m.inventory_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.id = m.inventory_id)
           ORDER BY m.id`,
  },

  /* ── sales ────────────────────────────────────────────── */
  {
    area: 'Sales', severity: 'BROKEN',
    name: 'a quotation marked Converted with no order behind it',
    why: 'the quote looks won and no order exists to fulfil',
    sql: `SELECT id, quote_number, status, converted_order_id
            FROM sales_quotations
           WHERE status = 'Converted'
             AND (converted_order_id IS NULL
                  OR NOT EXISTS (SELECT 1 FROM customer_orders o WHERE o.id = converted_order_id))
           ORDER BY id`,
  },
  {
    area: 'Sales', severity: 'WARN',
    name: 'an order marked Delivered with nothing dispatched',
    why: 'the same fault as PO 4, on the selling side',
    sql: `SELECT o.id, o.order_number, o.status,
                 COALESCE((SELECT SUM(dci.quantity)
                             FROM delivery_challan_items dci
                             JOIN delivery_challans d ON d.id = dci.delivery_challan_id
                            WHERE d.customer_order_id = o.id
                              AND d.status IN ('Dispatched','Delivered')),0) AS dispatched
            FROM customer_orders o
           WHERE o.status = 'Delivered'
             AND COALESCE((SELECT SUM(dci.quantity)
                             FROM delivery_challan_items dci
                             JOIN delivery_challans d ON d.id = dci.delivery_challan_id
                            WHERE d.customer_order_id = o.id
                              AND d.status IN ('Dispatched','Delivered')),0) <= 0
           ORDER BY o.id`,
  },
  {
    area: 'Sales', severity: 'BROKEN',
    name: 'an invoice against a customer order that no longer exists',
    why: 'a tax invoice that cannot be traced to what was sold',
    sql: `SELECT i.id, i.invoice_number, i.customer_order_id
            FROM sales_invoices i
           WHERE i.customer_order_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM customer_orders o WHERE o.id = i.customer_order_id)
           ORDER BY i.id`,
  },

  /* ── master data ──────────────────────────────────────── */
  {
    area: 'Master data', severity: 'WARN',
    name: 'a document dated in the future',
    why: 'an invoice dated ahead of today breaks the GST return it belongs in',
    sql: `SELECT 'sales_invoice' AS kind, id, invoice_number AS ref, invoice_date AS dated
            FROM sales_invoices WHERE invoice_date > CURRENT_DATE
           UNION ALL
          SELECT 'quotation', id, quote_number, quote_date
            FROM sales_quotations WHERE quote_date > CURRENT_DATE
           ORDER BY dated DESC`,
  },
  {
    area: 'Master data', severity: 'WARN',
    name: 'a vendor or customer with no name',
    why: 'renders as a blank row and cannot be selected reliably',
    sql: `SELECT 'vendor' AS kind, id, COALESCE(name,'') AS name FROM vendors WHERE COALESCE(TRIM(name),'') = ''
           UNION ALL
          SELECT 'customer', id, COALESCE(name,'') FROM customers WHERE COALESCE(TRIM(name),'') = ''`,
  },
];

(async () => {
  console.log('\n  ══ integrity audit ══\n');
  const found = [];

  for (const c of CHECKS) {
    let rows = [];
    try {
      rows = (await db.query(c.sql)).rows;
    } catch (e) {
      console.log(`  ⚠ ${c.name}\n      check could not run: ${e.message}\n`);
      continue;
    }
    if (!rows.length) continue;
    found.push({ ...c, rows });
  }

  if (!found.length) {
    console.log('  ✅ every flow agrees with its own records\n');
    process.exit(0);
  }

  const order = { BROKEN: 0, WARN: 1 };
  found.sort((a, b) => order[a.severity] - order[b.severity] || a.area.localeCompare(b.area));

  for (const f of found) {
    console.log(`  ${f.severity === 'BROKEN' ? '🔴' : '🟠'} ${f.area} — ${f.name}  (${f.rows.length})`);
    console.log(`      ${f.why}`);
    for (const r of f.rows.slice(0, 6)) {
      console.log('      ' + Object.entries(r)
        .map(([k, v]) => `${k}=${v === null ? '—' : v}`).join('  '));
    }
    if (f.rows.length > 6) console.log(`      … and ${f.rows.length - 6} more`);
    console.log('');
  }

  const broken = found.filter(f => f.severity === 'BROKEN')
    .reduce((n, f) => n + f.rows.length, 0);
  const warn = found.reduce((n, f) => n + f.rows.length, 0) - broken;
  console.log(`  ${broken} broken, ${warn} worth looking at\n`);
  process.exit(broken ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
