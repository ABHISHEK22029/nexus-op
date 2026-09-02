#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   chain-ui — drive one order through the real forms, end to end.

     quotation → convert → order → make → production → output → stock in
       → delivery challan → dispatch → stock out → invoice

   Every number is asserted at the hop where it is produced, against the
   database, not against the screen that produced it. A screen that shows
   ₹94,400 while storing ₹85,000 passes a screenshot test and fails this one.

   Everything before this drove the API with curl. That proves the endpoints
   compose; it does not prove a person can reach them. The gap is real: the
   standalone "New Production Order" form collects a free-text product name
   and no customer order, so a production order raised that way can never
   contribute produced_qty to the requirements engine — which is invisible
   from curl, because curl was passing customerOrderId all along.

   Records are tagged with a run marker and can be removed afterwards with
   scripts/clean-chain.js.

   Env: UI_BASE, API_BASE, UI_EMAIL, UI_PASSWORD, PROJECT_ID
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }

const MARK = `UITEST-${Date.now().toString(36).toUpperCase()}`;

/* The numbers under test. Chosen so every intermediate is exact in decimal —
   a rounding disagreement should be a real finding, not an artefact of
   picking 3 units at ₹33.33. */
const QTY = 100;
const RATE = 850;          // ₹85,000 gross
const DISCOUNT = 5000;     // ₹80,000 taxable
const GST = 18;            // ₹14,400 tax
const EXPECT_GROSS = QTY * RATE;
const EXPECT_TAXABLE = EXPECT_GROSS - DISCOUNT;
const EXPECT_TAX = EXPECT_TAXABLE * GST / 100;
const EXPECT_TOTAL = EXPECT_TAXABLE + EXPECT_TAX;

const OUTPUT_QTY = 60;     // partial production
const DISPATCH_QTY = 40;   // partial dispatch

let token, auth;
const results = [];
const step = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `\n       ${detail}` : ''}`);
  return ok;
};
const api = async (path, opts = {}) => {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) } });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};
const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v) => Number(v ?? 0);
const near = (a, b, tol = 0.5) => Math.abs(num(a) - num(b)) <= tol;

/* ── driving the forms ────────────────────────────────────────────────
   Selectors are by visible label, because that is what survives a
   restyle and what a person actually uses. The label resolution mirrors
   the three shapes these forms use: label[for], a wrapping <label>, and
   a sibling <label> above the control. */
const FIELD_HELPERS = `
  function labelOf(el) {
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return l.innerText; }
    const w = el.closest('label'); if (w) return w.innerText;
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const lab = p.querySelector(':scope > label'); if (lab) return lab.innerText;
      const t = [...p.childNodes].filter(c => c.nodeType === 1 && c !== el && !c.contains(el))
        .map(c => (c.innerText || '').trim()).find(Boolean);
      if (t && t.length < 60) return t;
    }
    return '';
  }
  function findField(pattern, kind) {
    const re = new RegExp(pattern, 'i');
    const all = [...document.querySelectorAll(kind || 'input, select, textarea')];
    return all.find(el => re.test((labelOf(el) || '') + ' ' + (el.placeholder || ''))) || null;
  }
  function setNative(el, value) {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
`;

async function setField(page, pattern, value) {
  return page.evaluate((p, v, H) => {
    eval(H);
    const el = findField(p);
    if (!el) return false;
    setNative(el, String(v));
    return true;
  }, pattern, value, FIELD_HELPERS);
}

/* Placeholder options are skipped unless asked for by name. Selecting with
   /\w/ matched "— Select —" first, so the form submitted with no customer
   and the whole chain reported "quotation not created" when the real fault
   was one option too high in the list. */
const PLACEHOLDER = /^\s*[—-]|^\s*(select|choose|none|free text)\b/i;

async function pickOption(page, pattern, optionRe) {
  return page.evaluate((p, o, H, ph) => {
    eval(H);
    const el = findField(p, 'select');
    if (!el) return null;
    const re = new RegExp(o, 'i');
    const phRe = new RegExp(ph, 'i');
    const opts = [...el.options];
    const opt = opts.find(x => re.test(x.text) && !phRe.test(x.text))
             || opts.find(x => re.test(x.text));
    if (!opt) return null;
    setNative(el, opt.value);
    return opt.text.trim();
  }, pattern, optionRe, FIELD_HELPERS, PLACEHOLDER.source);
}

async function clickText(page, label, tag = 'button, a[href], [role=button]') {
  return page.evaluate((l, t) => {
    const re = new RegExp(l, 'i');
    const b = [...document.querySelectorAll(t)].find(x => re.test((x.innerText || '').trim()));
    if (!b) return false;
    b.click();
    return true;
  }, label, tag);
}

const settle = (ms = 1500) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`\n╔═══ CHAIN TEST · ${MARK} ═══╗\n`);

  token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  if (!token) { console.error('could not sign in'); process.exit(1); }
  auth = { Authorization: `Bearer ${token}` };

  const projects = await api('/projects');
  const plist = Array.isArray(projects.body) ? projects.body : (projects.body.items || []);
  const project = plist.find(p => String(p.id) === process.env.PROJECT_ID) || plist[0];

  /* Order a product that HAS a bill of materials. The first run of this test
     picked whatever SKU came first, which was one with no BOM — so the
     requirements engine correctly returned nothing and the assertion
     "the engine sees this order" passed without exercising anything at all.
     A test that cannot fail is worse than no test. */
  const skus = (await api('/skus?limit=100')).body;
  const skuList = skus.items || skus || [];
  let bomSku = null, bomLines = [];
  for (const s of skuList) {
    const b = await api(`/skus/${s.id}/bom`);
    const lines = Array.isArray(b.body) ? b.body : (b.body?.items || []);
    if (lines.length) { bomSku = s; bomLines = lines; break; }
  }
  console.log(bomSku
    ? `  ordering "${bomSku.name}" — ${bomLines.length} BOM line(s), so the requirements engine has something to explode`
    : `  ⚠ no SKU on this database has a bill of materials — the requirements assertions will be vacuous`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('dialog', async d => { await d.accept(); });          // the Convert confirm
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e).slice(0, 200)));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([t, p]) => {
    localStorage.setItem('nexus_token', t);
    localStorage.setItem('nexus_active_project', p);
  }, [token, String(project.id)]);

  console.log(`  project: ${project.name} (id ${project.id})`);
  console.log(`  ${QTY} × ${money(RATE)} = ${money(EXPECT_GROSS)} − ${money(DISCOUNT)} = ${money(EXPECT_TAXABLE)} + ${GST}% = ${money(EXPECT_TOTAL)}\n`);

  const DESC = `${MARK} Fabricated Bracket`;

  /* ═══ 1 · QUOTATION ═══════════════════════════════════════════════ */
  console.log('─── 1 · quotation ───');
  await page.goto(`${UI}/sales-quotations`, { waitUntil: 'networkidle2' });
  await settle(1200);
  await clickText(page, 'New Quotation');
  await settle(900);

  const cust = await pickOption(page, 'Customer', '\\w');
  /* Pick a real SKU, not free text. A free-text line has no sku_id, so it
     can never explode into a bill of materials — the requirements engine
     returns nothing for it and the whole "what do I need to buy" half of
     the product sits idle. Testing the free-text path only would have hidden
     that the SKU path works. The description is set AFTER the SKU because
     choosing one overwrites it. */
  const sku = await pickOption(page, '^SKU', bomSku ? escapeRe(bomSku.name) : '\\w');
  await settle(500);
  await setField(page, 'GST %', GST);
  await setField(page, 'Description', DESC);
  await setField(page, '^Qty', QTY);
  await setField(page, 'Unit', 'nos');
  await setField(page, 'Rate', RATE);
  await setField(page, 'Discount', DISCOUNT);
  await settle(400);
  await clickText(page, 'Create Quotation');
  await settle(2200);

  /* Identify the new record by its line description, not by "the newest
     row" — another session writing to the same database would make that
     silently pick up someone else's quotation. */
  const quotes = await api('/sales-quotations?limit=50');
  let quote = null;
  for (const q of (quotes.body.items || quotes.body).slice(0, 12)) {
    const d = await api(`/sales-quotations/${q.id}`);
    if (JSON.stringify(d.body).includes(MARK)) { quote = d.body; break; }
  }

  if (!step('quotation created through the form', !!quote,
      quote ? `${quote.quote_number} for ${cust}, SKU "${sku}"` : 'no quotation contains the run marker')) {
    await browser.close(); return report();
  }

  step('quotation line keeps the chosen SKU',
    !!(quote.items || [])[0]?.sku_id,
    `sku_id=${(quote.items || [])[0]?.sku_id ?? 'NULL'}` +
    ((quote.items || [])[0]?.sku_id ? '' : '  ← a line with no SKU can never explode into a BOM'));

  step('quotation carries a date',
    !!quote.quote_date,
    `quote_date=${quote.quote_date ?? 'NULL'}` + (quote.quote_date ? '' : '  ← the date field starts empty and nothing fills it'));

  step('quotation gross = qty × rate',
    near(quote.sub_total, EXPECT_GROSS),
    `sub_total ${money(quote.sub_total)}, expected ${money(EXPECT_GROSS)}`);

  step('quotation tax = 18% of (gross − discount)',
    near(quote.gst_total, EXPECT_TAX),
    `gst_total ${money(quote.gst_total)}, expected ${money(EXPECT_TAX)}` +
    `  [cgst ${money(quote.cgst)} sgst ${money(quote.sgst)} igst ${money(quote.igst)}]`);

  step('quotation GST split is CGST+SGST or IGST, never both',
    (num(quote.cgst) > 0 && num(quote.sgst) > 0 && num(quote.igst) === 0) ||
    (num(quote.igst) > 0 && num(quote.cgst) === 0 && num(quote.sgst) === 0),
    quote.interstate ? 'inter-state → IGST' : 'intra-state → CGST + SGST');

  step('quotation net = taxable + tax',
    near(quote.net_amount, EXPECT_TOTAL),
    `net_amount ${money(quote.net_amount)}, expected ${money(EXPECT_TOTAL)}`);

  step('amount in words matches the figure',
    /ninety four thousand four hundred/i.test(quote.amount_in_words || ''),
    `"${quote.amount_in_words}"`);

  /* ═══ 2 · CONVERT TO ORDER ════════════════════════════════════════ */
  console.log('\n─── 2 · convert to order ───');
  await page.goto(`${UI}/sales-quotations`, { waitUntil: 'networkidle2' });
  await settle(1400);

  const convClicked = await page.evaluate((qn) => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const row = rows.find(r => r.innerText.includes(qn));
    if (!row) return 'row not found';
    const b = [...row.querySelectorAll('button')].find(x => /convert/i.test(x.innerText));
    if (!b) return 'convert button not found';
    b.click(); return 'clicked';
  }, quote.quote_number);
  await settle(2600);

  const qAfter = await api(`/sales-quotations/${quote.id}`);
  const orderId = qAfter.body.converted_order_id;
  step('quotation converts to a customer order',
    convClicked === 'clicked' && !!orderId,
    `${convClicked}; status now ${qAfter.body.status}, order id ${orderId ?? '—'}`);

  let order = null;
  if (orderId) {
    order = (await api(`/customer-orders/${orderId}`)).body;
    const line = (order.items || [])[0] || {};
    step('order carries the quoted line',
      String(line.description || '').includes(MARK) && near(line.quantity, QTY),
      `"${line.description}" ${line.quantity} ${line.unit || ''}`);
    /* The column is `total` — not net_amount, which is what the quotation
       and the invoice call theirs. Asserting on the wrong name reported ₹0
       for an order that stored the right figure, so the assertion now names
       the column and does not fall back to the line rate, which was masking
       the header being empty. */
    const orderTotal = order.total;
    step('order carries the quoted value',
      near(orderTotal, EXPECT_TOTAL),
      `total ${money(orderTotal ?? 0)}, expected ${money(EXPECT_TOTAL)}` +
      `  [sub ${money(order.sub_total)} − disc ${money(order.discount)} + gst ${money(order.gst_total)}]`);

    step('order inherits the quotation\'s tax treatment',
      !!order.interstate === !!quote.interstate &&
      near(order.gst_total, EXPECT_TAX),
      `interstate ${quote.interstate} → ${order.interstate}, gst ${money(order.gst_total)} (expected ${money(EXPECT_TAX)})`);

    step('order carries a date and an amount in words',
      !!order.order_date && !!order.amount_in_words,
      `${order.order_date} · "${order.amount_in_words}"`);
  }

  /* ═══ 3 · MAKE → PRODUCTION ═══════════════════════════════════════ */
  console.log('\n─── 3 · make it (order line → production) ───');
  let prodOrder = null;
  if (order) {
    await page.goto(`${UI}/customer-orders`, { waitUntil: 'networkidle2' });
    await settle(1600);

    const expanded = await page.evaluate((onum) => {
      const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(onum));
      if (!row) return false; row.click(); return true;
    }, order.order_number);
    await settle(1800);

    const madeClick = await clickText(page, '^Make$');
    await settle(3000);

    const prods = await api(`/production?limit=50&projectId=${project.id}`);
    const plist2 = prods.body.items || prods.body || [];
    for (const p of plist2.slice(0, 10)) {
      const d = await api(`/production/${p.id}`);
      if (d.body?.customer_order_id === orderId) { prodOrder = d.body; break; }
    }
    step('"Make" creates a production order', madeClick && !!prodOrder,
      prodOrder ? `${prodOrder.prod_number} for "${prodOrder.product_name}"` : 'no production order references this customer order');

    if (prodOrder) {
      step('production order is linked to the customer order AND the SKU',
        !!prodOrder.customer_order_id && !!prodOrder.sku_id,
        `customer_order_id=${prodOrder.customer_order_id ?? 'NULL'}  sku_id=${prodOrder.sku_id ?? 'NULL'}` +
        (prodOrder.sku_id ? '' : '  ← without sku_id the requirements engine cannot subtract produced qty'));
      step('production order carries an owner',
        !!prodOrder.owner_id, `owner_id=${prodOrder.owner_id ?? 'NULL'}`);
    }
  }

  /* ═══ 4 · OUTPUT → STOCK IN ═══════════════════════════════════════ */
  console.log('\n─── 4 · record output → stock in ───');
  let stockBefore = null, stockAfter = null;
  if (prodOrder) {
    const inv = await api('/inventory');
    stockBefore = (inv.body.items || inv.body || []);

    await page.goto(`${UI}/production/${prodOrder.id}`, { waitUntil: 'networkidle2' });
    await settle(1800);

    /* This screen has two near-identical rows — Finished Output (Product /
       Pcs / Weight) and Material Issued (Material / Qty (kg)) — each ending
       in an unlabelled + button, plus a delete button on every existing
       line. Addressing the fields globally picked up the wrong row, and
       "the last icon-only button" was whichever delete button rendered
       last. So: find the Finished Output card, then work inside it. */
    const filled = await page.evaluate((name, qty) => {
      /* The smallest div containing the heading is the heading itself, which
         holds no inputs. Take the smallest one that actually contains the
         row's controls. */
      const card = [...document.querySelectorAll('div')]
        .filter(d => /Finished Output/i.test(d.innerText || '') && d.querySelectorAll('input').length >= 2)
        .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (!card) return { ok: false, why: 'no Finished Output card' };

      const inputs = [...card.querySelectorAll('input')];
      const byLabel = (re) => inputs.find(i => {
        const lab = i.parentElement?.querySelector('label');
        return lab && re.test(lab.innerText);
      });
      const prod = byLabel(/product/i), pcs = byLabel(/^pcs/i), wt = byLabel(/weight/i);
      if (!prod || !pcs) return { ok: false, why: `product=${!!prod} pcs=${!!pcs}`, labels: inputs.map(i => i.parentElement?.querySelector('label')?.innerText) };

      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(prod, name); set(pcs, qty); if (wt) set(wt, qty * 2);
      return { ok: true };
    }, prodOrder.product_name, OUTPUT_QTY);
    await settle(600);

    const submitted = await page.evaluate(() => {
      /* The smallest div containing the heading is the heading itself, which
         holds no inputs. Take the smallest one that actually contains the
         row's controls. */
      const card = [...document.querySelectorAll('div')]
        .filter(d => /Finished Output/i.test(d.innerText || '') && d.querySelectorAll('input').length >= 2)
        .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (!card) return false;
      const b = [...card.querySelectorAll('button')].find(x => !x.innerText.trim() && x.querySelector('svg'));
      if (!b) return false; b.click(); return true;
    });
    await settle(2800);

    const after = await api(`/production/${prodOrder.id}`);
    const outputs = after.body.output || [];
    step('output recorded through the form', outputs.length > 0,
      outputs.length ? `${outputs[0].item_name} — ${outputs[0].output_qty} pcs`
        : `form fill: ${JSON.stringify(filled)}, submit clicked: ${submitted}`);

    if (outputs.length) {
      step('output quantity stored as entered', near(outputs[0].output_qty, OUTPUT_QTY),
        `stored ${outputs[0].output_qty}, entered ${OUTPUT_QTY}`);
      step('output posted to the stock ledger',
        !!outputs[0].stock_applied && !!outputs[0].inventory_id,
        `stock_applied=${outputs[0].stock_applied} inventory_id=${outputs[0].inventory_id ?? 'NULL'}` +
        (outputs[0].stock_applied ? '' : '  ← finished goods never reached stock'));

      const inv2 = await api('/inventory');
      stockAfter = (inv2.body.items || inv2.body || []);
      const row = stockAfter.find(r => r.id === outputs[0].inventory_id);
      step('stock balance reflects the output', !!row && num(row.quantity) >= OUTPUT_QTY,
        row ? `inventory row ${row.id}: ${row.quantity} on hand` : 'no inventory row for this output');

      const mv = await api(`/inventory/movements?limit=20`);
      const moves = Array.isArray(mv.body) ? mv.body : (mv.body.items || mv.body.data || []);
      const m = moves.find(x => num(x.quantity) === OUTPUT_QTY);
      step('a signed ledger movement exists for the output', !!m,
        m ? `${m.source_type || m.reason || 'movement'} ${num(m.quantity) > 0 ? '+' : ''}${m.quantity} on inventory ${m.inventory_id}`
          : `no +${OUTPUT_QTY} movement among ${moves.length} recent (HTTP ${mv.status})`);
    }
  }

  /* ═══ 5 · DELIVERY CHALLAN → STOCK OUT ════════════════════════════ */
  console.log('\n─── 5 · delivery challan → stock out ───');
  let challan = null;
  if (order) {
    await page.goto(`${UI}/delivery-challans`, { waitUntil: 'networkidle2' });
    await settle(1400);
    await clickText(page, 'New Challan');
    await settle(1100);

    const pre = await pickOption(page, 'Prefill from order', order.order_number);
    await settle(1200);
    if (!pre) await pickOption(page, '^Customer', '\\w');
    await setField(page, 'Description', DESC);
    await setField(page, '^Qty', DISPATCH_QTY);
    await setField(page, 'Unit', 'nos');
    await setField(page, 'Value', DISPATCH_QTY * RATE);
    await settle(400);
    await clickText(page, 'Create Challan|Save Challan|^Create$');
    await settle(2600);

    const dcs = await api('/delivery-challans?limit=30');
    for (const d of (dcs.body.items || dcs.body || []).slice(0, 10)) {
      const full = await api(`/delivery-challans/${d.id}`);
      if (JSON.stringify(full.body).includes(MARK)) { challan = full.body; break; }
    }
    step('delivery challan created through the form', !!challan,
      challan ? `${challan.challan_number} · prefilled from ${pre || 'nothing'}` : 'no challan contains the run marker');

    if (challan) {
      step('challan is linked to the customer order',
        !!(challan.customer_order_id || challan.order_id),
        `customer_order_id=${challan.customer_order_id ?? challan.order_id ?? 'NULL'}`);

      /* Dispatch is the event that moves stock. */
      await page.goto(`${UI}/delivery-challans`, { waitUntil: 'networkidle2' });
      await settle(1500);
      const disp = await page.evaluate((cn) => {
        const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(cn));
        if (!row) return 'row not found';
        const sel = row.querySelector('select');
        if (!sel) return 'no status control';
        const opt = [...sel.options].find(o => /dispatch/i.test(o.text));
        if (!opt) return 'no Dispatched option';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 'dispatched';
      }, challan.challan_number);
      await settle(3000);

      const dcAfter = (await api(`/delivery-challans/${challan.id}`)).body;
      step('challan marked Dispatched', /dispatch/i.test(dcAfter.status || ''),
        `${disp}; status now ${dcAfter.status}`);
      step('dispatch took the goods out of stock',
        !!dcAfter.stock_applied,
        `stock_applied=${dcAfter.stock_applied}` + (dcAfter.stock_applied ? '' : '  ← dispatched goods still counted as on hand'));

      if (stockAfter && dcAfter.stock_applied) {
        const inv3 = await api('/inventory');
        const rows3 = inv3.body.items || inv3.body || [];
        /* Compared as totals rather than per row: a dispatch may draw from
           more than one stock row, and the invariant under test is that the
           quantity leaving stock equals the quantity on the challan. */
        const totalBefore = stockAfter.reduce((s, r) => s + num(r.quantity), 0);
        const totalAfter = rows3.reduce((s, r) => s + num(r.quantity), 0);
        step('stock fell by exactly the dispatched quantity',
          near(totalBefore - totalAfter, DISPATCH_QTY),
          `${totalBefore} → ${totalAfter} (moved ${totalBefore - totalAfter}, dispatched ${DISPATCH_QTY})`);
      }
    }
  }

  /* ═══ 6 · INVOICE ═════════════════════════════════════════════════ */
  console.log('\n─── 6 · invoice ───');
  let invoice = null;
  if (order) {
    await page.goto(`${UI}/customer-orders/${orderId}/invoice`, { waitUntil: 'networkidle2' });
    await settle(3200);   // the prefill is a second fetch after the page renders

    /* Read the input VALUES, not the page text — the description sits in an
       <input>, whose value never appears in innerText. Checking innerText
       reported "the invoice opened empty" for a form that was correctly
       prefilled, and the invoice it produced was right. */
    const prefilled = await page.evaluate(() =>
      [...document.querySelectorAll('input, textarea')].map(i => i.value).join(' | '));
    step('invoice builder prefills from the order',
      prefilled.includes(MARK),
      prefilled.includes(MARK) ? 'the ordered line carried across into the builder'
        : `no line matching the order — inputs held: ${prefilled.slice(0, 160)}`);

    await setField(page, 'GST Rate', GST);
    await setField(page, 'Discount', DISCOUNT);
    await settle(700);

    await clickText(page, 'Create Invoice');
    await settle(3000);

    const invs = await api('/sales-invoices?limit=30');
    for (const iv of (invs.body.items || invs.body || []).slice(0, 10)) {
      const full = await api(`/sales-invoices/${iv.id}`);
      if (JSON.stringify(full.body).includes(MARK)) { invoice = full.body; break; }
    }
    step('invoice created through the builder', !!invoice,
      invoice ? `${invoice.invoice_number}` : 'no invoice contains the run marker');

    if (invoice) {
      step('invoice references the customer order',
        !!(invoice.customer_order_id || invoice.order_id),
        `customer_order_id=${invoice.customer_order_id ?? invoice.order_id ?? 'NULL'}`);

      const invTaxable = num(invoice.sub_total) - num(invoice.discount);
      step('invoice taxable value = quoted value less discount',
        near(invTaxable, EXPECT_TAXABLE, 1),
        `sub_total ${money(invoice.sub_total)} − discount ${money(invoice.discount)} = ${money(invTaxable)}, expected ${money(EXPECT_TAXABLE)}`);

      const invTax = num(invoice.gst_total) || (num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst));
      step('invoice tax = 18% of taxable',
        near(invTax, EXPECT_TAX, 1),
        `cgst ${money(invoice.cgst ?? 0)} + sgst ${money(invoice.sgst ?? 0)} + igst ${money(invoice.igst ?? 0)} = ` +
        `${money(invTax)}, expected ${money(EXPECT_TAX)}`);

      const intra = num(invoice.cgst) > 0 && num(invoice.sgst) > 0 && num(invoice.igst) === 0;
      const inter = num(invoice.igst) > 0 && num(invoice.cgst) === 0 && num(invoice.sgst) === 0;
      step('GST split is CGST+SGST or IGST, never both', intra || inter,
        intra ? 'intra-state: CGST + SGST' : inter ? 'inter-state: IGST' : 'neither — both or neither set, which no invoice may be');

      step('invoice tax treatment agrees with the quotation',
        !!invoice.interstate === !!quote.interstate,
        `quotation interstate=${quote.interstate}, invoice interstate=${invoice.interstate}`);

      const invTotal = invoice.net_amount ?? invoice.total_amount ?? invoice.grand_total;
      step('invoice grand total = taxable + tax',
        near(invTotal, EXPECT_TOTAL, 1.5),
        `stored ${money(invTotal)}, expected ${money(EXPECT_TOTAL)}`);

      step('invoice carries the Rule 46 essentials',
        !!(invoice.invoice_number && invoice.invoice_date && (invoice.place_of_supply || invoice.customer_gstin || invoice.customer_name)),
        `no ${invoice.invoice_number}, dated ${invoice.invoice_date}, place of supply ${invoice.place_of_supply || '—'}`);
    }
  }

  /* ═══ 7 · WHAT THE CHAIN LEFT BEHIND ══════════════════════════════ */
  console.log('\n─── 7 · the order after all of it ───');
  if (order) {
    const fin = (await api(`/customer-orders/${orderId}`)).body;
    /* "not Open" was too weak to fail: it passed while the order read
       "Delivered" after 40 of 100 had shipped. A partial dispatch has one
       correct answer and this now names it. */
    step(`order reads Partially Delivered after ${DISPATCH_QTY} of ${QTY} shipped`,
      /partially delivered/i.test(fin.status || ''),
      `status is "${fin.status}"` +
      (/^delivered$/i.test(fin.status || '')
        ? `  ← ${QTY - DISPATCH_QTY} units never shipped, yet the order says it is done` : ''));

    /* The requirements engine is the reason the BOM, the order and the
       production record exist at all. Asserting only "HTTP 200" passed on an
       empty result. */
    const mr = await api(`/material-requirements?orderId=${orderId}`);
    const mrItems = mr.body.items || [];
    if (bomSku) {
      step('the requirements engine explodes the ordered SKU into materials',
        mr.status === 200 && mrItems.length > 0,
        `HTTP ${mr.status}, ${mrItems.length} material line(s) from ${bomLines.length} BOM line(s)` +
        (mrItems.length ? '' : '  ← the BOM did not reach the engine'));

      if (mrItems.length) {
        /* Required = (ordered − produced) × qty per unit. We ordered QTY and
           produced OUTPUT_QTY, so the outstanding demand is the remainder —
           this is the assertion that proves production actually feeds back
           into what needs buying. */
        const b = bomLines[0];
        const perUnit = num(b.qty_per_unit);
        const expectedRequired = (QTY - OUTPUT_QTY) * perUnit;
        const line = mrItems.find(m => num(m.qty_per_unit ?? perUnit) && m.material) || mrItems[0];
        step('required quantity nets off what has already been produced',
          near(line.required, expectedRequired, Math.max(0.01, expectedRequired * 0.02)),
          `required ${line.required} for "${line.material}"; ` +
          `(${QTY} ordered − ${OUTPUT_QTY} produced) × ${perUnit}/unit = ${expectedRequired}`);
      }
    } else {
      step('the requirements engine responds', mr.status === 200,
        `HTTP ${mr.status} — no SKU has a BOM on this database, so nothing to explode`);
    }
  }

  if (jsErrors.length) step('no JavaScript errors during the run', false, jsErrors[0]);
  else step('no JavaScript errors during the run', true);

  await browser.close();
  report();

  function report() {
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`\n  ${pass} of ${results.length} assertions passed        run marker: ${MARK}\n`);
    const fails = results.filter(r => !r.ok);
    if (fails.length) {
      console.log('  failed:\n');
      fails.forEach((f, i) => console.log(`   ${i + 1}. ${f.name}\n      ${f.detail}\n`));
    }
    console.log(`  clean up with:  node backend/scripts/clean-chain.js ${MARK}\n`);
    process.exit(fails.length ? 1 : 0);
  }
})().catch(e => { console.error('\n💥 chain test threw:', e.message, '\n', e.stack?.split('\n')[1] || ''); process.exit(1); });
