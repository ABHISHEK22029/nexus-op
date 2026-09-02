/* ══════════════════════════════════════════════════════════
   clean-chain — remove the records one chain-ui run created.

   Every document the chain test creates carries the run marker in its line
   description, so the marker is enough to find all of them. Deleted in
   dependency order, inside a transaction, and only ever rows whose marker
   matches — a chain run leaves real rows in a real database and they should
   not be left lying around, but nor should a cleanup script be capable of
   removing anything it was not asked to.

   Usage:  node scripts/clean-chain.js UITEST-XXXX
           node scripts/clean-chain.js UITEST-XXXX --dry
           node scripts/clean-chain.js --all-uitest --dry
   ══════════════════════════════════════════════════════════ */
require('dotenv').config();
const db = require('../db');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ALL = args.includes('--all-uitest');
const marker = args.find(a => !a.startsWith('--'));

if (!marker && !ALL) {
  console.error('usage: node scripts/clean-chain.js <MARKER> [--dry]   |   --all-uitest [--dry]');
  process.exit(1);
}
const like = ALL ? 'UITEST-%' : `%${marker}%`;

(async () => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    /* Find the documents by their line descriptions, then work outwards. */
    const ids = async (sql) => (await client.query(sql, [like])).rows.map(r => r.id);

    const quoteIds = await ids(
      `SELECT DISTINCT q.id FROM sales_quotations q
         JOIN sales_quotation_items i ON i.sales_quotation_id = q.id
        WHERE i.description LIKE $1`);
    const orderIds = await ids(
      `SELECT DISTINCT o.id FROM customer_orders o
         JOIN customer_order_items i ON i.customer_order_id = o.id
        WHERE i.description LIKE $1`);
    const challanIds = await ids(
      `SELECT DISTINCT d.id FROM delivery_challans d
         JOIN delivery_challan_items i ON i.delivery_challan_id = d.id
        WHERE i.description LIKE $1`);
    const invoiceIds = await ids(
      `SELECT DISTINCT v.id FROM sales_invoices v
         JOIN sales_invoice_items i ON i.sales_invoice_id = v.id
        WHERE i.description LIKE $1`);
    const prodIds = (await client.query(
      `SELECT id FROM production_orders WHERE product_name LIKE $1`, [like])).rows.map(r => r.id);

    const plan = [
      ['sales_invoice_items',     `DELETE FROM sales_invoice_items WHERE sales_invoice_id = ANY($1)`, invoiceIds],
      ['sales_invoices',          `DELETE FROM sales_invoices WHERE id = ANY($1)`, invoiceIds],
      ['delivery_challan_items',  `DELETE FROM delivery_challan_items WHERE delivery_challan_id = ANY($1)`, challanIds],
      ['delivery_challans',       `DELETE FROM delivery_challans WHERE id = ANY($1)`, challanIds],
      ['production_output',       `DELETE FROM production_output WHERE production_order_id = ANY($1)`, prodIds],
      ['production_consumption',  `DELETE FROM production_consumption WHERE production_order_id = ANY($1)`, prodIds],
      ['production_orders',       `DELETE FROM production_orders WHERE id = ANY($1)`, prodIds],
      ['customer_order_items',    `DELETE FROM customer_order_items WHERE customer_order_id = ANY($1)`, orderIds],
      ['sales_quotations (unlink)', `UPDATE sales_quotations SET converted_order_id = NULL WHERE converted_order_id = ANY($1)`, orderIds],
      ['customer_orders',         `DELETE FROM customer_orders WHERE id = ANY($1)`, orderIds],
      ['sales_quotation_items',   `DELETE FROM sales_quotation_items WHERE sales_quotation_id = ANY($1)`, quoteIds],
      ['sales_quotations',        `DELETE FROM sales_quotations WHERE id = ANY($1)`, quoteIds],
    ];

    console.log(`\n  marker: ${like}`);
    console.log(`  quotations ${quoteIds.length} · orders ${orderIds.length} · production ${prodIds.length} · challans ${challanIds.length} · invoices ${invoiceIds.length}\n`);

    /* Stock movements are deliberately NOT deleted. The ledger is an
       append-only record of what happened; a test run genuinely did move
       stock, and rewriting history to hide it would defeat the point of
       having a ledger. The inventory rows it created are left too — they
       are ordinary stock rows now. Reverse them through the app if you
       want them gone. */
    for (const [label, sql, list] of plan) {
      if (!list.length) { console.log(`  ${'—'} ${label}: nothing`); continue; }
      if (DRY) { console.log(`  · ${label}: would touch ${list.length} parent id(s)`); continue; }
      const r = await client.query(sql, [list]);
      console.log(`  ✓ ${label}: ${r.rowCount} row(s)`);
    }

    if (DRY) { await client.query('ROLLBACK'); console.log('\n  dry run — nothing changed\n'); }
    else { await client.query('COMMIT'); console.log('\n  done. Stock movements and inventory rows left in place on purpose.\n'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('rolled back:', e.message);
    process.exit(1);
  } finally { client.release(); process.exit(0); }
})();
