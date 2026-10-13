#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   backfill-order-amounts — put the money back on orders saved at ₹0.

   The Customer Orders screen sent each line's price as `targetPrice`, and
   the order arithmetic (shared/orderTotals) read `rate` only. So every
   order typed there was saved with line amounts of 0, a sub-total of 0 and
   a total of 0 — while the list looked right, because it works its value
   out from target_price on the fly.

   This finds orders with a line whose amount is 0 but whose target_price
   is above 0, and recomputes every line and the order's totals with the
   same computeOrder the order screen now uses, from the order's own
   discount, GST, TDS/TCS, adjustment and round-off.

   Only an amount of exactly 0 counts. A NULL amount is an order converted
   from a quotation, whose totals were carried over from the quotation and
   are right.

   Invoices already raised from these orders are NOT touched — an issued
   invoice is corrected with a credit or debit note, not rewritten. Their
   ids are listed so they can be checked.

   Run:  node scripts/backfill-order-amounts.js          (dry run: counts and ids)
         node scripts/backfill-order-amounts.js --apply  (write, in one transaction)
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { computeOrder } = require('../shared/orderTotals');
const { amountInWords } = require('../shared/amountInWords');

const APPLY = process.argv.includes('--apply');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let open = false;
  try {
    if (APPLY) { await c.query('BEGIN'); open = true; }

    const ids = (await c.query(
      `SELECT DISTINCT customer_order_id AS id FROM customer_order_items
        WHERE amount = 0 AND COALESCE(target_price, 0) > 0
        ORDER BY 1`)).rows.map((r) => r.id);

    console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — orders with a line saved at ₹0 but priced: ${ids.length}`);
    if (!ids.length) { if (open) await c.query('COMMIT'); open = false; return; }

    /* FOR UPDATE when writing, so an order changed while this runs waits
       for us rather than being overwritten from a stale read. */
    const orders = (await c.query(
      `SELECT * FROM customer_orders WHERE id = ANY($1) ORDER BY id ${APPLY ? 'FOR UPDATE' : ''}`, [ids])).rows;
    const lines = (await c.query(
      `SELECT * FROM customer_order_items WHERE customer_order_id = ANY($1) ORDER BY customer_order_id, sort_order, id`, [ids])).rows;
    const invoiced = (await c.query(
      `SELECT customer_order_id, array_agg(id ORDER BY id) AS invoices
         FROM sales_invoices WHERE customer_order_id = ANY($1) GROUP BY customer_order_id`, [ids])).rows;

    const zeroLines = lines.filter((l) => Number(l.amount) === 0 && Number(l.target_price) > 0).length;
    let linesChanged = 0;

    for (const co of orders) {
      const own = lines.filter((l) => l.customer_order_id === co.id);
      const t = computeOrder(own.map((l) => ({
        id: l.id, quantity: l.quantity, rate: l.rate, targetPrice: l.target_price,
        discount: l.discount, discountType: l.discount_type,
      })), {
        discount: co.discount ?? 0, discountType: co.discount_type || 'percent',
        gstRate: co.gst_rate ?? 18, interstate: !!co.interstate,
        taxDeductionType: co.tax_deduction_type || null, taxDeductionRate: co.tax_deduction_rate ?? 0,
        adjustment: co.adjustment ?? 0, roundOff: co.round_off ?? 0,
      });
      for (const l of t.lines) {
        const was = own.find((x) => x.id === l.id);
        if (Number(was.amount) === l.amount) continue;
        linesChanged++;
        if (APPLY) await c.query('UPDATE customer_order_items SET amount = $1 WHERE id = $2', [l.amount, l.id]);
      }
      if (APPLY) {
        await c.query(
          `UPDATE customer_orders
              SET sub_total = $1, cgst = $2, sgst = $3, igst = $4, gst_total = $5,
                  tax_deduction_amount = $6, total = $7, amount_in_words = $8
            WHERE id = $9`,
          [t.subTotal, t.cgst, t.sgst, t.igst, t.gstTotal, t.taxDeductionAmount, t.total, amountInWords(t.total), co.id]);
      }
    }

    const invIds = invoiced.flatMap((r) => r.invoices);
    console.log(`   lines at ₹0 with a price:       ${zeroLines}`);
    console.log(`   lines whose amount ${APPLY ? 'was' : 'would be'} changed: ${linesChanged}`);
    console.log(`   orders ${APPLY ? 'recomputed' : 'to recompute'}:              ${orders.length}`);
    console.log(`   order ids: ${ids.join(', ')}`);
    console.log(`   of these, already invoiced:    ${invoiced.length} order(s), ${invIds.length} invoice(s) — not changed here`);
    if (invoiced.length) {
      console.log(`   invoiced order ids: ${invoiced.map((r) => r.customer_order_id).join(', ')}`);
      console.log(`   invoice ids: ${invIds.join(', ')}`);
    }

    if (open) { await c.query('COMMIT'); open = false; console.log('\n✅ written'); }
    else console.log('\nNothing was written. Run with --apply to write it.');
  } catch (e) {
    if (open) await c.query('ROLLBACK').catch(() => {});
    console.error('failed, nothing written:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
