/* ══════════════════════════════════════════════════════════════════════
   public/og-image.png — the picture a link to maksops.co.in shows when it
   is shared (WhatsApp, LinkedIn, X, Slack): 1200 × 630, drawn from HTML
   with the site's own mark, colours and type, so it can be redrawn when
   the brand changes. Run: node scripts/make-og-image.cjs
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const mark = fs.readFileSync(path.join(ROOT, 'public/favicon.svg'), 'utf8');
const STEPS = ['Catalogue', 'Quotation', 'Order', 'Vendor quotes', 'Purchase', 'Receipt', 'Production', 'Invoice'];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; color: #eef2f9;
    background: radial-gradient(900px 520px at 8% 0%, hsl(28 100% 50% / .22), transparent 62%),
                radial-gradient(800px 600px at 100% 100%, hsl(236 80% 62% / .22), transparent 62%),
                linear-gradient(180deg, #0b1226, #060914 85%); }
  .wrap { position: absolute; inset: 0; padding: 64px 72px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; font-family: 'Plus Jakarta Sans'; font-weight: 800; font-size: 40px; letter-spacing: -.02em; }
  .brand svg { width: 64px; height: 64px; }
  .brand span { color: hsl(28 100% 58%); }
  h1 { margin-top: 64px; font-family: 'Plus Jakarta Sans'; font-weight: 800; font-size: 92px; line-height: 1; letter-spacing: -.045em; }
  h1 em { font-style: normal; color: hsl(30 100% 60%); }
  p { margin-top: 26px; font-size: 30px; color: #a9b6d3; font-weight: 500; }
  .flow { margin-top: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .flow b { height: 44px; padding: 0 18px; display: inline-flex; align-items: center; border-radius: 999px; font-weight: 600; font-size: 20px;
    background: hsl(0 0% 100% / .07); border: 1px solid hsl(0 0% 100% / .16); color: #dfe6f3; }
  .flow b:last-child { background: hsl(28 100% 54%); border-color: transparent; color: #fff; }
  .flow i { color: hsl(30 100% 60%); font-style: normal; font-size: 20px; }
  .url { position: absolute; right: 72px; top: 76px; font-size: 24px; color: #a9b6d3; font-weight: 600; }
</style></head><body><div class="wrap">
  <div class="brand">${mark}<div>Maks<span>Ops</span></div></div>
  <div class="url">maksops.co.in</div>
  <h1>From catalogue <em>to cash.</em></h1>
  <p>Operations software for manufacturers: quotes, stock, purchasing, production and GST invoices.</p>
  <div class="flow">${STEPS.map((s) => `<b>${s}</b>`).join('<i>→</i>')}</div>
</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(ROOT, 'public/og-image.png');
  await page.screenshot({ path: out, type: 'png' });
  await browser.close();
  console.log(`wrote ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} kB)`);
})();
