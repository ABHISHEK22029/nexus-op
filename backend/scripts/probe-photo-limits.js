/* Two things the first probe did not actually establish:

   1. The 10 MB cap. The previous run asked for a 12 MB PNG and got 1.5 MB,
      because a smooth colour gradient deflates to almost nothing — so it
      uploaded a small file, got HTTP 200, and reported that as "over the cap
      accepted". It tested nothing. Real photos are noisy and barely
      compress, so this uses incompressible data.

   2. What is left behind. The first run cleaned up four of the five rows it
      created and left the fifth. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const crypto = require('crypto');

const BASE = process.env.BASE || 'http://localhost:5099';
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/* A PNG whose pixel data is random noise — deflate cannot shrink it, so the
   file on the wire is genuinely the size we intend. This is what a camera
   photo behaves like. */
function noisyPng(targetBytes) {
  const zlib = require('zlib');
  const side = Math.round(Math.sqrt(targetBytes / 3));
  const raw = Buffer.alloc(side * (side * 3 + 1));
  for (let y = 0; y < side; y++) {
    raw[y * (side * 3 + 1)] = 0;
    crypto.randomFillSync(raw, y * (side * 3 + 1) + 1, side * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 0 });      // stored, not compressed
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    let c = 0xFFFFFFFF; for (const b of td) c = crcT[(c ^ b) & 255] ^ (c >>> 8);
    const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xFFFFFFFF) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  const token = await (await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };
  const { rows: sku } = await db.query('SELECT id FROM skus ORDER BY id LIMIT 1');

  console.log('\n  what happens either side of the 10 MB cap\n');
  const made = [];
  for (const target of [6 * 1024 * 1024, 14 * 1024 * 1024]) {
    const png = noisyPng(target);
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
    form.append('entityType', 'sku');
    form.append('entityId', String(sku[0].id));
    const t0 = performance.now();
    let status, body = '';
    try {
      const res = await fetch(`${BASE}/attachments`, { method: 'POST', headers: auth, body: form });
      status = res.status;
      const txt = await res.text();
      body = txt.slice(0, 90);
      try { const j = JSON.parse(txt); if (j.id) made.push(j.id); } catch { /* not json */ }
    } catch (e) { status = 'connection dropped'; body = e.message.slice(0, 60); }
    console.log(`  actual size ${mb(png.length).padEnd(9)} -> ${String(status).padEnd(20)} ${((performance.now() - t0) / 1000).toFixed(1)}s   ${body}`);
  }

  /* Tidy up everything this and the previous probe left behind. */
  const { rows: leftovers } = await db.query(
    `SELECT id, filename, size_bytes FROM attachments
      WHERE entity_type = 'sku' AND filename LIKE ANY (ARRAY['product-%','too-big.png','photo.png'])`);
  for (const a of leftovers) {
    await fetch(`${BASE}/attachments/${a.id}`, { method: 'DELETE', headers: auth });
  }
  const { rows: after } = await db.query('SELECT COUNT(*) c FROM attachments');
  console.log(`\n  removed ${leftovers.length} probe attachment(s); ${after[0].c} left in the database\n`);
  process.exit(0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
