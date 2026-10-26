/* ══════════════════════════════════════════════════════════════════════
   After `vite build`: write the public pages out as real HTML.

   The site is a single-page app, so every address used to get the same
   empty index.html, and only something that runs JavaScript saw a page.
   Search engines index that slowly or not at all, and a link pasted into
   WhatsApp or LinkedIn previewed as the homepage whatever it pointed to.
   This writes, into dist/:

     index.html, platform.html, how-it-works.html, see-maksops.html,
     get-started.html
         each public page with its own title, description, canonical link
         and preview tags (src/lib/seo.js), and its words in the HTML
         (src/prerender/entry-server.jsx, built by `vite build --ssr`) —
         in #prerender, which the live page replaces the moment it is drawn
         (MarketingLayout); the homepage also carries structured data;
     app.html
         the bare app for every other address — the app itself, sign-in, a
         customer's quote link, an address that does not exist — marked
         noindex, so none of those is offered in search results;
     catalogue.html
         the bare app for a company's public catalogue (/c/…), which can
         be indexed;
     sitemap.xml
         the public pages, for search engines.

   vercel.json sends each address to its file (and vite.config.js does the
   same for `vite preview`, so the tests see what production serves).
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const { SITE, PAGES, jsonLd } = await import(pathToFileURL(path.join(ROOT, 'src/lib/seo.js')).href);
const { render, paths } = await import(pathToFileURL(path.join(ROOT, 'dist-ssr/entry-server.js')).href);

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* swap one tag's value in the head, and insist it was there to swap */
const set = (html, re, value, what) => {
  if (!re.test(html)) throw new Error(`index.html has no ${what} to set`);
  return html.replace(re, (m, a, _old, b) => `${a}${value}${b}`);
};
const headFor = (html, route) => {
  const { title, description } = PAGES[route];
  const url = `${SITE.url}${route}`;
  let h = html;
  h = set(h, /(<title>)([\s\S]*?)(<\/title>)/, esc(title), '<title>');
  h = set(h, /(<meta name="description" content=")([^"]*)(")/, esc(description), 'description');
  h = set(h, /(<link rel="canonical" href=")([^"]*)(")/, url, 'canonical link');
  h = set(h, /(<meta property="og:url" content=")([^"]*)(")/, url, 'og:url');
  h = set(h, /(<meta property="og:title" content=")([^"]*)(")/, esc(title), 'og:title');
  h = set(h, /(<meta property="og:description" content=")([^"]*)(")/, esc(description), 'og:description');
  h = set(h, /(<meta name="twitter:title" content=")([^"]*)(")/, esc(title), 'twitter:title');
  h = set(h, /(<meta name="twitter:description" content=")([^"]*)(")/, esc(description), 'twitter:description');
  return h;
};

/* While the page is drawn underneath, keep it out of sight but laid out
   (visibility, not display: things that measure themselves still can),
   so the words on screen are the pre-rendered ones until it is ready. */
const SWAP_CSS = '<style>#prerender + #root { position: absolute; top: 0; left: 0; width: 100%; visibility: hidden; }</style>';

const ROOT_DIV = '<div id="root"></div>';
if (!template.includes(ROOT_DIV)) throw new Error('index.html has no empty #root to fill');

const out = (name, html) => fs.writeFileSync(path.join(DIST, name), html);
const written = [];

/* The bare app, for addresses that are not the homepage: without the
   homepage's canonical link and URL, which would tell a search engine that
   a company's catalogue is a copy of the homepage. Everything but the
   catalogue is also kept out of search. */
const shell = template
  .replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '')
  .replace(/\s*<meta property="og:url" content="[^"]*" \/>/, '');
if (shell.includes('rel="canonical"') || shell.includes('og:url')) throw new Error('could not take the canonical link out of the app shell');
out('app.html', shell.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>'));
out('catalogue.html', shell);

for (const route of paths) {
  if (!PAGES[route]) throw new Error(`${route} is rendered but has no entry in src/lib/seo.js`);
  const body = render(route);
  if (body.length < 2000) throw new Error(`${route} rendered to almost nothing (${body.length} bytes)`);
  let html = headFor(template, route);
  const extra = [SWAP_CSS];
  if (route === '/') extra.push(...jsonLd().map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`));
  html = html.replace('</head>', `    ${extra.join('\n    ')}\n  </head>`);
  html = html.replace(ROOT_DIV, `<div id="prerender" data-path="${route}">${body}</div>${ROOT_DIV}`);
  const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
  out(file, html);
  written.push(`${file} (${Math.round(html.length / 1024)} kB)`);
}

/* the sitemap: the public pages, dated by this build */
const today = new Date().toISOString().slice(0, 10);
out('sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Object.entries(PAGES).map(([route, p]) => `  <url><loc>${SITE.url}${route}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`),
  '</urlset>',
  '',
].join('\n'));

console.log(`prerender: ${written.join(', ')}; app.html, catalogue.html, sitemap.xml (${Object.keys(PAGES).length} pages)`);
