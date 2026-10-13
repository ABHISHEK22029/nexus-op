/* ══════════════════════════════════════════════════════════
   fileSafety — what an uploaded file really is, and how it is served.

   Files were stored with the type the uploader's browser claimed and served
   back inline with that type. An HTML or SVG file "attached" to an order
   would then run as a page inside the app when opened — able to read the
   signed-in owner's session from localStorage. Now:

   · the type is read from the file's own first bytes, not the claim;
   · only documents, spreadsheets, images and plain text are accepted;
   · it is served with nosniff and a sandboxing CSP, and anything that is
     not a PDF or a picture downloads instead of opening.
   ══════════════════════════════════════════════════════════ */

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ext = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || '';

/* A file that claims to be text must look like text: no NUL bytes, and no
   markup a browser would run. */
const looksLikeText = (buf) => {
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  if (head.includes(0)) return false;
  const s = head.toString('utf8').toLowerCase();
  return !/<\s*(script|html|svg|iframe|object|embed|body|!doctype)/.test(s);
};

/**
 * The real, safe type of an upload — or null when it is not one we keep.
 * @returns {{ mime: string, inline: boolean } | null}
 */
function detect(filename, buf) {
  if (!buf || !buf.length) return null;
  const e = ext(filename);
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', inline: true };            // %PDF
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', inline: true };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', inline: true };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', inline: true };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', inline: true };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {                                                            // a zip: Office files
    if (e === 'xlsx') return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false };
    if (e === 'docx') return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false };
    if (e === 'pptx') return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false };
    return null;
  }
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) {                                                            // old Office
    if (e === 'xls') return { mime: 'application/vnd.ms-excel', inline: false };
    if (e === 'doc') return { mime: 'application/msword', inline: false };
    return null;
  }
  if ((e === 'csv' || e === 'txt' || e === 'tsv') && looksLikeText(buf)) {
    return { mime: e === 'csv' ? 'text/csv' : 'text/plain', inline: false };
  }
  return null;
}

const ACCEPTED = 'PDF, images (PNG, JPG, GIF, WebP), Excel, Word, CSV or plain text';

/* Send a stored file safely. The stored type is not trusted — older rows
   kept whatever the browser claimed — so it is read again from the bytes. */
function send(res, { filename, data, cache = 'private, max-age=300' }) {
  const t = detect(filename, data) || { mime: 'application/octet-stream', inline: false };
  const name = String(filename || 'file').replace(/["\r\n\\]/g, '');
  res.setHeader('Content-Type', t.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  /* Even if a browser were persuaded to render it as a page, it gets no
     script, no plugins and an opaque origin. */
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${t.inline ? 'inline' : 'attachment'}; filename="${name}"`);
  if (cache) res.setHeader('Cache-Control', cache);
  res.send(data);
}

module.exports = { detect, send, ACCEPTED };
