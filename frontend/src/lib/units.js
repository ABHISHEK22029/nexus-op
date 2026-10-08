/* Units of measure — the same codes as the database's `uom` table
   (backend/migrations/029_uom_system.sql), grouped the way a person looks
   for one. Every line-item form picks from this list, so a unit is always
   a unit: the free-text box it replaced took "123333333444444445555555".

   A value already stored that is not in the list (an older document) is
   still shown and kept by UnitSelect, so editing an old invoice never
   silently changes its unit. */
export const UNIT_GROUPS = [
  /* Short labels: a line's unit column is narrow, and the closed select shows
     the label — "nos — numbers / pieces" read "nos — number". The group names
     say what kind of unit each one is. */
  ['Count (pieces)', [['nos', 'nos'], ['set', 'set'], ['pair', 'pair'], ['dozen', 'dozen'], ['box', 'box'], ['sheet', 'sheet']]],
  ['Weight', [['kg', 'kg'], ['g', 'g'], ['mt', 'mt (tonne)'], ['quintal', 'quintal']]],
  ['Length', [['m', 'm'], ['mm', 'mm'], ['cm', 'cm'], ['ft', 'ft'], ['inch', 'inch'], ['metre', 'metre (run)']]],
  ['Area', [['sqm', 'sqm'], ['sqft', 'sqft']]],
  ['Volume', [['m3', 'm3'], ['cum', 'cum'], ['ltr', 'ltr']]],
];

export const UNIT_CODES = UNIT_GROUPS.flatMap(([, list]) => list.map(([code]) => code));

/** The stored value if it is a known unit, matched without regard to case. */
export const knownUnit = (v) => UNIT_CODES.find((c) => c.toLowerCase() === String(v || '').trim().toLowerCase()) || null;

/* How people write the same unit — the table the stock sheet reader uses
   (backend/shared/stockSheet.js). "Kgs", "kg" and "Kilograms" are one unit;
   comparing them as text would call them three. */
const ALIASES = {
  nos: ['nos', 'no', "no's", 'number', 'numbers', 'pcs', 'pc', 'piece', 'pieces', 'ea', 'each', 'unit', 'units'],
  set: ['set', 'sets'], pair: ['pair', 'pairs', 'pr'], dozen: ['dozen', 'doz', 'dz'],
  box: ['box', 'boxes', 'bx'], sheet: ['sheet', 'sheets', 'sht', 'shts'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'], g: ['g', 'gm', 'gms', 'gram', 'grams', 'gr'],
  mt: ['mt', 'mts', 'tonne', 'tonnes', 'ton', 'tons', 'metric ton', 'metric tonne'], quintal: ['quintal', 'quintals', 'qtl'],
  m: ['m', 'mtr', 'mtrs', 'meter', 'meters', 'metres', 'rmt', 'rm'], mm: ['mm'], cm: ['cm'],
  ft: ['ft', 'feet', 'foot', 'rft'], inch: ['inch', 'inches'],
  sqm: ['sqm', 'sq m', 'square metre', 'square meter', 'm2'], sqft: ['sqft', 'sq ft', 'sft', 'square feet', 'square foot'],
  m3: ['m3', 'cubic metre', 'cubic meter', 'cbm'], cum: ['cum'], ltr: ['ltr', 'ltrs', 'l', 'litre', 'litres', 'liter', 'liters', 'lit'],
};
const LOOKUP = new Map(Object.entries(ALIASES).flatMap(([code, list]) => list.map((a) => [a, code])));

/** The standard code for however a unit was written, or the text itself, lower case. */
export const unitCode = (v) => {
  const raw = String(v || '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return knownUnit(raw) || LOOKUP.get(raw) || LOOKUP.get(raw.replace(/ /g, '')) || raw;
};
