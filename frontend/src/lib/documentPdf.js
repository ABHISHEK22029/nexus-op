/* ══════════════════════════════════════════════════════════════════════
   Download PDF: a real A4 file, saved in one click.

   "PDF" used to open the browser's print dialog and rely on the person
   picking "Save as PDF" in it. On a phone that is three screens deep, the
   file was named whatever the dialog suggested, and the quotation had no
   PDF at all. The owner asked for "a proper PDF download".

   Why this way, of the ways on offer:
   · html2pdf (already a dependency) paints the page into a picture and
     slices it at fixed heights: rows cut in half, text that is no longer
     text, no table header on page two. print.css rules it out for the same
     reason.
   · Chrome on the server (Puppeteer) would copy the screen exactly, but the
     backend runs on Render's free plan, 512 MB and a tenth of a CPU. A
     headless Chrome is most of that and takes seconds to start.
   · window.print() stays, for paper. It is not a download.
   · pdfmake (this file) lays the document out itself, in the browser: real
     text, the item header repeated on every page, no row split across two,
     the closing block kept whole with the last rows carried over to it,
     and a file called "Quotation QT-0007 - Customer.pdf". It loads only
     when somebody clicks Download, so the app does not get heavier.

   The cost: the PDF is drawn from the page's data, not from the page. Each
   document page builds the model below from exactly the values it shows,
   so the two cannot disagree on a figure.
   ══════════════════════════════════════════════════════════════════════ */

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* A4 with the same margins as print.css (12mm top, 10mm sides, 14mm foot),
   plus room at the foot for the page number. */
const MM = 72 / 25.4;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = [10 * MM, 12 * MM, 10 * MM, 16 * MM];
const INSET = 6;               // content inside the invoice's black frame

const INK = '#000000';
const SOFT = '#333333';
const MUTED = '#666666';
const LIGHT = '#cfcfcf';
const BAND = '#f1f1f1';

let loader = null;
function loadPdfMake() {
  if (!loader) {
    loader = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([m, f]) => {
        const pdfMake = m.default || m;
        const vfs = f.default || f;
        if (pdfMake.addVirtualFileSystem) pdfMake.addVirtualFileSystem(vfs); else pdfMake.vfs = vfs;
        return pdfMake;
      })
      .catch((e) => { loader = null; throw e; });
  }
  return loader;
}

/** "Quotation QT-0007 - Sahasra Infra.pdf" — what a person would call it.
    Slashes are legal in a GST invoice number (KBS/26-27/001) and not in a
    file name. */
export function docFileName(kind, number, party) {
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return [`${clean(kind)} ${clean(number)}`.trim(), clean(party)].filter(Boolean).join(' - ');
}

/* Print, with a file name. Chrome names a "Save as PDF" from the print
   dialog after the page title, so the title is the document for as long as
   the dialog is open: "Tax Invoice INV-0004 - Customer.pdf", not
   "Maks Ops.pdf". */
export function printAs(title) {
  const prev = document.title;
  if (title) document.title = title;
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

/* A word with no space in it (a row of asterisks, a pasted link, a long
   unit code) cannot be broken, so it ran out of its box. A zero-width
   space every 20 characters gives the line-breaker somewhere to break. */
const soft = (s) => String(s ?? '').replace(/\S{21,}/g, (w) => w.replace(/(.{20})/g, '$1​'));

/* The logo, as something pdfmake can embed (PNG or JPEG only): fetched the
   way CompanyLogo fetches it and redrawn as a PNG, which also covers WebP
   and SVG uploads. No logo, or one that will not load, is not an error. */
async function logoDataUrl(fallbackUrl) {
  try {
    const token = localStorage.getItem('nexus_token');
    let r = await fetch(`${API}/company-profile/logo`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok && fallbackUrl) r = await fetch(fallbackUrl);
    if (!r.ok) return null;
    const url = URL.createObjectURL(await r.blob());
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url;
      });
      const scale = Math.min(1, 600 / (img.naturalWidth || 600));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || 300) * scale));
      c.height = Math.max(1, Math.round((img.naturalHeight || 100) * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    } finally { URL.revokeObjectURL(url); }
  } catch { return null; }
}

/* ── pieces ─────────────────────────────────────────────────────────── */

const hairline = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6,
  hLineColor: () => LIGHT, vLineColor: () => LIGHT,
  paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 5, paddingBottom: () => 5,
};

function letterhead(m, logo) {
  const co = m.company || {};
  const reg = [co.gstin && ['GSTIN: ', co.gstin], co.pan && ['PAN: ', co.pan]].filter(Boolean);
  const detail = [
    co.address && { text: soft(co.address) },
    reg.length && { text: reg.flatMap(([l, v], i) => [i ? ' · ' : '', l, { text: v, bold: true }]) },
    co.udyam_msme_no && { text: ['Udyam/MSME: ', { text: co.udyam_msme_no, bold: true }] },
    (co.phone || co.email) && { text: [co.phone ? `Ph: ${co.phone}` : '', co.phone && co.email ? ' · ' : '', co.email || ''].join('') },
  ].filter(Boolean);
  const who = { stack: [{ text: co.name || '—', fontSize: 13, bold: true, margin: [0, 0, 0, 2] }, { stack: detail, fontSize: 7.5, color: SOFT, lineHeight: 1.2 }] };
  return {
    columns: [
      logo ? { width: 'auto', image: logo, fit: [90, 40], margin: [0, 0, 8, 0] } : { width: 0, text: '' },
      { width: '*', ...who },
      {
        width: 'auto',
        stack: [
          { text: m.title, fontSize: 13, bold: true, characterSpacing: 1.2, alignment: 'right', margin: [0, 0, 0, 4] },
          ...(m.meta || []).filter(Boolean).map(([l, v]) => ({ text: [`${l}: `, { text: String(v ?? '—'), bold: true }], fontSize: 8, alignment: 'right', margin: [0, 0, 0, 1.5] })),
        ],
      },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 8],
  };
}

function parties(m) {
  const list = (m.parties || []).filter(Boolean);
  if (!list.length) return null;
  const cell = (p) => ({
    stack: [
      { text: p.name || '—', bold: true, fontSize: 9, margin: [0, 0, 0, 1] },
      ...((p.lines || []).filter(Boolean).map((l) => ({ text: soft(l), fontSize: 7.5, color: SOFT }))),
      p.gstin !== undefined ? { text: ['GSTIN: ', { text: p.gstin || 'Unregistered', bold: true }], fontSize: 7.5 } : null,
    ].filter(Boolean),
  });
  const head = (p) => ({ text: [p.title.toUpperCase(), p.note ? { text: ` ${p.note}`, bold: false } : ''], bold: true, fontSize: 6.5, characterSpacing: 0.6, fillColor: BAND });
  const cols = list.length === 1 ? [...list, null] : list;
  return {
    table: {
      widths: cols.map(() => '*'),
      body: [cols.map((p) => (p ? head(p) : { text: '', border: [false, false, false, false] })),
        cols.map((p) => (p ? cell(p) : { text: '', border: [false, false, false, false] }))],
    },
    layout: {
      hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => INK, vLineColor: () => INK,
      paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 3, paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 6],
  };
}

function facts(m) {
  const f = (m.facts || []).filter(Boolean);
  if (!f.length) return null;
  return {
    text: f.flatMap(([l, v], i) => [i ? '      ' : '', `${l}: `, { text: String(v ?? '—'), bold: true }]),
    fontSize: 8, margin: [0, 0, 0, 6],
  };
}

/* The item table. `widths` is passed on the second pass so that the rows
   carried over to the closing block line up with the table above them. */
function itemTable(m, rows, { widths, lastRowId } = {}) {
  const cols = m.columns;
  const head = cols.map((c) => ({ text: c.label.toUpperCase(), bold: true, fontSize: 7, characterSpacing: 0.4, alignment: c.align || 'left', fillColor: BAND, noWrap: c.align === 'right' }));
  const body = rows.map((r, ri) => r.map((v, ci) => {
    const c = cols[ci];
    const cell = {
      text: c.align === 'right' ? String(v ?? '') : soft(v),
      fontSize: 8.5, alignment: c.align || 'left',
      bold: !!c.strong || (c.key === 'description' && m.boldDescription),
      noWrap: c.align === 'right',
      color: c.muted ? SOFT : INK,
    };
    if (ci === 0 && ri === rows.length - 1 && lastRowId) cell.id = lastRowId;
    return cell;
  }));
  return {
    table: {
      headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1,
      widths: widths || cols.map((c) => (c.key === 'description' ? '*' : 'auto')),
      body: [head, ...body],
    },
    layout: {
      ...hairline,
      hLineWidth: (i) => (i === 1 ? 1.2 : 0.6),
      hLineColor: (i) => (i === 1 ? INK : LIGHT),
      vLineWidth: () => 0,
      paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3.5, paddingBottom: () => 3.5,
    },
  };
}

function box(title, content) {
  return {
    table: { widths: ['*'], body: [[{ stack: [{ text: title.toUpperCase(), bold: true, fontSize: 6.5, color: MUTED, characterSpacing: 0.6, margin: [0, 0, 0, 3] }, content] }]] },
    layout: hairline,
  };
}

function closing(m) {
  const totals = {
    table: {
      widths: ['auto', 'auto'],
      body: (m.totals || []).filter(Boolean).map((t) => [
        { text: t.label, bold: true, alignment: 'right', fillColor: t.strong ? '#e6e6e6' : '#f7f7f7', fontSize: t.strong ? 9.5 : 8.5, noWrap: true },
        { text: t.value, alignment: 'right', bold: !!t.strong, fillColor: t.strong ? '#e6e6e6' : null, fontSize: t.strong ? 9.5 : 8.5, noWrap: true },
      ]),
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
      vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0.8 : 0),
      hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? INK : LIGHT),
      vLineColor: () => INK,
      paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 2.5, paddingBottom: () => 2.5,
    },
  };
  const notes = m.notes ? { stack: [{ text: 'Notes', bold: true, fontSize: 8, margin: [0, 0, 0, 2] }, { text: soft(m.notes), fontSize: 7.5, color: SOFT }] } : { text: '' };

  const bank = m.bank && (m.bank.rows || []).length ? box(m.bank.title, {
    table: { widths: ['auto', '*'], body: m.bank.rows.map(([l, v]) => [{ text: l, color: MUTED, fontSize: 7.5 }, { text: soft(v), bold: true, fontSize: 7.5 }]) },
    layout: 'noBorders',
  }) : null;
  const terms = m.terms && m.terms.text ? box(m.terms.title || 'Terms & Conditions', { text: soft(m.terms.text), fontSize: 7.5, color: SOFT }) : null;
  const irn = m.irn ? box('IRN', { text: soft(m.irn), fontSize: 6.5 }) : null;
  const right = [irn, terms].filter(Boolean);

  return {
    id: 'closing',
    stack: [
      { columns: [{ width: '*', ...notes }, { width: 'auto', ...totals }], columnGap: 14, margin: [0, 8, 0, 0] },
      m.words ? {
        table: { widths: ['*'], body: [[{ text: m.words, italics: true, fontSize: 8, fillColor: '#f7f7f7' }]] },
        layout: { hLineWidth: () => 0.6, vLineWidth: (i) => (i === 0 ? 2.5 : 0.6), hLineColor: () => INK, vLineColor: () => INK, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 8, 0, 0],
      } : null,
      ...((m.lines || []).filter(Boolean).map((l) => ({ text: [{ text: `${l[0]}: `, bold: true }, soft(l[1])], fontSize: 8, margin: [0, 6, 0, 0] }))),
      (bank || right.length) ? {
        /* Same order as the page: the invoice puts the bank first, the
           quotation its terms. */
        columns: (() => {
          const b = bank ? { width: '*', stack: [bank] } : { width: '*', text: '' };
          const t = right.length ? { width: '*', stack: right.map((r, i) => ({ ...r, margin: [0, i ? 6 : 0, 0, 0] })) } : { width: '*', text: '' };
          return m.termsFirst ? [t, b] : [b, t];
        })(),
        columnGap: 10, margin: [0, 8, 0, 0],
      } : null,
      m.notice ? {
        table: { widths: ['*'], body: [[{ text: Array.isArray(m.notice) ? [{ text: m.notice[0], bold: true, color: INK }, ' ', m.notice[1]] : m.notice, fontSize: 7.5, color: SOFT, fillColor: '#f9fafb' }]] },
        layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#9ca3af', vLineColor: () => '#9ca3af', hLineStyle: () => ({ dash: { length: 3 } }), vLineStyle: () => ({ dash: { length: 3 } }), paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5 },
        margin: [0, 8, 0, 0],
      } : null,
      {
        columns: [
          m.receiver ? { width: 170, stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.6 }], margin: [0, 26, 0, 3] }, { text: m.receiver, fontSize: 7.5, color: SOFT }] } : { width: '*', text: '' },
          { width: '*', text: '' },
          { width: 170, stack: [
            { canvas: [{ type: 'line', x1: 10, y1: 0, x2: 160, y2: 0, lineWidth: 0.6 }], margin: [0, 26, 0, 3] },
            { text: 'Authorized Signatory', fontSize: 8, color: SOFT, alignment: 'center' },
            { text: `For ${(m.company || {}).name || '—'}`, fontSize: 8.5, bold: true, alignment: 'center', margin: [0, 6, 0, 0] },
          ] },
        ],
        margin: [0, 10, 0, 0],
      },
      {
        table: { widths: ['*', 'auto'], body: [[{ text: soft(m.footerLeft || ''), fontSize: 7, color: SOFT }, { text: m.footerRight || '', fontSize: 7, bold: true, alignment: 'right', noWrap: true }]] },
        layout: { hLineWidth: (i) => (i === 0 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => INK, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4, fillColor: () => BAND },
        margin: [0, 8, 0, 0],
      },
    ].filter(Boolean),
  };
}

function definition(m, logo, { carry = 0, widths } = {}) {
  const rows = m.rows || [];
  const split = carry ? rows.length - carry : rows.length;
  const main = rows.slice(0, split);
  const tail = rows.slice(split);
  const framed = !!m.framed;
  const margins = framed ? [MARGIN[0] + INSET, MARGIN[1] + INSET, MARGIN[2] + INSET, MARGIN[3] + INSET] : MARGIN;
  const content = [
    letterhead(m, logo),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W - margins[0] - margins[2], y2: 0, lineWidth: 1.4 }], margin: [0, 0, 0, 8] },
    parties(m),
    facts(m),
    ...(m.before || []),
  ].filter(Boolean);
  if (!carry) {
    content.push(itemTable(m, rows, { lastRowId: 'last-row' }), closing(m));
  } else {
    if (main.length) content.push(itemTable(m, main, { widths }));
    /* The carried rows and everything after them start a fresh page
       together. They come with their own header row, so the new page
       reads as a continuation of the table above. */
    content.push({ stack: [itemTable(m, tail, { widths }), closing(m)], pageBreak: 'before' });
  }
  return {
    pageSize: 'A4',
    pageMargins: margins,
    info: { title: m.fileName, author: (m.company || {}).name || '', subject: m.title },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.15, color: INK },
    background: framed ? () => ({
      canvas: [{ type: 'rect', x: MARGIN[0], y: MARGIN[1], w: PAGE_W - MARGIN[0] - MARGIN[2], h: PAGE_H - MARGIN[1] - MARGIN[3], lineWidth: 1.4, lineColor: INK }],
    }) : undefined,
    footer: (page, pages) => ({
      text: pages > 1 ? `${m.number || ''} · Page ${page} of ${pages}` : '',
      fontSize: 7, color: MUTED, alignment: 'right', margin: [MARGIN[0], 8 * MM * 0.6, MARGIN[2], 0],
    }),
    content,
  };
}

const blobOf = (pdfMake, dd) => new Promise((resolve, reject) => {
  try { pdfMake.createPdf(dd).getBlob(resolve); } catch (e) { reject(e); }
});

/**
 * Lay the document out and save it as `${model.fileName}.pdf`.
 *
 * Laid out once as it comes. If the closing block (totals → signature)
 * then does not sit on the page where the item table ends, it is laid out
 * again with the last rows moved over to start a page with it: the block
 * never splits and never stands on a page alone.
 */
export async function downloadDocumentPdf(model) {
  const [pdfMake, logo] = await Promise.all([loadPdfMake(), logoDataUrl(model.company?.logo_url || null)]);
  const seen = {};
  const first = definition(model, logo);
  first.pageBreakBefore = (node) => { if (node.id) seen[node.id] = node.pageNumbers; return false; };
  let blob = await blobOf(pdfMake, first);

  const n = (model.rows || []).length;
  const lastPage = (seen['last-row'] || [])[0];
  const closingPages = seen.closing || [];
  const apart = n > 0 && lastPage != null && closingPages.some((p) => p !== lastPage);
  if (apart) {
    /* The widths the first layout settled on, so both halves agree. */
    const table = first.content.find((c) => c && c.table && c.table.headerRows === 1);
    const widths = table ? table.table.widths.map((w) => (typeof w === 'object' && w._calcWidth != null ? w._calcWidth : w)) : undefined;
    blob = await blobOf(pdfMake, definition(model, logo, { carry: n >= 3 ? 2 : 1, widths }));
  }

  const name = `${model.fileName || 'document'}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { name, carried: apart };
}
