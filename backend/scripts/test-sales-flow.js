#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The sales flow Sai asked about: find it, quote it, get a yes, ship it.

   1. Search by anything. The public catalogue and the seller's product list
      find a product by name, code, category, HSN, headline, use or
      description — any case, part words, several words in any order.
   2. Minimum order. A public enquiry under a product's minimum is refused
      with a sentence; a quotation under it is allowed and reported back.
   3. Delivery. "2-3 weeks" is 21 days: the lead-time reader, backend and
      frontend copies, over the same cases. A quotation saves its promise
      and suggests one from its lines.
   4. Accept or decline online. The share link is unguessable, stable and
      the owner's alone; the public page shows what a customer needs and
      nothing internal; an answer is taken once, while the quotation is
      open and in date, and the business is told.
   5. Converting the quotation sets the order's ship-by date.

   Runs against a local backend (SCHEDULER=off) with throwaway
   sales-flow-*@example.test accounts, deleted again in `finally`. Refuses
   to run against a deployed host.

     API_BASE=http://localhost:5095 node scripts/test-sales-flow.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { pathToFileURL } = require('url');
const { Client } = require('pg');
const { purge, sweepStale } = require('./lib/testAccounts');
const { leadTimeDays, suggestDeliveryDays } = require('../shared/leadTime');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const q1 = async (sql, params) => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who?.token ? { Authorization: `Bearer ${who.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.text();
  let json; try { json = JSON.parse(raw); } catch { json = {}; }
  return { status: r.status, body: json, raw };
};
/* A stranger's browser: no Authorization header at all. */
const stranger = (method, url, body) => call(null, method, url, body);
const register = async (tag) => {
  const r = await call(null, 'POST', '/auth/register',
    { name: `Sales ${tag}`, email: `sales-flow-${tag}-${stamp}@example.test`, password: PASS });
  if (!r.body.token) throw new Error(`could not register ${tag}: ${r.status} ${r.body.error || ''}`);
  return r.body;
};

/* India's calendar, as the server reads validity. */
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const ids = (r) => (r.body.products || r.body.items || (Array.isArray(r.body) ? r.body : [])).map(p => p.id).sort((a, b) => a - b);
const same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

(async () => {
  await sweepStale('sales-flow-').catch(() => 0);
  const accounts = [];
  try {
    const A = await register('a'); accounts.push(A.user.id);
    const B = await register('b'); accounts.push(B.user.id);
    const prof = await call(A, 'PUT', '/company-profile', {
      name: `Sales Flow Works ${stamp}`, gstin: '36AAMCK2569F1Z9', stateCode: '36',
      address: 'Plot 7, IDA Uppal\nHyderabad 500039', phone: '040 2720 1234', email: 'accounts@example.test',
      bank_name: 'HDFC Bank', bank_account_no: '50100123456789', bank_ifsc: 'HDFC0001234',
      setup_completed_at: new Date().toISOString(),
    });
    await call(B, 'PUT', '/company-profile', { name: `Rival Works ${stamp}`, setup_completed_at: new Date().toISOString() });
    if (prof.status >= 300) throw new Error(`company profile: ${prof.status} ${prof.body.error || ''}`);

    /* ── 1. the lead-time reader ─────────────────────────────────── */
    console.log('\n  ── 1. reading a lead time ("2-3 weeks" is 21 days)');
    const fe = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'leadTime.js')).href);
    const cases = [
      ['10 days', 10], ['2-3 weeks', 21], ['2–3 weeks', 21], ['2 to 3 weeks', 21], ['15 working days', 21],
      ['10 business days', 14], ['3 working days', 5], ['1 month', 30], ['1.5 months', 45], ['within 7 days', 7],
      ['48 hours', 2], ['7-10', 10], ['2 wks', 14], ['3 Weeks', 21], ['2 weeks - 1 month', 30],
      ['3 weeks from drawing approval', 21], ['Ex-stock', null], ['from Jan 2026', null], ['', null], [null, null],
      ['1000 weeks', 730],
    ];
    const wrong = cases.filter(([t, want]) => leadTimeDays(t) !== want || fe.leadTimeDays(t) !== want);
    ok(!wrong.length, `${cases.length} notes read the same by the server and the browser: upper bound, working days ×7/5 rounded up, weeks, months, hours${wrong.length ? ` — wrong: ${JSON.stringify(wrong.map(([t, w]) => [t, w, leadTimeDays(t), fe.leadTimeDays(t)]))}` : ''}`);
    const sug = suggestDeliveryDays([{ note: '10 days', label: 'Insulator' }, { note: '1 month', label: 'Cross arm' }, { note: '2-3 weeks', label: 'Clamp' }, { note: 'Ex-stock', label: 'Bolt' }]);
    const sugFe = fe.suggestDeliveryDays([{ note: '10 days', label: 'Insulator' }, { note: '1 month', label: 'Cross arm' }, { note: '2-3 weeks', label: 'Clamp' }]);
    ok(sug?.days === 30 && sug.from === 'Cross arm' && sugFe?.days === 30, `across lines the longest wins: ${sug?.days} days, from ${sug?.from}`);
    ok(suggestDeliveryDays([{ note: 'Ex-stock' }]) === null, 'nothing readable → no suggestion, not a guess');

    /* ── 2. search by anything ───────────────────────────────────── */
    console.log('\n  ── 2. search by anything');
    const slug = `sales-flow-${stamp}`;
    const cat = await call(A, 'PUT', '/catalogue/settings', { slug, headline: 'Line hardware', is_published: true, show_prices: true });
    ok(cat.status === 200, `A publishes a catalogue (${cat.status})`);
    const mkSku = async (who, body, publish) => {
      const r = await call(who, 'POST', '/skus', body);
      if (publish) await call(who, 'PATCH', `/catalogue/products/${r.body.id}`, { is_published: true, ...publish });
      return r.body.id;
    };
    const arm = await mkSku(A, { sku_code: `CA-VT-${stamp}`, name: 'V-Type Cross Arm 75x75', hsn: '7308', price: 850, unit: 'nos', description: 'Hot-dip galvanised MS angle for 11kV poles' },
      { catalogue_category: 'Line hardware', headline: 'Cross arm for 11kV distribution', use_case: 'Mounting insulators on poles', moq: 100, lead_time_note: '2-3 weeks' });
    const clamp = await mkSku(A, { sku_code: `BC-${stamp}`, name: 'Back Clamp 50x6', hsn: '7326', price: 120, unit: 'nos', description: 'Clamp for pole mounting' },
      { catalogue_category: 'Clamps', headline: 'Heavy back clamp', use_case: 'Fixing cross arms to poles', lead_time_note: '15 working days' });
    const pin = await mkSku(A, { sku_code: `IN-${stamp}`, name: 'Pin Insulator', hsn: '8546', price: 300, unit: 'nos' },
      { catalogue_category: 'Insulators', headline: 'Porcelain pin insulator', use_case: 'Line support', lead_time_note: '10 days' });
    const rivalSku = await mkSku(B, { sku_code: `RV-${stamp}`, name: 'Rival Cross Arm', hsn: '7308', price: 1, unit: 'nos' });

    const pub = (q, extra = '') => stranger('GET', `/public/catalogue/${slug}?limit=60&q=${encodeURIComponent(q)}${extra}`);
    const searches = [
      ['v-type', [arm], 'part of the name'],
      ['cross', [arm, clamp], 'one word, in a name and in another product’s use'],
      [`ca-vt-${stamp}`, [arm], 'the code, in lower case'],
      ['CLAMPS', [clamp], 'the category, in capitals'],
      ['8546', [pin], 'the HSN'],
      ['porcelain', [pin], 'the headline'],
      ['fixing', [clamp], 'the use'],
      ['galvanised', [arm], 'the description'],
      ['75x75 arm cross', [arm], 'several words in any order'],
      ['insul', [arm, pin], 'a part word, wherever it is (a name, and another product\'s use)'],
      ['clamp 7326', [clamp], 'words from two fields together (name + HSN)'],
      ['zzqx', [], 'nothing matches → nothing'],
      ['%', [], '“%” is taken literally, not as match-everything'],
    ];
    for (const [q, want, what] of searches) {
      const r = await pub(q);
      ok(r.status === 200 && same(ids(r), want), `public search “${q}” → ${what} (${ids(r).length} found)`);
    }
    const inCat = await pub('clamp', '&category=Clamps');
    ok(inCat.status === 200 && same(ids(inCat), [clamp]), `a search inside a category still works (${inCat.status})`);

    const mine = (q) => call(A, 'GET', `/skus?limit=50&search=${encodeURIComponent(q)}`);
    for (const [q, want, what] of [
      ['galvanised', [arm], 'description'], ['7308', [arm], 'HSN'], ['line hardware', [arm], 'category, two words'],
      ['heavy clamp', [clamp], 'headline and name together'], ['75x75 cross', [arm], 'words in any order'], [`in-${stamp}`, [pin], 'code, any case'],
    ]) {
      const r = await mine(q);
      ok(r.status === 200 && same(ids(r), want), `the seller's product list, “${q}” → ${what}`);
    }
    const bSees = await call(B, 'GET', '/skus?limit=50&search=7308');
    ok(same(ids(bSees), [rivalSku]), 'another company searching the same HSN sees only its own product');

    /* ── 3. minimum order ────────────────────────────────────────── */
    console.log('\n  ── 3. minimum order quantity');
    const shop = await pub('');
    const armCard = (shop.body.products || []).find(p => p.id === arm);
    ok(Number(armCard?.moq) === 100, `the public catalogue carries the minimum (${armCard?.moq})`);
    const [{ n: before }] = await q1('SELECT COUNT(*)::int n FROM enquiries WHERE owner_id = $1', [A.user.id]);
    const enquire = (items) => stranger('POST', `/public/catalogue/${slug}/enquiry`, { name: 'Ramesh Rao', phone: '9000000002', items });
    const under = await enquire([{ skuId: arm, description: 'Cross arm', quantity: 50, unit: 'nos' }]);
    ok(under.status === 400 && /minimum order is 100 nos/.test(under.body.error) && /asks for 50/.test(under.body.error),
      `an enquiry for 50 of a 100-minimum product is refused: “${under.body.error}”`);
    const blank = await enquire([{ skuId: arm, description: 'Cross arm', quantity: '', unit: 'nos' }]);
    ok(blank.status === 400 && /minimum order is 100/.test(blank.body.error || ''), `no quantity at all is under the minimum too (${blank.status})`);
    const zero = await enquire([{ skuId: clamp, description: 'Clamp', quantity: 0, unit: 'nos' }]);
    const negative = await enquire([{ skuId: clamp, description: 'Clamp', quantity: -5, unit: 'nos' }]);
    ok(zero.status === 400 && negative.status === 400 && /more than zero/.test(negative.body.error || ''), `0 and −5 are refused (${zero.status}, ${negative.status})`);
    const [{ n: afterRefused }] = await q1('SELECT COUNT(*)::int n FROM enquiries WHERE owner_id = $1', [A.user.id]);
    ok(afterRefused === before, 'a refused enquiry leaves nothing behind');
    const good = await enquire([{ skuId: arm, description: 'Cross arm', quantity: 100, unit: 'nos' }, { skuId: clamp, description: 'Clamp', quantity: 10, unit: 'nos' }]);
    ok(good.status === 200 && /^ENQ-/.test(good.body.ref || ''), `at the minimum it goes through (${good.body.ref})`);
    const [enq] = await q1('SELECT id FROM enquiries WHERE owner_id = $1 ORDER BY id DESC LIMIT 1', [A.user.id]);
    const conv = await call(A, 'POST', `/enquiries/${enq.id}/convert`);
    const armLine = conv.body.prefill?.items?.find(i => String(i.skuId) === String(arm));
    ok(armLine?.moq === 100 && armLine?.leadTime === '2-3 weeks', `converting to a quotation hands the builder the minimum and lead time (${armLine?.moq}, ${armLine?.leadTime})`);
    const customerId = conv.body.customerId;
    await call(A, 'PATCH', `/customers/${customerId}`, { phone: '9000000002', email: 'buyer@example.test' });

    const lines = (armQty) => [
      { skuId: arm, description: 'V-Type Cross Arm 75x75', hsn: '7308', quantity: armQty, uom: 'nos', rate: 850 },
      { skuId: pin, description: 'Pin Insulator', hsn: '8546', quantity: 10, uom: 'nos', rate: 300 },
    ];
    const validUntil = addDays(istToday(), 15);
    const small = await call(A, 'POST', '/sales-quotations', { customerId, validUntil, items: lines(50) });
    ok(small.status === 200 && small.body.belowMoq?.length === 1 && small.body.belowMoq[0].line === 1
      && small.body.belowMoq[0].moq === 100 && small.body.belowMoq[0].quantity === 50,
    `a quotation for 50 is saved — warned, not blocked: ${JSON.stringify(small.body.belowMoq)}`);
    const smallDoc = await call(A, 'GET', `/sales-quotations/${small.body.id}`);
    ok(Number(smallDoc.body.items?.[0]?.moq) === 100 && smallDoc.body.items?.[0]?.lead_time_note === '2-3 weeks',
      'reading the quotation back, each line carries its product\'s minimum and lead time');
    const bWithA = await call(B, 'POST', '/sales-quotations', {
      customerId: (await call(B, 'POST', '/customers', { name: `B buyer ${stamp}` })).body.id,
      items: [{ skuId: arm, description: 'x', quantity: 1, uom: 'nos', rate: 1 }] });
    ok(bWithA.status === 200 && (bWithA.body.belowMoq || []).length === 0, 'another company naming A\'s product learns nothing of its minimum');

    /* ── 4. the delivery promise on the quotation ────────────────── */
    console.log('\n  ── 4. delivery: within N days of order');
    for (const [v, why] of [[731, 'over two years'], [-1, 'negative'], [2.5, 'part days'], ['abc', 'not a number']]) {
      const r = await call(A, 'POST', '/sales-quotations', { customerId, items: lines(100), deliveryDays: v });
      ok(r.status === 400 && /whole number of days/.test(r.body.error || ''), `delivery ${JSON.stringify(v)} is refused — ${why} (${r.status})`);
    }
    const Q1 = await call(A, 'POST', '/sales-quotations', { customerId, validUntil, items: lines(150), deliveryDays: 21, deliveryNote: 'Ex-works Hyderabad' });
    const doc1 = await call(A, 'GET', `/sales-quotations/${Q1.body.id}`);
    ok(Q1.status === 200 && doc1.body.delivery_days === 21 && doc1.body.delivery_note === 'Ex-works Hyderabad' && (Q1.body.belowMoq || []).length === 0,
      `saved and read back: within ${doc1.body.delivery_days} days, “${doc1.body.delivery_note}”`);
    ok(doc1.body.delivery_suggestion?.days === 21 && /2-3 weeks/.test(doc1.body.delivery_suggestion?.note || ''),
      `and what the lines' lead times suggest: ${doc1.body.delivery_suggestion?.days} days (“${doc1.body.delivery_suggestion?.note}” beats “10 days”)`);
    const patchDraft = await call(A, 'PATCH', `/sales-quotations/${small.body.id}`, { delivery_days: 30, delivery_note: 'Part shipments allowed' });
    ok(patchDraft.status === 200 && patchDraft.body.delivery_days === 30, `a Draft's promise can be changed (${patchDraft.status})`);
    const patchBad = await call(A, 'PATCH', `/sales-quotations/${small.body.id}`, { delivery_days: 1000 });
    ok(patchBad.status === 400, `and is checked the same way on an edit (${patchBad.status})`);

    /* ── 5. the share link ───────────────────────────────────────── */
    console.log('\n  ── 5. share for approval');
    const sh = await call(A, 'POST', `/sales-quotations/${Q1.body.id}/share-link`);
    const token = sh.body.token;
    ok(sh.status === 200 && /^[A-Za-z0-9_-]{32}$/.test(token || '') && sh.body.path === `/q/${token}`,
      `a link is made: /q/<32 random characters> (${sh.status})`);
    ok(sh.body.status === 'Sent' && sh.body.customer?.phone === '9000000002' && sh.body.customer?.email === 'buyer@example.test',
      'sharing a Draft sends it, and the reply carries the customer\'s phone and email for the message');
    const [row1] = await q1('SELECT status, accept_token, link_sent_at FROM sales_quotations WHERE id = $1', [Q1.body.id]);
    ok(row1.status === 'Sent' && row1.accept_token === token && row1.link_sent_at, 'stored: Sent, the token, and when it was shared');
    const again = await call(A, 'POST', `/sales-quotations/${Q1.body.id}/share-link`);
    ok(again.body.token === token, 'sharing again gives the same link — the first message still works');
    const other = await call(A, 'POST', `/sales-quotations/${small.body.id}/share-link`);
    ok(other.body.token && other.body.token !== token && !token.includes(String(Q1.body.id)), 'each quotation has its own token, unrelated to its id');
    const bShare = await call(B, 'POST', `/sales-quotations/${Q1.body.id}/share-link`);
    ok(bShare.status === 404, `another company cannot make a link for it (${bShare.status})`);

    const view = await stranger('GET', `/public/quotations/${token}`);
    const v = view.body;
    ok(view.status === 200 && v.company?.name === `Sales Flow Works ${stamp}` && v.company.gstin === '36AAMCK2569F1Z9' && /Uppal/.test(v.company.address || ''),
      'a stranger opens it: the business\'s name, GSTIN and address');
    ok(v.customer?.name && v.quotation?.number === doc1.body.quote_number && v.quotation.validUntil === validUntil && v.quotation.date,
      `the customer, number ${v.quotation?.number}, date and validity`);
    ok(v.lines?.length === 2 && v.lines[0].description === 'V-Type Cross Arm 75x75' && v.lines[0].hsn === '7308'
      && v.lines[0].quantity === 150 && v.lines[0].unit === 'nos' && v.lines[0].rate === 850 && v.lines[0].amount === 127500,
    'the lines: description, HSN, quantity, unit, rate, amount');
    ok(v.quotation.total === Number(doc1.body.net_amount) && v.quotation.cgst > 0 && v.quotation.sgst > 0 && /Rupees|Lakh|Thousand/i.test(v.quotation.amountInWords || ''),
      `totals with GST and the amount in words (₹${v.quotation.total})`);
    ok(v.quotation.deliveryDays === 21 && v.quotation.deliveryNote === 'Ex-works Hyderabad' && v.canRespond === true && v.response === null,
      'the delivery promise, and it is open for an answer');
    /* Nothing internal: no ids, owners, costs, bank details or the token. */
    const keys = [];
    const walk = (o) => { if (o && typeof o === 'object') for (const [k, val] of Object.entries(o)) { keys.push(k); walk(val); } };
    walk(v);
    const forbidden = keys.filter(k => /(^id$|_id$|Id$|owner|token|cost|bank|account|ifsc|pan$|margin|converted)/i.test(k));
    ok(!forbidden.length, `no internal fields in what a stranger gets${forbidden.length ? ` — found ${forbidden.join(', ')}` : ` (${new Set(keys).size} field names checked)`}`);
    ok(!view.raw.includes('50100123456789') && !view.raw.includes('HDFC0001234') && !view.raw.includes(token) && !view.raw.includes(`"${A.user.id}"`),
      'and no bank account, IFSC or token anywhere in the text');
    ok(v.lines.every(l => Object.keys(l).sort().join() === 'amount,description,hsn,quantity,rate,unit'), 'each line is exactly the six things printed on it');
    ok(/no-store/.test((await fetch(`${API}/public/quotations/${token}`)).headers.get('cache-control') || ''), 'not cached by anything in between');
    const guess = await stranger('GET', `/public/quotations/${'A'.repeat(32)}`);
    const junk = await stranger('GET', '/public/quotations/1');
    ok(guess.status === 404 && junk.status === 404 && /not valid/.test(guess.body.error || ''), `a made-up or malformed token is “not valid” (${guess.status}, ${junk.status})`);

    /* ── 6. the answer ───────────────────────────────────────────── */
    console.log('\n  ── 6. accept or decline, once');
    const respond = (t, body) => stranger('POST', `/public/quotations/${t}/respond`, body);
    const noName = await respond(token, { decision: 'accept', name: '   ' });
    const maybe = await respond(token, { decision: 'maybe', name: 'X' });
    const longNote = await respond(token, { decision: 'accept', name: 'X', note: 'n'.repeat(1001) });
    ok(noName.status === 400 && /your name/.test(noName.body.error) && maybe.status === 400 && longNote.status === 400 && /1,000/.test(longNote.body.error),
      `a name is required, the decision must be accept or decline, the note at most 1,000 characters (${noName.status}, ${maybe.status}, ${longNote.status})`);
    const yes = await respond(token, { decision: 'accept', name: '  Ramesh   Rao ', note: 'Please deliver to the Uppal site.' });
    ok(yes.status === 200 && yes.body.response?.decision === 'accepted' && yes.body.response.name === 'Ramesh Rao' && yes.body.canRespond === false,
      `accepted by “${yes.body.response?.name}” — confirmed in the reply`);
    const [after1] = await q1('SELECT status, responded_at, response_name, response_note FROM sales_quotations WHERE id = $1', [Q1.body.id]);
    ok(after1.status === 'Accepted' && after1.responded_at && after1.response_note === 'Please deliver to the Uppal site.', 'stored: Accepted, when, by whom, and the note');
    const notes = await q1(`SELECT type, title, message FROM notifications WHERE user_id = $1 AND entity_type = 'sales_quotation' AND entity_id = $2`, [A.user.id, Q1.body.id]);
    ok(notes.length === 1 && notes[0].type === 'QUOTE_ACCEPTED' && /accepted/.test(notes[0].title) && /Ramesh Rao/.test(notes[0].message),
      `the owner is notified: “${notes[0]?.title}” — ${notes[0]?.message}`);
    const [act] = await q1(`SELECT description FROM activities WHERE owner_id = $1 AND type = 'QUOTE_ACCEPTED'`, [A.user.id]);
    ok(/accepted online by Ramesh Rao/.test(act?.description || ''), `and it is in the activity log: “${act?.description}”`);
    const second = await respond(token, { decision: 'decline', name: 'Someone else' });
    ok(second.status === 409 && /already accepted by Ramesh Rao on \d{1,2} \w{3} \d{4}/.test(second.body.error || ''),
      `a second answer is refused, saying what the first was: “${second.body.error}”`);
    const revisit = await stranger('GET', `/public/quotations/${token}`);
    ok(revisit.body.response?.decision === 'accepted' && revisit.body.canRespond === false && revisit.body.quotation.status === 'Accepted', 'a revisit shows the answer, and no buttons');
    const list = await call(A, 'GET', '/sales-quotations?limit=50');
    const listed = (list.body.items || []).find(r => r.id === Q1.body.id);
    ok(listed?.response_name === 'Ramesh Rao' && listed.responded_at && listed.status === 'Accepted' && listed.customer_phone === '9000000002',
      'the quotations list carries the answer, who gave it, and the customer\'s phone');

    const Q2 = await call(A, 'POST', '/sales-quotations', { customerId, validUntil, items: lines(100) });
    const t2 = (await call(A, 'POST', `/sales-quotations/${Q2.body.id}/share-link`)).body.token;
    const no = await respond(t2, { decision: 'decline', name: 'Suresh', note: 'Price too high for this lot.' });
    const [after2] = await q1('SELECT status, response_name FROM sales_quotations WHERE id = $1', [Q2.body.id]);
    const [declNote] = await q1(`SELECT type FROM notifications WHERE user_id = $1 AND entity_id = $2 AND entity_type = 'sales_quotation'`, [A.user.id, Q2.body.id]);
    ok(no.status === 200 && no.body.response?.decision === 'declined' && after2.status === 'Rejected' && declNote?.type === 'QUOTE_DECLINED',
      'declining records Rejected, by whom, and tells the owner');
    /* Reopened by hand: the old answer no longer describes it, so it is
       cleared and the customer may answer the revised offer. */
    const reopen = await call(A, 'PATCH', `/sales-quotations/${Q2.body.id}/status`, { status: 'Draft' });
    const [after3] = await q1('SELECT status, responded_at FROM sales_quotations WHERE id = $1', [Q2.body.id]);
    const [cleared] = await q1(`SELECT description FROM activities WHERE owner_id = $1 AND type = 'QUOTE_STATUS'`, [A.user.id]);
    ok(reopen.status === 200 && after3.status === 'Draft' && !after3.responded_at && /Suresh's online answer \(declined\) was cleared/.test(cleared?.description || ''),
      'set back to Draft by hand: the answer is cleared, and the log keeps what it was');
    await call(A, 'POST', `/sales-quotations/${Q2.body.id}/share-link`);
    const yes2 = await respond(t2, { decision: 'accept', name: 'Suresh' });
    ok(yes2.status === 200 && yes2.body.response?.decision === 'accepted', 'and the same link takes an answer to the revised offer');

    const expiredQ = await call(A, 'POST', '/sales-quotations', { customerId, quoteDate: addDays(istToday(), -20), validUntil: addDays(istToday(), -1), items: lines(100) });
    const t3 = (await call(A, 'POST', `/sales-quotations/${expiredQ.body.id}/share-link`)).body.token;
    const late = await respond(t3, { decision: 'accept', name: 'Ramesh Rao' });
    const lateView = await stranger('GET', `/public/quotations/${t3}`);
    const [after4] = await q1('SELECT status, responded_at FROM sales_quotations WHERE id = $1', [expiredQ.body.id]);
    ok(late.status === 410 && /expired on/.test(late.body.error || '') && /contact Sales Flow Works/.test(late.body.error || '') && /040 2720 1234/.test(late.body.error || '')
      && lateView.body.quotation?.expired === true && lateView.body.canRespond === false && after4.status === 'Sent' && !after4.responded_at,
    `past its validity (yesterday, India time) it is refused, pointing to the seller: “${late.body.error}”`);
    const todayQ = await call(A, 'POST', '/sales-quotations', { customerId, validUntil: istToday(), items: lines(100) });
    const t4 = (await call(A, 'POST', `/sales-quotations/${todayQ.body.id}/share-link`)).body.token;
    const lastDay = await respond(t4, { decision: 'accept', name: 'Ramesh Rao' });
    ok(lastDay.status === 200, `on its last valid day (today in India) it can still be accepted (${lastDay.status})`);

    /* ── 7. the order's ship-by date ─────────────────────────────── */
    console.log('\n  ── 7. converting sets the date the order ships by');
    const bConvert = await call(B, 'POST', `/sales-quotations/${Q1.body.id}/convert`);
    const [stillQ1] = await q1('SELECT status, converted_order_id FROM sales_quotations WHERE id = $1', [Q1.body.id]);
    ok(bConvert.status === 404 && stillQ1.status === 'Accepted' && !stillQ1.converted_order_id, `another company cannot convert it into an order (${bConvert.status})`);
    const cv = await call(A, 'POST', `/sales-quotations/${Q1.body.id}/convert`);
    const order = await call(A, 'GET', `/customer-orders/${cv.body.orderId}`);
    const expected = addDays(String(order.body.order_date).slice(0, 10), 21);
    ok(cv.status === 200 && cv.body.expectedShipmentDate === expected && String(order.body.expected_shipment_date).slice(0, 10) === expected,
      `the order ships by ${order.body.expected_shipment_date}: its date ${order.body.order_date} + 21 days`);
    ok(/within 21 days of order \(Ex-works Hyderabad\)/.test(order.body.notes || ''), `the order's notes say where the date came from: “${order.body.notes}”`);
    const orders = await call(A, 'GET', '/customer-orders?limit=50');
    ok((orders.body.items || []).some(o => o.id === cv.body.orderId && String(o.expected_shipment_date).slice(0, 10) === expected), 'and the orders list carries it, for the order screen');
    const twice = await call(A, 'POST', `/sales-quotations/${Q1.body.id}/convert`);
    ok(twice.status === 409, `converting twice is refused (${twice.status})`);
    const closed = await respond(token, { decision: 'decline', name: 'Ramesh Rao' });
    ok(closed.status === 409, `an answered, converted quotation takes no further answer (${closed.status})`);
    const cvNoPromise = await call(A, 'POST', `/sales-quotations/${todayQ.body.id}/convert`);
    ok(cvNoPromise.status === 200 && cvNoPromise.body.expectedShipmentDate === null, 'a quotation that promised nothing gives an order with no ship-by date, not a made-up one');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    /* The live database caps sessions and several backends share it; a
       cleanup that cannot connect waits and tries again rather than leaving
       the accounts behind. */
    let removed = 0;
    for (let i = 0; i < 8; i++) {
      try { removed = await purge(accounts); break; }
      catch (e) { console.log(`   (cleanup retry: ${e.message.slice(0, 70)})`); await new Promise(r => setTimeout(r, 4000)); }
    }
    const [{ n: left }] = await q1(`SELECT COUNT(*)::int n FROM users WHERE email LIKE $1`, [`sales-flow-%-${stamp}@example.test`]).catch(() => [{ n: -1 }]);
    console.log(`\n   ${left === 0 ? '✅' : '❌'} test accounts removed (${removed} deleted, ${left} left)`);
    if (left !== 0) fail++;
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
