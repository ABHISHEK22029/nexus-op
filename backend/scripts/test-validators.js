#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Phone, email, PAN, GSTIN, IFSC, account number, account holder, pincode.

   A tester saved a vendor with the phone "09885300702xdf", the account
   holder "dfaefa132131231231", the IFSC "XDADA1" and the PAN "SADSAD2323".
   All accepted. This checks the shared rules (shared/validators) directly,
   then that the API refuses each bad value with a 400 that names the field
   — on customers, vendors, the company profile and a team member — accepts
   good ones, and leaves an older record's unchanged odd value alone so its
   other fields can still be edited.

   Also here, because they ride on the same throwaway organisation:
   · a production order's yield is worked out from what was recorded (it
     read zero for every order on the detail screen);
   · the stock-link worklist offers products and each material's base unit,
     and a stock row links to a material.

     API_BASE=http://localhost:5094 node scripts/test-validators.js

   Throwaway @example.test accounts, removed in a finally. Refuses to run
   against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purge, sweepStale } = require('./lib/testAccounts');
const V = require('../shared/validators');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sql = async (text, params) => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
};
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const refused = (r, field) => r.status === 400 && r.body.field === field && String(r.body.error || '').length > 0;

/* ── 1. the rules themselves ─────────────────────────────────────────── */
function unit() {
  console.log('\n  The rules');
  const good = (kind, list) => list.forEach(v => ok(V.check(kind, v) === null, `${kind}: “${v}” is accepted`));
  const bad = (kind, list) => list.forEach(v => ok(typeof V.check(kind, v) === 'string', `${kind}: “${v}” is refused — ${V.check(kind, v)}`));

  good('phone', ['98850 00000', '9885000000', '+91 98850 00000', '+91-98850-00000', '09885300702', '919885300702', '040 2345 6789', '+91-40-23456789', '080-41234567']);
  bad('phone', ['09885300702xdf', '12345', '5885000000', '2345 6789', '+1 202 555 0100', '98850(00000)', '98850000001']);
  good('email', ['accounts@company.com', 'a.b+c@sub.example.co.in']);
  bad('email', ['.pulupula@gmail.com', 'no-at-sign', 'a@b', 'a b@c.com', 'a..b@c.com']);
  good('pan', ['AABCN1234M', 'aabcn1234m']);
  bad('pan', ['SADSAD2323', 'AABCN1234', 'AABC1234MM']);
  good('gstin', ['33AABCN1234M1Z7', '36AAMCK2569F1Z9', '97AABCN1234M1ZA', '01AABCN1234MAZ1']);
  bad('gstin', ['33AABCN1234M1Z', '00AABCN1234M1Z7', '39AABCN1234M1Z7', '33AABC11234M1Z7', '33AABCN1234M1X7', '33AABCN1234M0Z7']);
  good('ifsc', ['HDFC0001234', 'sbin0abc123']);
  bad('ifsc', ['XDADA1', 'HDFC1001234', 'HDF00001234', 'ea2321223']);
  good('accountNumber', ['123456789', '123456789012345678']);
  bad('accountNumber', ['12345678', '1234567890123456789', '1234 5678 90', '23421321A']);
  good('accountHolder', ['Saikumar Puluula', "S. K. Enterprises", "Patel & Sons", "D'Souza", 'रमेश कुमार',
    'M/s ABC', 'ABC (OPC) Pvt. Ltd.', 'A-1 Traders', 'Shop 12 Traders']);
  bad('accountHolder', ['dfaefa132131231231', '...', 'Ramesh 9000012345', '12', '<b>Ramesh</b>']);
  good('pincode', ['500018', '635109']);
  bad('pincode', ['050018', '50001', '5000188', 'ABCDEF']);

  ok(V.check('phone', '') === null && V.check('phone', null) === null && V.check('phone', '   ') === null, 'blank is never an error — every one of these fields is optional');
  ok(V.gstinPanMismatch('33AABCN1234M1Z7', 'AABCN1234M') === null, 'a GSTIN and the PAN inside it agree');
  ok(/does not match/.test(V.gstinPanMismatch('33AABCN1234M1Z7', 'AAACT1234C') || ''), 'a GSTIN and a different PAN are refused');

  const p1 = V.firstProblem({ contactPhone: 'abc', name: 'x' }, V.VENDOR_SPEC);
  ok(p1 && p1.field === 'contactPhone' && /^Phone: /.test(p1.error), `firstProblem names the field and its label (${p1 && p1.error})`);
  ok(V.firstProblem({ phone: 'abc' }, V.CUSTOMER_SPEC, { existing: { phone: 'abc' } }) === null, 'an unchanged odd value on an existing record is not re-checked');
  ok(!!V.firstProblem({ phone: 'abcd' }, V.CUSTOMER_SPEC, { existing: { phone: 'abc' } }), '…but changing it to another odd value is');
  ok(V.firstProblem({ gstin: '33AABCN1234M1Z7', pan: 'AAACT1234C' }, V.CUSTOMER_SPEC, { pair: ['gstin', 'pan'] })?.field === 'pan', 'GSTIN/PAN disagreement is reported on the PAN');
}

/* ── 2. the API ─────────────────────────────────────────────────────── */
async function api() {
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Forms Test', email: `forms-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  if (!reg.token) throw new Error(`could not register: ${JSON.stringify(reg).slice(0, 200)}`);
  ids.push(reg.user?.id);
  const A = reg;

  console.log('\n  Customers');
  let r = await call(A, 'POST', '/customers', { name: `Bad phone ${stamp}`, phone: '09885300702xdf' });
  ok(refused(r, 'phone'), `a customer with phone “09885300702xdf” is refused, naming phone (${r.status} ${r.body.error})`);
  r = await call(A, 'POST', '/customers', { name: `Bad email ${stamp}`, email: '.pulupula@gmail.com' });
  ok(refused(r, 'email'), `a customer with a bad email is refused (${r.status})`);
  r = await call(A, 'POST', '/customers', { name: `Bad GSTIN ${stamp}`, gstin: '99AABCN1234M1Z7' });
  ok(refused(r, 'gstin'), `a GSTIN with state code 99 is refused (${r.status} ${r.body.error})`);
  r = await call(A, 'POST', '/customers', { name: `Mismatch ${stamp}`, gstin: '33AABCN1234M1Z7', pan: 'AAACT1234C' });
  ok(refused(r, 'pan'), `a GSTIN and a PAN that disagree are refused (${r.status} ${r.body.error})`);
  r = await call(A, 'POST', '/customers', { name: `Good ${stamp}`, phone: '+91 98850 00000', email: 'buyer@company.com', gstin: '33AABCN1234M1Z7', pan: 'AABCN1234M' });
  ok(r.status === 200 && r.body.id, `a customer with valid details is saved (${r.status})`);
  const custId = r.body.id;
  r = await call(A, 'POST', '/customers', { name: `Blanks ${stamp}`, phone: '', email: null, gstin: '' });
  ok(r.status === 200, `blank optional fields are accepted (${r.status})`);
  r = await call(A, 'PATCH', `/customers/${custId}`, { email: 'not an email' });
  ok(refused(r, 'email'), `editing a customer to a bad email is refused (${r.status})`);
  /* An older record that already holds an odd value. */
  await sql('UPDATE customers SET phone = $1 WHERE id = $2', ['call reception', custId]);
  r = await call(A, 'PATCH', `/customers/${custId}`, { name: `Good renamed ${stamp}`, phone: 'call reception', email: 'buyer@company.com' });
  ok(r.status === 200, `an old odd phone sent back unchanged does not block renaming the customer (${r.status} ${r.body.error || ''})`);

  console.log('\n  Vendors');
  const vendor = (extra) => ({ name: `Vendor ${stamp}`, type: 'Supplier', ...extra });
  const vcases = [
    [{ contactPhone: '09885300702xdf' }, 'contactPhone', 'phone'],
    [{ account_holder: 'dfaefa132131231231' }, 'account_holder', 'account holder with digits'],
    [{ ifsc_code: 'XDADA1' }, 'ifsc_code', 'IFSC “XDADA1”'],
    [{ pan: 'SADSAD2323' }, 'pan', 'PAN “SADSAD2323”'],
    [{ account_number: '1234' }, 'account_number', 'account number of 4 digits'],
    [{ pincode: '050018' }, 'pincode', 'pincode starting 0'],
    [{ contactEmail: '.pulupula@gmail.com' }, 'contactEmail', 'email starting with a dot'],
    [{ gstin: '33AABCN1234M1X7' }, 'gstin', 'GSTIN without Z'],
  ];
  for (const [extra, field, what] of vcases) {
    r = await call(A, 'POST', '/vendors', vendor(extra));
    ok(refused(r, field), `a vendor with a bad ${what} is refused, naming ${field} (${r.status} ${r.body.error || ''})`);
  }
  r = await call(A, 'POST', '/vendors', vendor({
    contactPhone: '98850 00000', contactEmail: 'sales@vendor.com', gstin: '33AABCN1234M1Z7', pan: 'AABCN1234M',
    pincode: '635109', account_holder: 'Kalinga Board & Co', account_number: '50100012345678', ifsc_code: 'HDFC0001234',
  }));
  ok(r.status === 200 && r.body.id, `a vendor with every field valid is saved (${r.status} ${r.body.error || ''})`);
  const vendorId = r.body.id;
  r = await call(A, 'PATCH', `/vendors/${vendorId}`, { ifsc_code: 'ea2321223' });
  ok(refused(r, 'ifsc_code'), `editing a vendor to a bad IFSC is refused (${r.status})`);
  r = await call(A, 'PATCH', `/vendors/${vendorId}`, { pan: 'AAACT1234C' });
  ok(refused(r, 'pan'), `editing a vendor's PAN so it no longer matches the stored GSTIN is refused (${r.status} ${r.body.error || ''})`);
  await sql('UPDATE vendors SET account_holder = $1 WHERE id = $2', ['Old Name 123456', vendorId]);
  r = await call(A, 'PATCH', `/vendors/${vendorId}`, { name: `Vendor renamed ${stamp}`, account_holder: 'Old Name 123456' });
  ok(r.status === 200, `an old odd account holder sent back unchanged does not block a rename (${r.status} ${r.body.error || ''})`);
  r = await call(A, 'PATCH', `/vendors/${vendorId}`, { contactPhone: '040-2345 6789' });
  ok(r.status === 200, `a landline with its STD code is accepted (${r.status})`);

  console.log('\n  Company profile');
  r = await call(A, 'PUT', '/company-profile', { name: `Forms Works ${stamp}`, gstin: '36AAMCK2569F1Z9', stateCode: '36' });
  ok(r.status === 200, `a profile with a valid GSTIN is saved (${r.status} ${r.body.error || ''})`);
  for (const [body, field] of [
    [{ bank_ifsc: 'ea2321223' }, 'bank_ifsc'],
    [{ bank_account_no: '23421321A' }, 'bank_account_no'],
    [{ bank_account_name: 'saikumar 123' }, 'bank_account_name'],
    [{ phone: '12345' }, 'phone'],
    [{ email: 'owner@' }, 'email'],
    [{ gstin: '36AAMCK2569F1Z' }, 'gstin'],
    [{ pan: 'AABCN1234M' }, 'pan'],          // disagrees with the stored GSTIN
  ]) {
    r = await call(A, 'PUT', '/company-profile', { name: `Forms Works ${stamp}`, ...body });
    ok(refused(r, field), `the profile refuses a bad ${field}, naming it (${r.status} ${r.body.error || ''})`);
  }
  r = await call(A, 'PUT', '/company-profile', { name: `Forms Works ${stamp}`, pan: 'AAMCK2569F', bank_account_name: 'Forms Works', bank_account_no: '50100012345678', bank_ifsc: 'HDFC0001234', phone: '040 2345 6789', email: 'owner@forms.example.com' });
  ok(r.status === 200, `the profile accepts valid bank details, phone and the PAN inside its GSTIN (${r.status} ${r.body.error || ''})`);
  await sql('UPDATE company_profile SET bank_account_name = $1 WHERE owner_id = $2', ['M/S Forms (OPC) 1', A.user.id]);
  const whole = (await call(A, 'GET', '/company-profile')).body;
  r = await call(A, 'PUT', '/company-profile', { ...whole, tradeName: `Forms ${stamp}` });
  ok(r.status === 200, `the whole profile sent back with an old odd account name still saves another change (${r.status} ${r.body.error || ''})`);

  console.log('\n  Team member');
  r = await call(A, 'PATCH', `/admin/users/${A.user.id}`, { phone: 'ring me' });
  ok(refused(r, 'phone'), `a team member's phone “ring me” is refused (${r.status} ${r.body.error || ''})`);
  r = await call(A, 'PATCH', `/admin/users/${A.user.id}`, { phone: '98850 00000', job_title: 'Owner' });
  ok(r.status === 200 && r.body.phone === '98850 00000', `a valid phone saves — editing a person used to answer “No such user” every time (${r.status} ${r.body.error || ''})`);

  console.log('\n  Production yield');
  const po = await call(A, 'POST', '/production', { productName: `Brackets ${stamp}`, plannedQty: 40, outputUom: 'nos' });
  const pid = po.body.id;
  await call(A, 'POST', `/production/${pid}/consumption`, { itemName: 'MS Plate', consumedQty: 100, uom: 'kg', unitCost: 60 });
  await call(A, 'POST', `/production/${pid}/output`, { itemName: `Brackets ${stamp}`, outputQty: 40, outputWeight: 80, uom: 'nos' });
  await call(A, 'POST', `/production/${pid}/scrap`, { scrapType: 'sellable', scrapQty: 18, uom: 'kg', saleValue: 400, isSold: true });
  const y = (await call(A, 'GET', `/production/${pid}`)).body.yield || {};
  ok(y.inputWeight === 100 && y.outputWeight === 80 && y.yieldPct === 80, `the detail screen's yield is worked out: 80 kg from 100 kg issued = ${y.yieldPct}%`);
  ok(y.costPerUnit === 140 && y.unaccountedLoss === 2, `cost per unit (6,000 − 400) ÷ 40 = ${y.costPerUnit}; 2 kg unaccounted = ${y.unaccountedLoss}`);

  console.log('\n  Linking stock');
  const mat = (await call(A, 'POST', '/raw-materials', { name: `Angle 50x50 ${stamp}`, unit: 'kg', base_uom: 'kg' })).body;
  const sku = (await call(A, 'POST', '/skus', { name: `Gate ${stamp}`, sku_code: `G-${stamp}`, unit: 'nos' })).body;
  const stock = (await call(A, 'POST', '/inventory', { itemName: `Angle 50x50 ${stamp}`, quantity: 120, uom: 'kg' })).body;
  const stockId = stock.id || stock.item?.id;
  const um = (await call(A, 'GET', '/inventory/unmatched')).body;
  ok(um.items?.some(i => i.id === stockId), 'the new stock row is on the unlinked worklist');
  ok(um.candidates?.some(c => c.id === mat.id && c.base_uom === 'kg'), 'materials come with the unit shortfalls read their stock in');
  ok(um.products?.some(p => p.id === sku.id), 'products are offered as well as materials');
  r = await call(A, 'PATCH', `/inventory/${stockId}`, { raw_material_id: mat.id });
  ok(r.status === 200 && r.body.raw_material_id === mat.id, `the stock row links to the material (${r.status})`);
  const um2 = (await call(A, 'GET', '/inventory/unmatched')).body;
  ok(!um2.items?.some(i => i.id === stockId), 'and leaves the worklist');
}

const ids = [];
(async () => {
  await sweepStale('forms-').catch(() => 0);
  try {
    unit();
    await api();
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    /* The shared pooler allows 15 sessions across every backend running
       against it; when they are all taken the purge is retried rather than
       leaving the account behind. */
    let removed = 0, left = [{ n: -1 }];
    for (let i = 0; i < 10 && left[0].n !== 0; i++) {
      if (i) await new Promise(r => setTimeout(r, 3000));
      removed += await purge(ids.filter(Boolean)).catch((e) => { console.log(`   cleanup retry ${i + 1}: ${e.message}`); return 0; });
      left = await sql(`SELECT COUNT(*)::int n FROM users WHERE email = $1`, [`forms-${stamp}@example.test`]).catch(() => [{ n: -1 }]);
    }
    console.log(`\n   ${left[0].n === 0 ? '✅' : '❌'} test account removed (${removed})`);
    if (left[0].n !== 0) fail++;
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
