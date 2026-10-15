#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The site's icons, made from public/favicon.svg — so the browser tab,
   the bookmark, the phone's home screen and the page all show one mark.

     favicon-32.png        the tab, for browsers without SVG icons
     favicon.ico           16, 32 and 48 px, for the /favicon.ico every
                           browser asks for
     apple-touch-icon.png  180 px, full bleed: iOS rounds it itself
     icon-192.png          the web app manifest's icons, full bleed —
     icon-512.png          Android masks them to its own shape

   Run after changing the mark:  node scripts/make-icons.cjs
   Then bump ?v= on the icon links in index.html and site.webmanifest, or
   browsers keep showing the old one.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');
/* Full bleed: the same drawing with square corners. */
const square = svg.replace(/<rect width="64" height="64" rx="15"/, '<rect width="64" height="64" rx="0"');

async function render(page, source, size) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const sized = source.replace(/width="64" height="64" viewBox/, `width="${size}" height="${size}" viewBox`);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`);
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/* An .ico that holds PNGs — every current browser and Windows reads it. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    const out = {
      'favicon-32.png': await render(page, svg, 32),
      'apple-touch-icon.png': await render(page, square, 180),
      'icon-192.png': await render(page, square, 192),
      'icon-512.png': await render(page, square, 512),
    };
    /* One at a time: they share the page. */
    const sizes = [];
    for (const s of [16, 32, 48]) sizes.push({ size: s, data: await render(page, svg, s) });
    out['favicon.ico'] = ico(sizes);
    for (const [name, data] of Object.entries(out)) {
      fs.writeFileSync(path.join(PUB, name), data);
      console.log(`   ${name}  ${data.length.toLocaleString()} bytes`);
    }
  } finally { await browser.close(); }
})();
