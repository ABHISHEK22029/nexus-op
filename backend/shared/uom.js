/* ══════════════════════════════════════════════════════════
   uom — unit conversion.

   Steel is bought by weight, stocked by piece, and consumed by either.
   Without this, "the BOM needs 4 kg" and "we have 2000 pieces" are numbers
   that cannot be compared — which is exactly the state the deficiency engine
   would have inherited.

   Two kinds of conversion:
     WITHIN a dimension   1 MT = 1000 kg          — universal, from `uom`
     ACROSS dimensions    1 sheet = 29.74 kg      — item-specific, from
                          `item_uom` or derived from dimensions x density

   Design rule: when a conversion cannot be established, return null and say
   why. Never fall back to 1:1 — silently treating tonnes as pieces is the
   worst possible failure here.
   ══════════════════════════════════════════════════════════ */

const round = (n, dp = 6) => {
  const f = 10 ** dp;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};

/**
 * Weight of one piece, derived from its dimensions and density.
 *   kg = (L/1000) * (W/1000) * (T/1000) * density
 * Works for sheets, plates and flats. Returns null if anything is missing.
 */
function weightPerPiece({ length_mm, width_mm, thickness_mm, density_kg_m3 }) {
  const L = Number(length_mm), W = Number(width_mm), T = Number(thickness_mm), D = Number(density_kg_m3);
  if (!L || !W || !T || !D) return null;
  return round((L / 1000) * (W / 1000) * (T / 1000) * D, 4);
}

/**
 * Convert a quantity between units for a given item.
 *
 * @param {number} qty
 * @param {string} fromCode
 * @param {string} toCode
 * @param {object} ctx
 * @param {Map}    ctx.uoms      code -> { dimension, factor_to_base }
 * @param {object} ctx.item      raw_materials row (for base_uom + weight_per_piece_kg)
 * @param {Array}  ctx.itemUoms  item_uom rows for this item
 * @returns {{ok:true, qty:number, ...}|{ok:false, reason:string}}
 */
function convert(qty, fromCode, toCode, { uoms, item = {}, itemUoms = [] } = {}) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return { ok: false, reason: 'Quantity is not a number' };

  const from = String(fromCode || '').toLowerCase();
  const to = String(toCode || '').toLowerCase();
  if (!from || !to) return { ok: false, reason: 'Missing unit' };
  if (from === to) return { ok: true, qty: round(n), via: 'identity' };

  const uFrom = uoms.get(from);
  const uTo = uoms.get(to);
  if (!uFrom) return { ok: false, reason: `Unknown unit "${fromCode}"` };
  if (!uTo) return { ok: false, reason: `Unknown unit "${toCode}"` };

  const base = String(item.base_uom || '').toLowerCase();
  const uBase = uoms.get(base);

  // Explicit conversions win over derived ones — a user-entered factor is a
  // deliberate statement about this item.
  const bridge = (code) => {
    const row = itemUoms.find(r => String(r.uom_code).toLowerCase() === code);
    return row ? Number(row.qty_in_base) : null;
  };

  /* ── Same dimension: pure ratio ──
     Skipped when either side has an explicit per-item factor. A "box" and a
     "piece" are both counts, but 1 box = 10 pieces for THIS item — taking the
     generic ratio first would silently return 3 instead of 30. */
  const hasExplicit = bridge(from) != null || bridge(to) != null;
  if (uFrom.dimension === uTo.dimension && !hasExplicit) {
    return {
      ok: true,
      qty: round((n * Number(uFrom.factor_to_base)) / Number(uTo.factor_to_base)),
      via: `${uFrom.dimension} ratio`,
    };
  }

  // Fall back to the derived piece<->weight factor for count/weight pairs.
  const wpp = item.weight_per_piece_kg != null
    ? Number(item.weight_per_piece_kg)
    : weightPerPiece(item);

  /** qty of `code` -> qty in the item's base unit */
  const toBase = (value, code, u) => {
    const explicit = bridge(code);
    if (explicit != null) return value * explicit;
    if (uBase && u.dimension === uBase.dimension) {
      return (value * Number(u.factor_to_base)) / Number(uBase.factor_to_base);
    }
    // count <-> weight, via weight per piece
    if (wpp) {
      if (uBase?.dimension === 'count' && u.dimension === 'weight') {
        const kg = (value * Number(u.factor_to_base)) / Number(uoms.get('kg').factor_to_base);
        return kg / wpp;                       // kg -> pieces
      }
      if (uBase?.dimension === 'weight' && u.dimension === 'count') {
        const pieces = value * Number(u.factor_to_base);
        const kg = pieces * wpp;
        return kg / Number(uBase.factor_to_base); // pieces -> base weight unit
      }
    }
    return null;
  };

  /** qty in the item's base unit -> qty of `code` */
  const fromBase = (value, code, u) => {
    const explicit = bridge(code);
    if (explicit != null) return value / explicit;
    if (uBase && u.dimension === uBase.dimension) {
      return (value * Number(uBase.factor_to_base)) / Number(u.factor_to_base);
    }
    if (wpp) {
      if (uBase?.dimension === 'count' && u.dimension === 'weight') {
        const kg = value * wpp;                // pieces -> kg
        return (kg * Number(uoms.get('kg').factor_to_base)) / Number(u.factor_to_base);
      }
      if (uBase?.dimension === 'weight' && u.dimension === 'count') {
        const kg = value * Number(uBase.factor_to_base);
        return kg / wpp;
      }
    }
    return null;
  };

  const inBase = toBase(n, from, uFrom);
  if (inBase == null) {
    return { ok: false, reason: `No conversion from "${fromCode}" to the item's base unit (${item.base_uom || 'unset'}). Set a weight per piece or an explicit factor.` };
  }
  const out = fromBase(inBase, to, uTo);
  if (out == null) {
    return { ok: false, reason: `No conversion from the item's base unit (${item.base_uom || 'unset'}) to "${toCode}".` };
  }
  return { ok: true, qty: round(out), via: wpp ? `via base ${item.base_uom} (1 pc = ${wpp} kg)` : `via base ${item.base_uom}` };
}

/** Load the canonical unit table once and hand back a lookup Map. */
async function loadUoms(db) {
  const { rows } = await db.query('SELECT code, dimension, factor_to_base FROM uom');
  return new Map(rows.map(r => [r.code, r]));
}

/** Everything convert() needs for one item. */
async function itemContext(db, rawMaterialId, uoms) {
  const item = (await db.query('SELECT * FROM raw_materials WHERE id = $1', [rawMaterialId])).rows[0] || {};
  const itemUoms = (await db.query('SELECT uom_code, qty_in_base, role FROM item_uom WHERE raw_material_id = $1', [rawMaterialId])).rows;
  return { uoms: uoms || await loadUoms(db), item, itemUoms };
}

module.exports = { convert, weightPerPiece, loadUoms, itemContext, round };
