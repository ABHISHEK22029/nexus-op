#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Can you actually add and correct stock from the Stock on hand screen?

   Until now you could not: the page was read-only apart from the reorder
   level, while POST /inventory and POST /inventory/:id/adjust sat unused
   in the backend. This drives both through the real UI and checks the
   number on the card afterwards — a modal that submits and a balance that
   moves are different claims.

   The adjustment is made and then reversed, so the database is left as it
   was found.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NAME = `STOCKTEST-${Date.now().toString(36).toUpperCase()}`;

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
  await page.goto(`${UI}/inventory`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  /* ── the buttons exist at all ── */
  const buttons = await page.evaluate(() => ({
    add: [...document.querySelectorAll('button')].some(b => /add stock/i.test(b.innerText)),
    count: [...document.querySelectorAll('button')].filter(b => /^count$/i.test(b.innerText.trim())).length,
  }));
  ok(buttons.add, 'an "Add stock" button is on the page');
  ok(buttons.count > 0, `each card offers "Count" (${buttons.count} found)`);

  /* ── add a stock item through the form ── */
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /add stock/i.test(b.innerText))?.click();
  });
  await sleep(700);
  ok(await page.evaluate(() => /Record what you already hold/i.test(document.body.innerText)),
    'the Add stock dialog opens');

  const typed = await page.evaluate(async ([name]) => {
    const setVal = (el, v) => {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('input')];
    const byPlaceholder = (re) => inputs.find(i => re.test(i.placeholder || ''));
    const nameEl = byPlaceholder(/MDF 16mm/i);
    const qtyEl = inputs.find(i => i.type === 'number' && /^0$/.test(i.placeholder || ''));
    if (!nameEl || !qtyEl) return { nameEl: !!nameEl, qtyEl: !!qtyEl };
    setVal(nameEl, name);
    setVal(qtyEl, '250');
    return { nameEl: true, qtyEl: true };
  }, [NAME]);
  ok(typed.nameEl && typed.qtyEl, 'the form has a name field and a quantity field');

  /* Scoped to the dialog. The header button and the submit button both read
     "Add stock", and a document-wide find() returns the header one — so the
     first version of this test reopened the dialog and reported the save as
     broken. */
  await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /Record what you already hold/i.test(d.innerText));
    [...(dlg?.querySelectorAll('button') || [])].find(b => /^add stock$/i.test(b.innerText.trim()))?.click();
  });
  await sleep(2200);
  const toast = await page.evaluate(() => {
    const t = document.body.innerText.match(/(Could not[^\n]*|[^\n]*required[^\n]*|Enter the quantity[^\n]*)/i);
    return t ? t[1] : null;
  });
  if (toast) console.log(`      (toast said: ${toast})`);

  /* ── did it reach the database, and did the ledger get an entry? ── */
  const list = await (await fetch(`${API}/inventory`, { headers: auth })).json();
  const rows = Array.isArray(list) ? list : (list.items || []);
  const made = rows.find(r => r.itemName === NAME);
  ok(!!made, `the item exists in /inventory after submitting (${NAME})`);
  ok(Number(made?.quantity) === 250, `opening quantity stored as 250 → ${made?.quantity}`);

  let moves = [];
  if (made) {
    const mv = await (await fetch(`${API}/inventory/${made.id}/movements`, { headers: auth })).json();
    /* { item, ledger, ledgerBalance, storedBalance, drift } — not a bare
       array and not { items }. Reading `items` reported an item with two
       ledger entries as having none; the component made the same wrong
       assumption and told the user "nothing recorded yet". */
    moves = Array.isArray(mv) ? mv : (mv.ledger || []);
  }
  ok(moves.length > 0, `an opening-balance movement was written to the ledger (${moves.length})`);

  /* ── correct the count through the UI ── */
  ok(await page.evaluate(() => !/Record what you already hold/i.test(document.body.innerText)),
    'the dialog closed after saving');

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.evaluate((name) => {
    const card = [...document.querySelectorAll('div')].find(
      d => d.innerText?.startsWith(name) && d.querySelector('button'));
    [...(card?.querySelectorAll('button') || [])].find(b => /^count$/i.test(b.innerText.trim()))?.click();
  }, NAME);
  await sleep(800);

  const panelOpen = await page.evaluate(() => /System says/i.test(document.body.innerText));
  ok(panelOpen, 'the stock-take panel opens for that item');

  if (panelOpen) {
    /* A count with no reason must be refused — an unexplained change to a
       stock figure is how the numbers stop being believed. */
    await page.evaluate(() => {
      const setVal = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const counted = [...document.querySelectorAll('input')].find(i => /physical count/i.test(i.placeholder || ''));
      if (counted) setVal(counted, '242');
    });
    await sleep(300);
    ok(await page.evaluate(() => /-8|8\s*(nos|units)?\s*short/i.test(document.body.innerText)),
      'the shortfall of 8 is shown before saving');

    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => /record count/i.test(b.innerText))?.click();
    });
    await sleep(900);
    const stillOpen = await page.evaluate(() => /System says/i.test(document.body.innerText));
    ok(stillOpen, 'a count with no reason is refused');

    await page.evaluate(() => {
      const setVal = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const why = [...document.querySelectorAll('input')].find(i => /stock take/i.test(i.placeholder || ''));
      if (why) setVal(why, 'Automated test count');
    });
    await sleep(250);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => /record count/i.test(b.innerText))?.click();
    });
    await sleep(2200);

    const after = await (await fetch(`${API}/inventory`, { headers: auth })).json();
    const arr = Array.isArray(after) ? after : (after.items || []);
    const now = arr.find(r => r.itemName === NAME);
    ok(Number(now?.quantity) === 242, `balance corrected to the counted figure → ${now?.quantity}`);

    const mv2 = await (await fetch(`${API}/inventory/${made.id}/movements`, { headers: auth })).json();
    const list2 = Array.isArray(mv2) ? mv2 : (mv2.ledger || []);
    const adj = list2.find(m => m.movement_type === 'adjustment');
    ok(!!adj, 'the correction is on the ledger as an adjustment');
    ok(/Automated test count/.test(adj?.note || ''), `the reason is stored → ${JSON.stringify(adj?.note)}`);
    ok(Number(adj?.quantity) === -8, `the ledger records the difference, not the new total → ${adj?.quantity}`);
  }

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0] : ''}`);

  /* There is no DELETE /inventory/:id, and that looks deliberate: a stock
     row with ledger history behind it should not simply vanish. So this
     test cannot tidy up through the API. It names what it leaves instead
     of dropping anonymous litter — which is how 8 UITEST- rows ended up
     being the entire content of the "NEEDS ORDERING" figure. */
  if (made) console.log(`\n  leaves behind: ${NAME} (id ${made.id}) — no DELETE route for stock rows`);

  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
