#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A demonstration catalogue with a hundred products in it.

   Two real sources, because a catalogue of six invented rows proves
   nothing about how the page behaves:

     · the eighteen fabricated line items from the SSP Infra purchase order
       — 11kV cross arms, back clamps, DTR channel work — with their real
       piece weights, so the sizes and the units are the ones a fabricator
       actually quotes.

     · IKEA-style furniture for the rest, which is what the admin
       organisation ("Nordic Flatpack") already sells, so the sample looks
       like one business rather than two bolted together.

   Run with --owner <id> to seed a specific organisation, or it uses the
   demo account. Everything it creates is prefixed CAT- and `--clean`
   removes it.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const ownerArg = args.indexOf('--owner');
const SLUG = (args[args.indexOf('--slug') + 1] || 'nordic-flatpack').toLowerCase();

/* ── the fabricated items, from the purchase order ──────────────────── */
const LINE = 'Line hardware';
const DTR = 'Transformer fittings';
const FABRICATED = [
  ['VC-01', '11 KV V cross arm', '75 × 40 × 6 mm', 'Nos', 10.5394, 'Distribution poles on 11kV lines'],
  ['VC-02', '11 KV back clamp for V cross arm', '50 × 6 mm', 'Nos', 1.0526, 'Pairs with the V cross arm'],
  ['VC-03', '11 kV pole top bracket', '50 × 8 mm flat', 'Nos', 1.3973, 'Pole top mounting'],
  ['TP-01', 'Horizontal cross arm, tapping structure', '100 × 50 × 6', 'Set', 7.856, 'Tapping structures'],
  ['TP-02', 'Back clamp, horizontal cross arm channel', '50 × 8', 'Nos', 1.206, 'Secures the tapping cross arm'],
  ['CP-01', 'Horizontal cross arm, cut point structure', '75 × 40 × 6', 'Set', 15.708, 'Cut point structures'],
  ['CP-02', 'Fish plate, cut point structure', '50 × 6 — 1 set = 4 nos', 'Set', 2.3128, 'Joins cut point sections'],
  ['DTR-05', 'AB switch channel holding arrangement', 'DTR 75 × 40 × 6', 'Nos', 6.1404, 'Distribution transformer switchgear'],
  ['DTR-06', 'Supporting clamp, AB switch channel', '50 × 6 mm', 'Nos', 2.5488, 'Supports the AB switch channel'],
  ['DTR-08', 'HG fuse channel holding arrangement', 'DTR 75 × 40 × 60', 'Nos', 8.2824, 'Horn gap fuse mounting'],
  ['DTR-09', 'Supporting clamp, HG fuse channel', '50 × 6 mm', 'Nos', 2.6196, 'Supports the HG fuse channel'],
  ['DTR-10', 'AB switch operating handle top angle', '50 × 50 × 6', 'Nos', 2.25, 'Operating handle assembly'],
  ['DTR-11', 'AB switch operating top angle back clamp', '50 × 6', 'Nos', 1.72988, 'Back clamp for the handle angle'],
  ['DTR-16', 'DTR holding base angle', '50 × 50 × 6', 'Nos', 4.275, 'Transformer base'],
  ['DTR-18', 'LTDB fixing angle back clamp, top', '50 × 6', 'Nos', 3.9884, 'LT distribution box, upper fixing'],
  ['DTR-19', 'LTDB fixing angle back clamp, bottom', '50 × 6', 'Nos', 4.1772, 'LT distribution box, lower fixing'],
  ['DTR-20', 'AB switch handle welding channel', '75 × 40 × 6', 'Nos', 3.0702, 'Handle welding channel'],
  ['DTR-21', 'AB switch handle welding channel back clamp', '50 × 6', 'Nos', 1.2744, 'Back clamp for the welding channel'],
];

/* ── flat-pack furniture, the rest of the hundred ───────────────────── */
const SERIES = [
  ['Billy', 'bookcase', ['80×202', '40×202', '80×106', '120×202', '40×106']],
  ['Kallax', 'shelf unit', ['77×77', '147×77', '42×147', '182×182', '77×147']],
  ['Malm', 'chest of drawers', ['3 drawer', '4 drawer', '6 drawer', '2 drawer']],
  ['Hemnes', 'cabinet', ['glass door', '2 drawer', '8 drawer', 'sideboard']],
  ['Pax', 'wardrobe frame', ['100×236', '150×236', '200×236', '50×236']],
  ['Lack', 'side table', ['55×55', '90×55', '118×78']],
  ['Besta', 'storage combination', ['180×42', '120×64', '240×42']],
  ['Ivar', 'pine shelving', ['89×179', '89×226', '48×179']],
  ['Ektorp', 'sofa frame', ['2 seat', '3 seat', 'corner']],
  ['Poang', 'armchair frame', ['birch', 'oak veneer', 'black-brown']],
  ['Nordli', 'bed frame', ['90×200', '140×200', '160×200', '180×200']],
  ['Brimnes', 'daybed', ['80×200', 'with storage']],
  ['Havsta', 'cabinet', ['81×123', '81×212', '121×212']],
  ['Songesand', 'bedside table', ['single', 'pair']],
  ['Tarva', 'pine bed', ['90×200', '140×200']],
  ['Vihals', 'shelving unit', ['70×90', '140×90']],
  ['Idanas', 'dressing table', ['standard']],
  ['Skruvby', 'coffee table', ['70×70', '90×50']],
  ['Trotten', 'desk', ['120×70', '160×80']],
  ['Alex', 'drawer unit', ['5 drawer', '9 drawer']],
  ['Micke', 'workstation', ['105×50', '73×50']],
  ['Kleppstad', 'wardrobe', ['79×176', '117×176']],
  ['Hauga', 'open wardrobe', ['70×199', '140×199']],
  ['Kullen', 'chest of drawers', ['3 drawer', '5 drawer', '6 drawer']],
  ['Rakkestad', 'wardrobe', ['79×176', '117×176']],
  ['Vittsjo', 'shelving unit', ['51×175', '100×175', '202×175']],
  ['Lommarp', 'cabinet', ['86×101', '102×199']],
  ['Bror', 'steel shelving', ['85×40', '110×55', '170×40']],
  ['Ranarp', 'work lamp', ['clamp', 'floor', 'wall']],
  ['Norden', 'dining table', ['26/89×80', '155×90']],
  ['Ingatorp', 'extendable table', ['110/155', '155/215']],
  ['Bekant', 'desk frame', ['120×80', '160×80', 'sit/stand']],
];

const USE = [
  'Flat-pack, ships in one carton',
  'Wall fixing included',
  'Assembles with a hex key',
  'Stackable, sold singly',
  'Made to order in your finish',
];

const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

(async () => {
  const ownerId = ownerArg >= 0 ? Number(args[ownerArg + 1]) : (
    (await db.query(`SELECT id FROM users WHERE email = 'admin@nexusop.com'`)).rows[0]?.id
  );
  if (!ownerId) { console.error('no owner — pass --owner <id>'); process.exit(1); }

  if (CLEAN) {
    const r = await db.query(`DELETE FROM skus WHERE owner_id = $1 AND sku_code LIKE 'CAT-%'`, [ownerId]);
    console.log(`  removed ${r.rowCount} demo products`);
    process.exit(0);
  }

  /* Build the list: the eighteen real ones first, then furniture to 100. */
  const rows = [];
  for (const [code, name, size, unit, kg, use] of FABRICATED) {
    rows.push({
      code: `CAT-${code}`,
      name: `${name} ${size}`,
      headline: `${name} — ${size}`,
      use_case: use,
      unit,
      /* Priced off weight at the PO's rate of ₹79,000 per tonne, which is
         where a fabricator's price actually comes from. */
      price: Math.round(kg * 79),
      moq: unit === 'Set' ? 50 : 100,
      lead: '3 weeks from drawing approval',
      hsn: '7308',
    });
  }
  let i = 0;
  outer: for (const [series, kind, variants] of SERIES) {
    for (const v of variants) {
      if (rows.length >= 100) break outer;
      rows.push({
        code: `CAT-${series.toUpperCase()}-${String(++i).padStart(3, '0')}`,
        name: `${series} ${kind} ${v}`,
        headline: `${series} ${kind}`,
        use_case: `${v} · ${USE[i % USE.length]}`,
        unit: 'Nos',
        price: 1490 + ((i * 613) % 9000),
        moq: 10,
        lead: i % 3 === 0 ? 'In stock' : '10–14 days',
        hsn: '9403',
      });
    }
  }

  let made = 0;
  for (const [n, r] of rows.entries()) {
    await db.query(
      `INSERT INTO skus (owner_id, sku_code, name, description, unit, price, hsn,
                         catalogue_slug, is_published, headline, use_case, moq, lead_time_note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11,$12,$13)
       ON CONFLICT (owner_id, LOWER(catalogue_slug)) WHERE catalogue_slug IS NOT NULL
       DO UPDATE SET is_published = TRUE, headline = EXCLUDED.headline,
                     use_case = EXCLUDED.use_case, moq = EXCLUDED.moq,
                     lead_time_note = EXCLUDED.lead_time_note, sort_order = EXCLUDED.sort_order`,
      [ownerId, r.code, r.name, r.use_case, r.unit, r.price, r.hsn,
       slugify(r.name), r.headline, r.use_case, r.moq, r.lead, n]);
    made++;
  }

  /* Publish the catalogue itself, or the products have nowhere to appear. */
  const { rows: [prof] } = await db.query('SELECT name FROM company_profile WHERE owner_id = $1', [ownerId]);
  await db.query(
    `INSERT INTO catalogue_settings (owner_id, slug, headline, subhead, is_published, show_prices, whatsapp_number)
     VALUES ($1,$2,$3,$4,TRUE,TRUE,$5)
     ON CONFLICT (owner_id) DO UPDATE SET
       slug = EXCLUDED.slug, headline = EXCLUDED.headline, subhead = EXCLUDED.subhead,
       is_published = TRUE, show_prices = TRUE, whatsapp_number = EXCLUDED.whatsapp_number,
       updated_at = NOW()`,
    [ownerId, SLUG,
     'Fabricated steel and flat-pack furniture',
     'Galvanized line hardware to JBVNL specification, and flat-pack furniture made to order. Tell us what you need and how many.',
     '9866644456']);

  const { rows: [c] } = await db.query(
    `SELECT COUNT(*)::int n FROM skus WHERE owner_id = $1 AND is_published`, [ownerId]);
  console.log(`\n  seeded ${made} products · ${c.n} published for owner ${ownerId}`);
  console.log(`  catalogue is live at /c/${SLUG}\n`);
  process.exit(0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
