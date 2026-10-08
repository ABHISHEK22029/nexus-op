/* Units of measure — the same codes as the database's `uom` table
   (backend/migrations/029_uom_system.sql), grouped the way a person looks
   for one. Every line-item form picks from this list, so a unit is always
   a unit: the free-text box it replaced took "123333333444444445555555".

   A value already stored that is not in the list (an older document) is
   still shown and kept by UnitSelect, so editing an old invoice never
   silently changes its unit. */
export const UNIT_GROUPS = [
  ['Count', [['nos', 'nos — numbers / pieces'], ['set', 'set'], ['pair', 'pair'], ['dozen', 'dozen'], ['box', 'box'], ['sheet', 'sheet']]],
  ['Weight', [['kg', 'kg — kilogram'], ['g', 'g — gram'], ['mt', 'mt — metric tonne'], ['quintal', 'quintal']]],
  ['Length', [['m', 'm — metre'], ['mm', 'mm'], ['cm', 'cm'], ['ft', 'ft'], ['inch', 'inch'], ['metre', 'metre (run)']]],
  ['Area', [['sqm', 'sqm — square metre'], ['sqft', 'sqft — square foot']]],
  ['Volume', [['m3', 'm3 — cubic metre'], ['cum', 'cum'], ['ltr', 'ltr — litre']]],
];

export const UNIT_CODES = UNIT_GROUPS.flatMap(([, list]) => list.map(([code]) => code));

/** The stored value if it is a known unit, matched without regard to case. */
export const knownUnit = (v) => UNIT_CODES.find((c) => c.toLowerCase() === String(v || '').trim().toLowerCase()) || null;
