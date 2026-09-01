/* ══════════════════════════════════════════════════════════
   catalogue_seed — ~100 realistic fabrication items.

   Purpose: exercise the UOM system against the variety a real steel
   fabricator actually buys, where the SAME chain uses different units:
       BUY sheets by the metric tonne
       STOCK them as pieces
       CONSUME them by piece or by weight
   plus items bought by length (pipes), by area (glass), by box (hinges)
   and by weight (electrodes).

   Every row is tagged with a marker so the whole set can be removed again:
       node seed/catalogue_seed.js --remove

   Weight per piece is DERIVED from dimensions x density — never typed.
   ══════════════════════════════════════════════════════════ */
require('dotenv').config();
const db = require('../db');
const { weightPerPiece } = require('../shared/uom');

const MARK = '[CAT]'; // marker in material_code so the seed is reversible

const DENSITY = { 'MS': 7850, 'SS 304': 7930, 'SS 316': 8000, 'SS 202': 7800, 'GI': 7850, 'ALUMINIUM': 2700, 'BRASS': 8500, 'GLASS': 2500 };

const items = [];
const add = (o) => items.push(o);

/* ── 1. Sheets & plates: bought by MT, stocked as pieces ── */
const sheetSizes = [[2500, 1250], [3000, 1500], [2000, 1000]];
const thicknesses = [0.8, 1.0, 1.2, 1.5, 2.0, 3.0];
for (const grade of ['SS 304', 'SS 202', 'MS', 'GI']) {
  for (const [L, W] of sheetSizes) {
    for (const t of thicknesses) {
      if (items.length > 200) break;
      add({
        category: 'Sheet', grade, name: `${grade} Sheet ${L}x${W}x${t}mm`,
        base_uom: 'nos', purchase_uom: 'mt',
        length_mm: L, width_mm: W, thickness_mm: t,
        density: DENSITY[grade], rate: grade.startsWith('SS') ? 260 : 68,
        moq: 1, lead: 7,
      });
    }
  }
}

/* ── 2. Structural sections: bought by MT, stocked & consumed by kg ── */
for (const [name, kgPerM] of [
  ['MS Angle 25x25x3', 1.11], ['MS Angle 40x40x5', 2.92], ['MS Angle 50x50x6', 4.47],
  ['MS Angle 65x65x6', 5.90], ['MS Channel 75x40', 7.14], ['MS Channel 100x50', 9.56],
  ['MS Channel 125x65', 13.10], ['MS Flat 25x6', 1.18], ['MS Flat 50x6', 2.36],
  ['MS Flat 75x10', 5.89], ['MS Round Bar 12mm', 0.89], ['MS Round Bar 16mm', 1.58],
  ['MS Round Bar 20mm', 2.47], ['MS Square Bar 12mm', 1.13],
]) {
  add({ category: 'Structural', grade: 'MS', name, base_uom: 'kg', purchase_uom: 'mt',
    density: 7850, rate: 62, moq: 100, lead: 5, kgPerM });
}

/* ── 3. Pipes & tubes: bought by length, stocked by metre ── */
for (const [name, kgPerM] of [
  ['MS Pipe 25NB', 2.44], ['MS Pipe 32NB', 3.11], ['MS Pipe 40NB', 3.61],
  ['MS Pipe 50NB', 5.10], ['SS 304 Pipe 25NB', 2.50], ['SS 304 Pipe 50NB', 5.20],
  ['MS Square Tube 25x25x2', 1.36], ['MS Square Tube 40x40x2', 2.31],
  ['MS Rect Tube 60x40x2', 2.93],
]) {
  add({ category: 'Pipe', grade: name.startsWith('SS') ? 'SS 304' : 'MS', name,
    base_uom: 'm', purchase_uom: 'm', density: name.startsWith('SS') ? 7930 : 7850,
    rate: 240, moq: 6, lead: 7, kgPerM });
}

/* ── 4. Hardware: bought by box, stocked as pieces ── */
for (const [name, perBox, rate] of [
  ['SS Butt Hinge 4in', 50, 85], ['SS Butt Hinge 5in', 50, 110], ['MS Butt Hinge 4in', 100, 40],
  ['Heavy Duty Hinge 6in', 25, 260], ['Mortice Lock Set', 20, 640], ['Cylindrical Lock', 20, 420],
  ['Tower Bolt 6in', 50, 95], ['Door Handle SS', 25, 310], ['Door Closer', 10, 1450],
  ['Panic Bar', 5, 4200], ['Floor Spring', 5, 3800], ['D-Handle 300mm', 20, 520],
  ['Aldrop 10in', 25, 180], ['Door Stopper', 100, 60], ['Hinge Pin Set', 100, 28],
]) {
  add({ category: 'Hardware', grade: null, name, base_uom: 'nos', purchase_uom: 'box',
    rate, moq: 1, lead: 10, perBox });
}

/* ── 5. Glass: bought and stocked by area ── */
for (const t of [4, 5, 6, 8, 10, 12]) {
  add({ category: 'Glass', grade: 'GLASS', name: `Toughened Glass ${t}mm`,
    base_uom: 'sqm', purchase_uom: 'sqm', thickness_mm: t, density: 2500,
    rate: 320 + t * 40, moq: 5, lead: 14 });
  add({ category: 'Glass', grade: 'GLASS', name: `Fire-Rated Glass ${t}mm`,
    base_uom: 'sqm', purchase_uom: 'sqm', thickness_mm: t, density: 2500,
    rate: 1800 + t * 90, moq: 2, lead: 21, critical: true });
}

/* ── 6. Fasteners: bought by kg, stocked as pieces ── */
for (const [name, perKg, rate] of [
  ['Hex Bolt M8x25', 62, 120], ['Hex Bolt M10x40', 28, 120], ['Hex Bolt M12x50', 15, 125],
  ['Hex Nut M8', 180, 110], ['Hex Nut M10', 105, 110], ['Hex Nut M12', 62, 115],
  ['Washer M10', 420, 95], ['Anchor Fastener M10', 22, 190], ['Self Drilling Screw', 900, 210],
  ['Rivet 4mm', 1400, 240],
]) {
  add({ category: 'Fastener', grade: 'MS', name, base_uom: 'nos', purchase_uom: 'kg',
    rate, moq: 5, lead: 4, perKg });
}

/* ── 7. Consumables: bought & stocked by weight or piece ── */
for (const [name, uom, rate] of [
  ['Welding Electrode 3.15mm', 'kg', 145], ['Welding Electrode 4mm', 'kg', 142],
  ['MIG Wire 1.2mm', 'kg', 168], ['Argon Gas Cylinder', 'nos', 2400],
  ['CO2 Gas Cylinder', 'nos', 1900], ['Cutting Disc 4in', 'nos', 38],
  ['Grinding Disc 4in', 'nos', 52], ['Primer Paint', 'ltr', 210],
  ['Enamel Paint', 'ltr', 260], ['Thinner', 'ltr', 130],
  ['Zinc Spray', 'nos', 340], ['Anti-Rust Coating', 'ltr', 380],
]) {
  add({ category: 'Consumable', grade: null, name, base_uom: uom, purchase_uom: uom,
    rate, moq: 10, lead: 3 });
}

async function remove() {
  const r = await db.query(`DELETE FROM raw_materials WHERE material_code LIKE $1`, [`${MARK}%`]);
  console.log(`removed ${r.rowCount} catalogue items`);
}

async function seed() {
  const owner = (await db.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0]?.id || null;
  let created = 0, withWeight = 0, withFactor = 0;

  for (const [i, it] of items.entries()) {
    const code = `${MARK}${String(i + 1).padStart(4, '0')}`;
    // Derive the piece weight from physical facts rather than asking for it.
    const wpp = it.length_mm && it.width_mm && it.thickness_mm && it.density
      ? weightPerPiece({ length_mm: it.length_mm, width_mm: it.width_mm, thickness_mm: it.thickness_mm, density_kg_m3: it.density })
      : null;

    const { rows } = await db.query(
      `INSERT INTO raw_materials
         (owner_id, material_code, name, grade, unit, standard_rate, category,
          base_uom, purchase_uom, length_mm, width_mm, thickness_mm, density_kg_m3,
          weight_per_piece_kg, moq, lead_time_days, is_critical)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [owner, code, it.name, it.grade || null, it.base_uom, it.rate, it.category,
        it.base_uom, it.purchase_uom, it.length_mm || null, it.width_mm || null,
        it.thickness_mm || null, it.density || null, wpp, it.moq || null,
        it.lead || null, !!it.critical]
    );
    const id = rows[0].id;
    created++;
    if (wpp) withWeight++;

    /* Explicit per-item conversions — the ones that cannot be derived:
         1 box   = N pieces      (hardware)
         1 kg    = N pieces      (fasteners, so stored as pieces-per-kg)
         1 metre = N kg          (sections and pipes)  */
    const links = [];
    if (it.perBox) links.push(['box', it.perBox]);
    if (it.perKg) links.push(['kg', it.perKg]);
    if (it.kgPerM && it.base_uom === 'kg') links.push(['m', it.kgPerM]);
    if (it.kgPerM && it.base_uom === 'm') links.push(['kg', 1 / it.kgPerM]);
    for (const [uom, factor] of links) {
      await db.query(
        `INSERT INTO item_uom (raw_material_id, uom_code, qty_in_base, role)
         VALUES ($1,$2,$3,'purchase') ON CONFLICT DO NOTHING`,
        [id, uom, factor]
      );
      withFactor++;
    }
  }

  console.log(`seeded ${created} items`);
  console.log(`  ${withWeight} with a DERIVED weight per piece (from dimensions x density)`);
  console.log(`  ${withFactor} explicit unit conversions (box/kg/metre bridges)`);
}

(async () => {
  try {
    if (process.argv.includes('--remove')) await remove();
    else await seed();
  } catch (e) { console.error('failed:', e.message); }
  process.exit(0);
})();
