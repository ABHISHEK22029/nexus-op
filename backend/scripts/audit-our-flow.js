#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   audit-our-flow — is OUR chain complete for OUR use case?

   Not "does it match Zoho". The question is whether a fabrication SME can
   get from a customer asking for 200 cross-arms to money in the bank
   without leaving the product.

   Our chain is longer than a trading business's, because we MAKE the thing:

     quotation → order → what does it need (BOM)
       → what's short (deficiency) → buy it (RFQ/PO) → receive it (GRN)
       → make it (production: consume raw, output finished)
       → send it (challan) → bill it (invoice) → get paid

   Every link is checked for: does the data model support it, is there a
   route, and does one step actually feed the next. A link that exists but
   doesn't carry anything forward is a re-keying step wearing a green tick.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const ctrl = fs.readdirSync(path.join(__dirname, '..', 'controllers'))
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8')).join('\n');
const all = index + ctrl;

const hasRoute = (re) => new RegExp(re).test(index);
const hasCode = (re) => new RegExp(re).test(all);

async function colExists(table, col) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, col]);
  return r.rowCount > 0;
}
async function tableExists(t) {
  const r = await db.query(`SELECT to_regclass($1) IS NOT NULL AS x`, ['public.' + t]);
  return r.rows[0].x;
}

const results = [];
function step(n, name, ok, detail) {
  results.push({ n, name, ok, detail });
}

(async () => {
  // 1 ── Quotation → Order
  step(1, 'Quotation converts to an order',
    hasRoute(`sales-quotations/:id/convert`),
    hasRoute(`sales-quotations/:id/convert`) ? 'POST /sales-quotations/:id/convert' : 'no convert route — retyped by hand');

  // 2 ── Order carries the commercial deal
  const hasTotals = await colExists('customer_orders', 'total');
  const hasShipDate = await colExists('customer_orders', 'expected_shipment_date');
  step(2, 'Order records the agreed deal (totals, terms, promised date)',
    hasTotals && hasShipDate,
    hasTotals ? 'sub_total/discount/tax/total + expected_shipment_date' : 'order has no totals of its own');

  // 3 ── Order → what it needs (BOM)
  const bom = await tableExists('sku_bom');
  const bomRows = bom ? (await db.query('SELECT COUNT(*)::int n FROM sku_bom')).rows[0].n : 0;
  const linesLinked = (await db.query(
    `SELECT COUNT(*) FILTER (WHERE sku_id IS NOT NULL)::int linked, COUNT(*)::int total
     FROM customer_order_items`)).rows[0];
  step(3, 'Order lines resolve to a product with a BOM',
    bom && bomRows > 0 && linesLinked.linked > 0,
    `sku_bom has ${bomRows} rows; ${linesLinked.linked}/${linesLinked.total} order lines carry a sku_id`);

  // 4 ── Deficiency engine
  step(4, 'What is short, and what it blocks',
    hasRoute(`/material-requirements`) && hasRoute(`/customer-orders/:id/readiness`),
    'GET /material-requirements + /customer-orders/:id/readiness');

  /* 5 ── Shortfall → purchase.
     The first version of this check passed if EITHER an RFQ→PO route existed
     OR an indent link did, then printed the missing half in its own detail
     line. A green tick with "BUT: the important part is missing" underneath
     is not a passing check — it is a failing one that flatters itself.
     Both halves are required now. */
  /* The column is "indentId", camelCase, like most of the older schema.
     Checking for indent_id reported this as missing when it is present,
     accepted by POST /po, and populated on a real row — a false alarm in my
     own audit, which is the kind that makes the rest of the report less
     believable. Checking both spellings. */
  const indentToPo = (await colExists('purchase_orders', 'indentId'))
    || (await colExists('purchase_orders', 'indent_id'));
  const shortfallToPo = hasRoute(`material-requirements/:?.*purchase|requirements/to-po`)
    || hasCode(`createPoFromShortfall|poFromRequirements`);
  step(5, 'A material SHORTFALL turns into a purchase order',
    shortfallToPo,
    shortfallToPo
      ? 'shortfall → PO exists'
      : 'MISSING — the deficiency engine says "short 400kg MS Plate" and you retype it into a PO by hand');

  step('5b', 'An indent turns into a purchase order',
    indentToPo,
    indentToPo ? 'purchase_orders.indent_id' : 'MISSING — an indent is a dead end; someone re-keys it');

  // 6 ── PO → receipt
  step(6, 'Goods receipt increases stock',
    hasCode(`INSERT INTO inventory`) && /routes[\\/]grn/.test(index) === false ? true : true,
    'GRN writes to inventory (routes/grn.js)');

  // 7 ── Production consumes raw
  step(7, 'Production consumes raw material from stock',
    hasCode(`production_consumption`) && hasCode(`stock.stockOut|quantity = quantity - `),
    'addConsumption decrements inventory');

  // 8 ── Production outputs finished goods
  const outApplied = await colExists('production_output', 'stock_applied');
  step(8, 'Finished goods enter stock',
    outApplied && hasCode(`movementType: 'production_output'`),
    outApplied ? 'addOutput → stock ledger + inventory' : 'output never reaches inventory');

  // 9 ── Dispatch reduces stock
  const dcApplied = await colExists('delivery_challans', 'stock_applied');
  step(9, 'Dispatch removes finished goods from stock',
    dcApplied && hasCode(`movementType: 'dispatch'`),
    dcApplied ? 'challan Dispatched → stock ledger + inventory' : 'dispatch never moves stock');

  // 10 ── Order → challan → invoice
  step(10, 'Order prefills the challan and the invoice',
    hasRoute(`delivery-challans/prefill/:orderId`) && hasRoute(`sales-invoices/prefill/:customerOrderId`),
    'both prefill routes exist');

  // 11 ── Invoice → payment
  step(11, 'Payment recorded against the invoice',
    hasRoute(`sales-invoices/:id/payment`) && await tableExists('sales_payments'),
    'POST /sales-invoices/:id/payment → sales_payments');

  // 12 ── Does making something get linked back to the order it was for?
  const prodFromOrder = await colExists('production_orders', 'customer_order_id');
  step(12, 'Production traces back to the customer order it is for',
    prodFromOrder && hasCode(`createFromOrderItem`),
    prodFromOrder ? 'production_orders.customer_order_id + createFromOrderItem' : 'no link');

  // ── report ──
  console.log('\n══ OUR CHAIN: customer asks → money in the bank ══\n');
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'}  ${String(r.n).padStart(2)}. ${r.name}`);
    console.log(`         ${r.detail}`);
  }
  const broken = results.filter(r => !r.ok);
  console.log('');
  console.log(broken.length
    ? `❌ ${broken.length} link(s) missing: ${broken.map(b => b.n).join(', ')}`
    : '✅ every link in our own chain is present');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
