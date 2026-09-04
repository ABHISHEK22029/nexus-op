/* ══════════════════════════════════════════════════════════════════════
   probe-photo-upload — CAN this backend take a product photo, store it,
   and give it back?

   Answered by doing it, not by reading the code. Generates real PNGs of
   several sizes, pushes them through the existing /attachments endpoint,
   reads them back, and checks the bytes match — then measures what a
   catalogue-sized page of them actually costs.

   Usage: BASE=… EMAIL=… PASSWORD=… node scripts/probe-photo-upload.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const zlib = require('zlib');

const BASE = process.env.BASE || 'http://localhost:5099';

/* A real, valid PNG of roughly the requested size — not random bytes, so
   the mime type and anything that sniffs it behave as they would for a
   genuine product photo. */
function makePng(targetBytes) {
  const side = Math.max(8, Math.round(Math.sqrt(targetBytes / 3)));
  const raw = Buffer.alloc(side * (side * 3 + 1));
  for (let y = 0; y < side; y++) {
    const row = y * (side * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < side; x++) {
      const p = row + 1 + x * 3;
      raw[p] = (x * 7) & 255; raw[p + 1] = (y * 11) & 255; raw[p + 2] = ((x + y) * 13) & 255;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 1 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crcTable = makePng._t || (makePng._t = (() => {
      const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t;
    })());
    let c = 0xFFFFFFFF;
    for (const b of td) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xFFFFFFFF) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

(async () => {
  const token = await (await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
  })).json().then(d => d.token);
  if (!token) { console.error('could not sign in'); process.exit(1); }
  const auth = { Authorization: `Bearer ${token}` };

  const { rows: sku } = await db.query('SELECT id, name FROM skus ORDER BY id LIMIT 1');
  if (!sku[0]) { console.error('no product to attach to'); process.exit(1); }
  console.log(`\n  attaching to product #${sku[0].id} "${sku[0].name}"\n`);

  const made = [];
  console.log('  size        upload    read back   bytes match');
  console.log('  ' + '─'.repeat(52));

  for (const target of [40 * 1024, 250 * 1024, 1024 * 1024, 4 * 1024 * 1024]) {
    const png = makePng(target);
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), `product-${png.length}.png`);
    form.append('entityType', 'sku');
    form.append('entityId', String(sku[0].id));

    const t0 = performance.now();
    const res = await fetch(`${BASE}/attachments`, { method: 'POST', headers: auth, body: form });
    const up = performance.now() - t0;
    if (!res.ok) {
      console.log(`  ${kb(png.length).padEnd(11)} FAILED  ${res.status} ${(await res.text()).slice(0, 60)}`);
      continue;
    }
    const meta = await res.json();
    made.push(meta.id);

    const t1 = performance.now();
    const back = await fetch(`${BASE}/attachments/${meta.id}/download`, { headers: auth });
    const buf = Buffer.from(await back.arrayBuffer());
    const down = performance.now() - t1;

    console.log(`  ${kb(png.length).padEnd(11)}${(up.toFixed(0) + 'ms').padStart(7)}${(down.toFixed(0) + 'ms').padStart(11)}      ${buf.equals(png) ? '✅ identical' : '❌ CORRUPTED'}`);
  }

  /* Over the limit — does it fail cleanly or fall over? */
  const big = makePng(12 * 1024 * 1024);
  const form = new FormData();
  form.append('file', new Blob([big], { type: 'image/png' }), 'too-big.png');
  form.append('entityType', 'sku'); form.append('entityId', String(sku[0].id));
  const over = await fetch(`${BASE}/attachments`, { method: 'POST', headers: auth, body: form });
  console.log(`\n  ${kb(big.length)} (over the 10 MB cap) -> HTTP ${over.status}`);

  /* What a catalogue page actually costs through this path. */
  if (made.length) {
    const id = made[0];
    const runs = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      await fetch(`${BASE}/attachments/${id}/download`, { headers: auth });
      runs.push(performance.now() - t);
    }
    runs.sort((a, b) => a - b);
    const med = runs[Math.floor(runs.length / 2)];
    console.log(`\n  warm re-read of one image: ${med.toFixed(0)}ms median`);
    console.log(`  a 20-product page with 3 photos each = 60 reads ≈ ${((60 * med) / 1000).toFixed(1)}s of backend time`);
  }

  const { rows: total } = await db.query(
    'SELECT COUNT(*) c, pg_size_pretty(SUM(size_bytes)::bigint) s FROM attachments');
  console.log(`\n  attachments now in the database: ${total[0].c} (${total[0].s})`);

  /* Clean up — this is a live database. */
  for (const id of made) {
    await fetch(`${BASE}/attachments/${id}`, { method: 'DELETE', headers: auth });
  }
  const { rows: after } = await db.query('SELECT COUNT(*) c FROM attachments');
  console.log(`  after cleanup: ${after[0].c}\n`);
  process.exit(0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
