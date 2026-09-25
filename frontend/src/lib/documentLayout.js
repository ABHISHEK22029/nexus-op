/* ══════════════════════════════════════════════════════════════════════
   What a printed document is made of, as data rather than markup.

   The columns of the item table, their order, their alignment and their
   widths were written out by hand in every document page. Matching a
   customer's own template then meant editing JSX in seven files and hoping
   the totals block was changed to agree with the table above it.

   Here each document is a definition: a title, the columns of its item
   table, and the rows of its totals block. Matching a different template —
   the Tax Invoice layout in Tenplate.xlsx, or a particular customer's — is
   editing this file, or shipping a second definition beside it, rather than
   rewriting a page.

   Two rules the definitions encode, because both were got wrong in the
   source template this was built from:

   · TOTALS SUM THE ITEM RANGE. The spreadsheet this mirrors reads row 24
     directly (`=+W24`), so it is correct with one line item and wrong with
     two. Nothing here may reference a fixed row.

   · TAX LABELS FOLLOW THE PLACE OF SUPPLY. That template charges 18% under
     an "IGST" column and then prints it against "Add: CGST @9%", with SGST
     hardcoded to zero — an interstate sale labelled as an intrastate one.
     The totals rows below are chosen by `interstate`, which the server has
     already worked out from the ship-to state.

   Widths are proportions of the table, not pixels, so the same definition
   prints on A4 and renders on a screen.
   ══════════════════════════════════════════════════════════════════════ */

const money = { align: 'right', numeric: true };

/* The item table as the Tax Invoice template lays it out: serial,
   description, HSN, unit, quantity, rate, amount. Tax per line is not
   shown — this product charges one rate across the document, and a tax
   column repeating the same percentage on every row is a column of noise. */
const ITEM_COLUMNS = [
  { key: 'index', label: '#', width: 4, align: 'left' },
  { key: 'description', label: 'Description', width: 40, align: 'left' },
  { key: 'hsn', label: 'HSN', width: 10, align: 'left' },
  { key: 'uom', label: 'UOM', width: 8, align: 'center' },
  { key: 'quantity', label: 'Qty', width: 10, ...money, decimals: 3, trimZeros: true },
  { key: 'rate', label: 'Rate', width: 13, ...money },
  { key: 'amount', label: 'Amount', width: 15, ...money, strong: true },
];

/* Totals, in the order they are read. `when` decides whether a row appears
   at all, so a document with no discount does not print an empty line
   labelled Discount. */
const TOTALS = [
  { key: 'sub_total', label: 'Sub-total' },
  { key: 'discount', label: 'Discount', sign: '−', when: (d) => Number(d.discount) > 0 },
  { key: 'igst', label: (d) => `IGST (${d.gst_rate}%)`, when: (d) => d.interstate },
  { key: 'cgst', label: (d) => `CGST (${Number(d.gst_rate) / 2}%)`, when: (d) => !d.interstate },
  { key: 'sgst', label: (d) => `SGST (${Number(d.gst_rate) / 2}%)`, when: (d) => !d.interstate },
  { key: 'round_off', label: 'Round-off', when: (d) => Number(d.round_off) !== 0 },
  { key: 'net_amount', label: 'Total', strong: true },
];

export const DOCUMENT_LAYOUTS = {
  quotation: {
    title: 'QUOTATION',
    numberField: 'quote_number',
    dateField: 'quote_date',
    columns: ITEM_COLUMNS,
    totals: TOTALS,
    /* A quotation is not a supply, so no place-of-supply strip and no
       claim to input tax credit. Stated rather than implied. */
    sections: ['header', 'party', 'items', 'totals', 'amountInWords', 'bank', 'terms', 'signature'],
    notATaxInvoice: true,
  },
  taxInvoice: {
    title: 'TAX INVOICE',
    numberField: 'invoice_number',
    dateField: 'invoice_date',
    columns: ITEM_COLUMNS,
    totals: TOTALS,
    sections: ['header', 'taxMeta', 'party', 'shipTo', 'items', 'totals', 'amountInWords', 'bank', 'terms', 'signature'],
    notATaxInvoice: false,
  },
};

/** The label for a totals row, which may depend on the document. */
export const labelOf = (row, doc) => (typeof row.label === 'function' ? row.label(doc) : row.label);

/** Which totals rows this document actually shows. */
export const visibleTotals = (layout, doc) =>
  layout.totals.filter(r => (r.when ? r.when(doc) : true));

/**
 * Add up a column across the item rows.
 *
 * Exported mainly so it is obvious there is one: the template this mirrors
 * takes its totals from a single fixed row, which is right until somebody
 * adds a second line item.
 */
export const sumColumn = (items, key) =>
  Math.round((items || []).reduce((s, it) => s + (Number(it[key]) || 0), 0) * 100) / 100;

/** Percentage widths → the `width` attribute a table understands. */
export const colWidth = (col, columns) => {
  const total = columns.reduce((s, c) => s + (c.width || 0), 0) || 1;
  return `${Math.round((col.width || 0) / total * 1000) / 10}%`;
};
