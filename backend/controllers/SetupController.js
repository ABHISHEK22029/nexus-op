/* ══════════════════════════════════════════════════════════
   SetupController — is the platform actually able to work yet?

   The deficiency engine returns zero rows on live data, and every feature
   above it therefore does nothing. Not because any of it is broken: because
   its four inputs are empty. Materials have no vendor, products have no bill
   of materials, no order is in an open state, and every stock row has
   raw_material_id NULL so "available" is permanently zero.

   That is nearly impossible to diagnose from the screens. You open Material
   Requirements, see an empty table, and conclude the feature does not work.

   So the state of the spine gets its own endpoint, phrased as what is
   missing and what it costs you — not as a percentage. "82% set up" tells
   nobody what to do next; "145 materials have no vendor, so shortfalls
   cannot become purchase orders" does.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');

const n = (r) => Number(r.rows[0].n) || 0;

exports.readiness = async (req, res) => {
  try {
    const admin = isCrossTenant(req.user?.role);
    const owner = req.user?.id;
    // Owner-scoped unless the platform admin is looking.
    const scope = (col = 'owner_id') => (admin ? '' : ` AND ${col} = ${Number(owner) || -1}`);
    const q = (sql) => db.query(sql).then(n);

    const [
      materials, materialsWithVendor,
      products, productsWithBom,
      orders, openOrders,
      stockRows, stockLinked,
      customers, vendors,
      companyBank, companyGstin,
    ] = await Promise.all([
      q(`SELECT COUNT(*) n FROM raw_materials WHERE TRUE${scope()}`),
      q(`SELECT COUNT(DISTINCT vi.raw_material_id) n FROM vendor_items vi
         JOIN raw_materials m ON m.id = vi.raw_material_id WHERE TRUE${scope('m.owner_id')}`),
      q(`SELECT COUNT(*) n FROM skus WHERE TRUE${scope()}`),
      q(`SELECT COUNT(DISTINCT b.sku_id) n FROM sku_bom b
         JOIN skus s ON s.id = b.sku_id WHERE TRUE${scope('s.owner_id')}`),
      q(`SELECT COUNT(*) n FROM customer_orders WHERE TRUE${scope()}`),
      q(`SELECT COUNT(*) n FROM customer_orders
         WHERE status = ANY(ARRAY['Open','In Procurement','In Production','Ready','Partially Delivered'])${scope()}`),
      q(`SELECT COUNT(*) n FROM inventory WHERE TRUE${scope()}`),
      q(`SELECT COUNT(*) n FROM inventory WHERE (raw_material_id IS NOT NULL OR sku_id IS NOT NULL)${scope()}`),
      q(`SELECT COUNT(*) n FROM customers WHERE TRUE${scope()}`),
      q(`SELECT COUNT(*) n FROM vendors WHERE TRUE${scope()}`),
      q(`SELECT COUNT(*) n FROM company_profile
         WHERE bank_name IS NOT NULL AND bank_account_no IS NOT NULL AND bank_ifsc IS NOT NULL`),
      q(`SELECT COUNT(*) n FROM company_profile WHERE gstin IS NOT NULL AND gstin <> ''`),
    ]);

    /* Ordered by what unblocks the most. Each says what it COSTS, because
       "add BOMs" is a chore and "without this the system cannot tell you
       what to buy" is a reason. */
    const checks = [
      {
        key: 'company',
        label: 'Company GSTIN and bank details',
        ok: companyGstin > 0 && companyBank > 0,
        have: companyBank > 0 ? 'complete' : (companyGstin > 0 ? 'GSTIN set, bank details missing' : 'not set'),
        cost: 'Invoices print "Not configured" where the payment details belong — a customer cannot pay an invoice that does not say where to send money.',
        fix: 'Settings → Company profile',
      },
      {
        key: 'stock_links',
        label: 'Stock rows linked to a material or product',
        ok: stockRows === 0 || stockLinked === stockRows,
        have: `${stockLinked} of ${stockRows}`,
        cost: 'Unlinked stock is invisible to the deficiency engine, so "available" reads as zero however much you actually hold — it will tell you that you are short of material sitting in your own yard.',
        fix: 'Stock → Stock on hand, or run backfill-stock-links.js',
      },
      {
        key: 'boms',
        label: 'Products with a bill of materials',
        ok: products === 0 || productsWithBom === products,
        have: `${productsWithBom} of ${products}`,
        cost: 'Without a BOM the system cannot work out what a product needs, so an order for it produces no material demand at all.',
        fix: 'Stock → Items → a product → Bill of materials',
      },
      {
        key: 'vendor_links',
        label: 'Materials with at least one vendor',
        ok: materials === 0 || materialsWithVendor > 0,
        have: `${materialsWithVendor} of ${materials}`,
        cost: 'A shortfall with no vendor cannot become a purchase order — it is reported as skipped and stays short.',
        fix: 'Purchases → Vendors → What they supply',
      },
      {
        key: 'open_orders',
        label: 'Customer orders in an open state',
        ok: openOrders > 0,
        have: `${openOrders} of ${orders}`,
        cost: 'Demand comes from open orders. With none, Material Requirements is legitimately empty and looks broken.',
        fix: 'Sales → Orders',
      },
      {
        key: 'parties',
        label: 'Customers and vendors on file',
        ok: customers > 0 && vendors > 0,
        have: `${customers} customer(s), ${vendors} vendor(s)`,
        cost: 'Nothing can be quoted, ordered or bought.',
        fix: 'Sales → Customers · Purchases → Vendors',
      },
    ];

    const blocking = checks.filter(c => !c.ok);

    res.json({
      ready: blocking.length === 0,
      checks,
      blocking: blocking.map(c => c.key),
      /* The single sentence worth showing at the top of the screen. */
      headline: blocking.length === 0
        ? 'Everything the engine needs is in place.'
        : `${blocking.length} thing${blocking.length > 1 ? 's are' : ' is'} missing before the system can tell you what to buy and build.`,
      counts: {
        materials, materialsWithVendor, products, productsWithBom,
        orders, openOrders, stockRows, stockLinked, customers, vendors,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
