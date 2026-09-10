#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The public catalogue, end to end, and what it must never disclose.

   A business publishes a few products at a link. A stranger — no token, no
   session — opens it, puts things in a basket and sends an enquiry. It
   arrives in Sales, and converting it creates the customer.

   Two halves, and the second is the one that matters:

     1. The chain works: publish → visible → enquire → inbox → customer.

     2. Publication is the ONLY thing that discloses anything. An
        unpublished catalogue, an unpublished product, another company's
        product, a photo of something withdrawn — none of it can be
        reached by anyone, with or without a token, by guessing an id or
        naming a slug.

   The stranger here is a plain fetch with no Authorization header, which
   is exactly what a browser opening a WhatsApp link sends.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body, raw: txt };
};
/* No token at all — a stranger's browser. */
const stranger = (path, opts = {}) => call(path, opts);

(async () => {
  console.log('');
  const mk = async (label) => {
    const r = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: label, email: `${label}-${stamp}@example.test`, password: 'testpassword123' }),
    });
    if (!r.ok) { console.error('register failed:', r.body); process.exit(1); }
    await call('/company-profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: `${label} ${stamp}`, gstin: '33AAAAA0000A1Z5',
        bank_name: 'HDFC', bank_account_no: '50100123456789', bank_ifsc: 'HDFC0001234',
        setup_completed_at: new Date().toISOString(),
      }),
    }, r.body.token);
    return { token: r.body.token, id: r.body.user.id };
  };

  const A = await mk('shop');    // the business with a catalogue
  const B = await mk('rival');   // a different business, publishes nothing
  const slugA = `shop-${stamp}`;

  /* ── the business sets its catalogue up ─────────────────── */
  console.log('  ── the business publishes');
  const setup = await call('/catalogue/settings', {
    method: 'PUT',
    body: JSON.stringify({
      slug: slugA, headline: 'Fabricated galvanized materials',
      subhead: '11kV line hardware, made to JBVNL spec',
      is_published: true, show_prices: false, whatsapp_number: '9866644456',
    }),
  }, A.token);
  ok(setup.ok, `the catalogue is created and published (${setup.status})`);

  /* Two products: one published, one not. */
  const mkSku = async (name, price, token) => {
    const r = await call('/skus', {
      method: 'POST',
      body: JSON.stringify({ name, sku_code: `${name.slice(0, 4).toUpperCase()}-${stamp}`, unit: 'Nos', price }),
    }, token);
    return r.body?.id ?? r.body?.sku?.id;
  };
  const shown = await mkSku(`11 KV V cross arm ${stamp}`, 8500, A.token);
  const hidden = await mkSku(`Internal jig ${stamp}`, 400, A.token);
  const rival = await mkSku(`Rival part ${stamp}`, 999, B.token);

  const pub = await call(`/catalogue/products/${shown}`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_published: true, headline: '11kV V cross arm, 75×40×6',
      use_case: 'Distribution poles on JBVNL lines', moq: 100,
      lead_time_note: '3 weeks from drawing approval',
    }),
  }, A.token);
  ok(pub.ok, `one product is published (${pub.status})`);
  ok(!!pub.body?.catalogue_slug, `and got a web address of its own → "${pub.body?.catalogue_slug}"`);
  const productSlug = pub.body?.catalogue_slug;

  /* ── a stranger opens the link ──────────────────────────── */
  console.log('\n  ── a stranger with no token opens the link');
  const shop = await stranger(`/public/catalogue/${slugA}`);
  ok(shop.ok, `the catalogue answers without any credentials (${shop.status})`);
  ok(shop.body.headline === 'Fabricated galvanized materials',
    `it shows the business's own words → "${shop.body.headline}"`);
  ok((shop.body.products || []).length === 1,
    `exactly the published product is listed, not the other (${(shop.body.products || []).length})`);
  ok(!(shop.body.products || []).some(p => String(p.name).includes('Internal jig')),
    'the unpublished product is absent');
  ok(shop.body.products?.[0]?.price == null,
    `prices are withheld while show_prices is off → ${JSON.stringify(shop.body.products?.[0]?.price)}`);

  /* The thing that must never be public. */
  ok(!/gstin|bank_|account_no|ifsc/i.test(shop.raw),
    'no GSTIN and no bank details anywhere in the response');

  const one = await stranger(`/public/catalogue/${slugA}/${productSlug}`);
  ok(one.ok && one.body.use_case?.includes('JBVNL'),
    `the product page carries its use case and lead time (${one.status})`);
  ok(one.body.moq == 100, `and its MOQ → ${one.body.moq}`);

  /* ── what publication withholds ─────────────────────────── */
  console.log('\n  ── what publication withholds');
  const hiddenTry = await stranger(`/public/catalogue/${slugA}/internal-jig-${stamp}`);
  ok(hiddenTry.status === 404, `an unpublished product is not reachable by its address (${hiddenTry.status})`);

  const rivalShop = await stranger(`/public/catalogue/rival-${stamp}`);
  ok(rivalShop.status === 404,
    `a business that has not published has no catalogue at all (${rivalShop.status})`);

  const nonsense = await stranger('/public/catalogue/definitely-not-a-shop');
  ok(nonsense.status === 404, `an unknown address is a plain 404, not a hint (${nonsense.status})`);

  /* Unpublishing takes it down again. */
  await call(`/catalogue/products/${shown}`, {
    method: 'PATCH', body: JSON.stringify({ is_published: false }),
  }, A.token);
  const afterHide = await stranger(`/public/catalogue/${slugA}`);
  ok((afterHide.body.products || []).length === 0, 'unpublishing a product removes it from the page');
  await call(`/catalogue/products/${shown}`, {
    method: 'PATCH', body: JSON.stringify({ is_published: true }),
  }, A.token);

  /* ── the enquiry ────────────────────────────────────────── */
  console.log('\n  ── a stranger sends an enquiry');
  const bad = await stranger(`/public/catalogue/${slugA}/enquiry`, {
    method: 'POST', body: JSON.stringify({ name: 'Ramesh', items: [{ description: 'x' }] }),
  });
  ok(bad.status === 400 && /phone|email/i.test(bad.body.error || ''),
    `no way to reply is refused, and says why → "${String(bad.body.error).slice(0, 58)}"`);

  const enq = await stranger(`/public/catalogue/${slugA}/enquiry`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Ramesh Kumar', company: 'Sahasra Infra', phone: '9866644456',
      email: 'taxation.sahasra@example.test',
      message: 'Need these for the MUJY package.',
      items: [
        { skuId: shown, description: '11kV V cross arm 75×40×6', quantity: 1000, unit: 'Nos' },
        { description: 'Back clamp 50×6', quantity: 1000, unit: 'Nos' },
      ],
    }),
  });
  ok(enq.ok && /^ENQ-\d{4}$/.test(enq.body.ref || ''),
    `the enquiry is accepted and gets a reference → ${enq.body.ref}`);

  /* A line naming another company's product must not attach to it. */
  const crafted = await stranger(`/public/catalogue/${slugA}/enquiry`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Probe', phone: '1', items: [{ skuId: rival, description: 'someone else\'s part', quantity: 1 }],
    }),
  });
  ok(crafted.ok, 'an enquiry naming another company\'s product id is still accepted');
  const { rows: [linked] } = await db.query(
    `SELECT i.sku_id FROM enquiry_items i JOIN enquiries e ON e.id = i.enquiry_id
      WHERE e.owner_id = $1 AND i.description = 'someone else''s part'`, [A.id]);
  ok(linked && linked.sku_id === null,
    `but the line is not attached to it → sku_id ${JSON.stringify(linked?.sku_id)}`);

  /* ── the inbox ──────────────────────────────────────────── */
  console.log('\n  ── it arrives in Sales');
  const inbox = await call('/enquiries', {}, A.token);
  ok(inbox.ok && inbox.body.items.some(e => e.ref === enq.body.ref),
    `the enquiry is in the inbox (${inbox.body.summary?.total} total, ${inbox.body.summary?.new} new)`);

  const rivalInbox = await call('/enquiries', {}, B.token);
  ok(!(rivalInbox.body.items || []).some(e => e.ref === enq.body.ref),
    'and is invisible to the other business');

  const id = inbox.body.items.find(e => e.ref === enq.body.ref).id;
  const detail = await call(`/enquiries/${id}`, {}, A.token);
  ok((detail.body.items || []).length === 2, `it carries both lines (${(detail.body.items || []).length})`);

  const steal = await call(`/enquiries/${id}`, {}, B.token);
  ok(steal.status === 404, `another business cannot open it by id (${steal.status})`);

  /* ── convert ────────────────────────────────────────────── */
  console.log('\n  ── converting it creates the customer');
  const before = await call('/customers?limit=100', {}, A.token);
  const beforeCount = (before.body.items || before.body).length;

  const conv = await call(`/enquiries/${id}/convert`, { method: 'POST' }, A.token);
  ok(conv.ok && conv.body.customerId, `converted (${conv.status})`);
  ok(conv.body.customerName === 'Sahasra Infra',
    `the customer is their company, not their own name → "${conv.body.customerName}"`);
  ok((conv.body.prefill?.items || []).length === 2,
    `the quotation is prefilled with what they asked for (${(conv.body.prefill?.items || []).length} lines)`);
  ok(conv.body.prefill?.items?.every(i => i.rate === ''),
    'with the rates left blank — the enquiry says what they want, not what you charge');

  const after = await call('/customers?limit=100', {}, A.token);
  ok((after.body.items || after.body).length === beforeCount + 1,
    'exactly one customer was created');

  const again = await call(`/enquiries/${id}/convert`, { method: 'POST' }, A.token);
  ok(again.status === 409, `converting the same enquiry twice is refused (${again.status})`);

  /* ── clean up ───────────────────────────────────────────── */
  for (const t of ['enquiry_items', 'enquiries', 'catalogue_photos', 'catalogue_settings']) {
    await db.query(
      t === 'enquiry_items'
        ? 'DELETE FROM enquiry_items WHERE enquiry_id IN (SELECT id FROM enquiries WHERE owner_id = ANY($1))'
        : `DELETE FROM ${t} WHERE owner_id = ANY($1)`, [[A.id, B.id]]).catch(() => {});
  }
  await purgeOrg(db, [A.id, B.id]);
  await db.query('DELETE FROM users WHERE id = ANY($1)', [[A.id, B.id]]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test organisations removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
