#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial, followed by hand from a real sign-up to the
   last step. Every action is done in the browser, the way the coach card
   says, so a card that names a button the screen does not have fails here.

   Sign-up → the two setup questions → the panel opens by itself → the
   first sale, six steps: the card, the pointer, only the fields the card
   asks for, the tick, Next → "Your first sale is done" → then the five
   steps for later → signing in again does not reopen it → the invited
   colleague's first sign-in opens it, with their role's steps.

   It also holds the tutorial to its promise of about three minutes: every
   click and every field a person fills in the first sale is counted, and
   at a newcomer's pace (5 s a click, 8 s a field, with reading time) it
   must come to three minutes or less.

   Throwaway tutwalk-*@example.test accounts, removed at the end.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-tutorial-walkthrough.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '../../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules/pg'));
const { purge } = require(path.join(B, 'scripts/lib/testAccounts'));
const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const OUT = process.env.SHOTS_DIR || path.join(require('os').tmpdir(), 'tutorial-walkthrough');
fs.mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36);
const EMAIL = `tutwalk-${stamp}@example.test`, PW = 'testpassword123';
const INVITEE = `tutwalk-inv-${stamp}@example.test`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const notes = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const note = (m) => { notes.push(m); console.log(`   📝 ${m}`); };

const HELPERS = `
window.__setV = (el, v) => {
  if (el.tagName === 'SELECT') {
    const opt = v === '*' ? [...el.options].find(o => o.value && !o.disabled) : [...el.options].find(o => new RegExp(v, 'i').test(o.textContent));
    if (!opt) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, opt.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};
window.__labelOf = (el) => {
  const bits = [el.getAttribute('aria-label'), el.placeholder, el.name, el.id];
  if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) bits.push(l.textContent); }
  const wrap = el.closest('label'); if (wrap) bits.push(wrap.textContent);
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++, p = p.parentElement) { const l = p.querySelector(':scope > label'); if (l) { bits.push(l.textContent); break; } }
  return bits.filter(Boolean).join(' | ').replace(/\\s+/g, ' ');
};
window.__vis = () => [...document.querySelectorAll('input, select, textarea')].filter(e => e.offsetParent && !['hidden', 'checkbox', 'file', 'radio'].includes(e.type));
window.__fill = (pairs) => {
  const misses = [];
  for (const [src, v] of pairs) {
    const re = new RegExp(src, 'i');
    const el = window.__vis().find(e => re.test(window.__labelOf(e)) && !e.disabled);
    if (!el || !window.__setV(el, v)) misses.push(src);
  }
  return misses;
};
window.__submit = () => { const bs = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled && !b.closest('.tut-coach, .tut-panel, nav, .nav-rail')); const el = bs.find(b => b.type === 'submit' && b.closest('form')) || bs.reverse().find(b => /^(Save|Save changes|Add|Create|Save customer|Save vendor)$/i.test((b.textContent || '').trim())); if (el) { el.click(); return (el.textContent || '').trim(); } return null; };
window.__fields = () => window.__vis().map(e => e.tagName.toLowerCase() + '[' + window.__labelOf(e).slice(0, 70) + ']');
window.__btns = () => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30)).filter(Boolean);
window.__click = (src, scope) => {
  const re = new RegExp(src, 'i');
  const root = scope ? document.querySelector(scope) : document;
  const el = [...(root || document).querySelectorAll('button, a, [role=button]')].filter(b => b.offsetParent && !b.disabled).find(b => re.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
  if (el) { el.click(); return (el.textContent || '').trim().slice(0, 40); }
  return null;
};
`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const newPage = async (ctx) => {
    const p = await (ctx || browser).newPage();
    await p.evaluateOnNewDocument(HELPERS);
    p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.accept());
    await p.setViewport({ width: 1440, height: 900 });
    return p;
  };
  const page = await newPage();
  const waitFor = (fn, ms = 12000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const coach = () => ev(() => document.querySelector('.tut-coach')?.innerText.replace(/\s+/g, ' ').trim() || '');
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
  const timings = [];
  /* What a person does in the first sale: clicks and fields typed or chosen. */
  const effort = { clicks: 0, fields: 0 };
  let counting = false;
  const did = (clicks, fields = 0) => { if (counting) { effort.clicks += clicks; effort.fields += fields; } };

  /* One step: the card names it, the pointer (if any) lands, the person does
     what the card says (act), the step ticks itself off. */
  const follow = async (label, title, target, act, doneText = `Done: ${title}`) => {
    console.log(`\n  ── ${label}: ${title}`);
    const shown = await waitFor((l, t) => { const c = document.querySelector('.tut-coach')?.innerText || ''; return c.includes(l) && c.includes(t); }, 10000, label, title);
    const card = await coach();
    ok(shown, `the card says “${card.slice(0, 150)}”`);
    /* It arrives with its screen: no "Take me there" for the page it is already going to. */
    if (counting) ok(!/Take me there/.test(card), 'it shows once its screen is there (no stray “Take me there”)');
    if (target) {
      const spot = await waitFor((src) => { const s = document.querySelector('.tut-spot'); return !!s && new RegExp(src, 'i').test(s.textContent); }, 8000, target);
      ok(spot, `the pointer is on “${await ev(() => document.querySelector('.tut-spot')?.textContent.trim() || 'nothing')}”`);
    }
    await shot(`${title.replace(/\W+/g, '-').toLowerCase()}-a`);
    await act();
    const t0 = Date.now();
    const done = await waitFor((d) => (document.querySelector('.tut-coach')?.innerText || '').includes(d), 15000, doneText);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    timings.push(`${title}: ${secs}s`);
    ok(done, `it ticks itself off (${done ? `${secs}s after saving` : `not after 15s; card: ${(await coach()).slice(0, 120)}`})`);
    await shot(`${title.replace(/\W+/g, '-').toLowerCase()}-b`);
    if (!done) {
      console.log('      fields:', (await ev(() => window.__fields())).join(', ').slice(0, 600));
      console.log('      buttons:', (await ev(() => window.__btns())).join(' | ').slice(0, 600));
      throw new Error(`“${title}” did not tick; stopping here`);
    }
  };
  const press = async (src, scope) => { const b = await ev((s, sc) => window.__click(s, sc), src, scope); did(1); await sleep(600); return b; };
  const pressSpot = async () => { const b = await ev(() => { const s = document.querySelector('.tut-spot'); s?.click(); return s?.textContent.trim(); }); did(1); await sleep(700); return b; };
  const submit = async () => { const b = await ev(() => window.__submit()); did(1); return b; };
  const fill = async (pairs, what) => {
    const miss = await ev((p) => window.__fill(p), pairs);
    did(0, pairs.length - miss.length);
    if (miss.length) { ok(false, `${what}: no field for ${miss.join(', ')}`); console.log('      fields:', (await ev(() => window.__fields())).join(', ').slice(0, 900)); }
    await sleep(300);
  };
  const next = async () => press('^Next:', '.tut-coach');

  try {
    /* ── sign up, as a new customer would ── */
    console.log('\n  ── sign-up');
    await page.goto(`${UI}/signup`, { waitUntil: 'networkidle2' });
    await ev(([em, pw]) => {
      const ins = [...document.querySelectorAll('input')];
      const email = ins.find(i => i.type === 'email'); const pws = ins.filter(i => i.type === 'password');
      const name = ins.find(i => i !== email && !pws.includes(i));
      window.__setV(name, 'Priya Walkthrough'); window.__setV(email, em); pws.forEach(p => window.__setV(p, pw));
    }, [EMAIL, PW]);
    await ev(() => window.__click('sign ?up|create|register|get started')).catch(() => {});   // it loads the next page
    await waitFor(() => location.pathname === '/welcome', 15000);
    ok(await ev(() => location.pathname) === '/welcome', 'sign-up lands on the two setup questions');
    await waitFor(() => [...document.querySelectorAll('#root input')].some(i => i.type !== 'hidden' && i.offsetParent), 15000);
    await ev(() => {
      window.__setV([...document.querySelectorAll('#root input')].filter(i => i.type !== 'hidden')[0], 'Walkthrough Fabricators');
      [...document.querySelectorAll('#root button')].find(b => ['Just me', '2–10', '11–50', '51–200', '200+'].includes(b.innerText.trim()))?.click();
    });
    await sleep(400);
    await ev(() => window.__click('continue|start|finish|save|done|get going')).catch(() => {});
    await waitFor(() => location.pathname === '/dashboard', 15000);
    ok(await waitFor(() => !!document.querySelector('.tut-panel'), 12000), 'on reaching the dashboard the tutorial opens by itself');
    await waitFor(() => /of \d+ done/.test(document.querySelector('.tut-progress')?.innerText || ''));
    const intro = await ev(() => document.querySelector('.tut-panel')?.innerText.replace(/\s+/g, ' ') || '');
    ok(/Make your first sale in about 3 minutes/.test(intro) && /0 of 6 done · first sale/.test(intro), 'with the welcome: “Make your first sale in about 3 minutes”, 0 of 6 done');
    ok(/YOUR FIRST SALE · about 3 minutes|Your first sale · about 3 minutes/i.test(intro) && /When you are ready · a minute or two each/i.test(intro), 'the first sale comes first; the rest waits under “When you are ready”');
    await shot('00-welcome');

    await page.keyboard.press('Escape'); await sleep(300);
    ok(!(await ev(() => !!document.querySelector('.tut-panel'))), 'Escape closes the panel');
    await page.click('.nav-rail-guide'); await waitFor(() => !!document.querySelector('.tut-panel'));
    ok(await ev(() => !!document.activeElement?.closest('.tut-panel')), 'opening it puts the keyboard in it');

    /* ══ the first sale: counted from Start to the payment ══ */
    counting = true;
    const saleStart = Date.now();
    await press('^Start$', '.tut-panel');

    await follow('Step 1 of 6', 'Add a customer', 'Add Customer', async () => {
      await pressSpot();
      await fill([['Customer Name', 'BuildRight Infra'], ['Billing State', 'Telangana']], 'customer');
      await submit();
    });
    ok(await waitFor(() => /Moving on in a moment/.test(document.querySelector('.tut-coach')?.innerText || ''), 3000),
      'no Next to press: the card says it is moving on');

    await follow('Step 2 of 6', 'Add a product', 'Add SKU', async () => {
      ok(await ev(() => location.pathname) === '/items', 'and it moved on to Items by itself');
      await pressSpot();
      await fill([['V-Type Cross Arm|\\| ?Name \\*', 'Steel bracket 75x75'], ['Price', '1500']], 'product');
      await submit();
    });

    await follow('Step 3 of 6', 'Make a quotation', 'New Quotation', async () => {
      await pressSpot();
      await waitFor(() => !!document.querySelector('select[aria-label="Line 1 product"]'));
      await fill([['^Customer', '*'], ['Line 1 product', '*'], ['Line 1 quantity', '10']], 'quotation');
      await press('^Create Quotation$');
    });

    await follow('Step 4 of 6', 'Turn it into an order', 'Convert', async () => {
      await pressSpot();
      did(1);   // the “Convert to order?” confirmation
    });

    await follow('Step 5 of 6', 'Raise the invoice', 'Create invoice', async () => {
      ok(/^\/customer-orders\/\d+\/invoice$/.test(await ev(() => location.pathname)), 'it opens the new order’s invoice straight away, no list to search');
      await pressSpot();
    });

    await follow('Step 6 of 6', 'Record the payment', '^\\+?\\s*Add$', async () => {
      ok(/^\/sales-invoices\/\d+$/.test(await ev(() => location.pathname)), 'and stays on the new invoice, where the payment goes');
      await waitFor(() => !!document.querySelector('input[aria-label="Payment amount"]'), 8000);
      const due = await ev(() => (document.body.innerText.match(/(?:Balance due|BALANCE DUE)[^\d₹]*₹\s?([\d,]+(?:\.\d+)?)/) || [])[1]);
      await fill([['Payment amount', String(due || '100').replace(/,/g, '')]], 'payment');
      await pressSpot();
    }, 'Your first sale is done');
    counting = false;

    /* The promise: about three minutes. */
    const est = effort.clicks * 5 + effort.fields * 8 + 6 * 10;   // + reading each card
    console.log(`\n  ── the first sale took a person ${effort.clicks} clicks and ${effort.fields} fields (machine time ${((Date.now() - saleStart) / 1000).toFixed(0)}s)`);
    ok(est <= 180, `at a newcomer's pace that is about ${Math.floor(est / 60)} min ${est % 60} s, within 3 minutes`);
    const fin = await coach();
    ok(/Finish for now/.test(fin) && /Keep going: Add your GSTIN and bank details/.test(fin), `the card offers to stop there: “${fin.slice(0, 120)}”`);
    const ring = await ev(() => document.querySelector('.nav-rail-guide')?.getAttribute('aria-label'));
    ok(/first sale done, 5 more when you are ready/.test(ring), `the Guide button: “${ring}”`);
    await shot('first-sale-done');

    /* ══ when you are ready ══ */
    await press('^Keep going', '.tut-coach');
    await waitFor(() => location.pathname === '/company-profile');
    await follow('When you are ready · 1 of 5', 'Add your GSTIN and bank details', null, async () => {
      await waitFor(() => window.__vis().some(e => /gstin/i.test(window.__labelOf(e))), 10000);
      await fill([['gstin', '36ABCDE1234F1Z5'], ['bank name', 'Test Bank'], ['account (no|number)', '123456789012'], ['ifsc', 'HDFC0001234']], 'company profile');
      ok(!!(await press('^Save changes$')), 'Save changes is there');
    });
    await next();

    await follow('When you are ready · 2 of 5', 'Add a vendor', 'Add vendor', async () => {
      await pressSpot();
      await fill([['Vendor name', 'Sri Steel Traders'], ['GSTIN', '36AAACS1234K1Z2']], 'vendor');
      await submit();
    });
    await next();

    await follow('When you are ready · 3 of 5', 'Raise a purchase order', 'Create PO', async () => {
      await pressSpot();
      await fill([['^Vendor( \\||$)', '*']], 'PO vendor'); await sleep(500);
      await fill([['PO Title', 'Brackets for first order'], ['Line 1 item', '*']], 'PO'); await sleep(500);
      await fill([['Line 1 quantity', '20'], ['Line 1 unit price', '800']], 'PO line');
      await press('^Raise Order$');
    });
    await next();

    await follow('When you are ready · 4 of 5', 'Receive the goods', '^(Sign off|Approve|Dispatch|Receive GRN)$', async () => {
      const pressed = [];
      for (let i = 0; i < 5; i++) {
        /* Whichever comes first: the pointer on the next button, or the tick. */
        await waitFor(() => !!document.querySelector('.tut-spot') || /Done: Receive the goods/.test(document.querySelector('.tut-coach')?.innerText || ''), 8000);
        if (await ev(() => /Done: Receive the goods/.test(document.querySelector('.tut-coach')?.innerText || ''))) break;
        if (!(await ev(() => !!document.querySelector('.tut-spot')))) break;
        pressed.push(await pressSpot());
      }
      ok(pressed.join(',') === 'Approve,Dispatch,Receive GRN', `the pointer goes Approve → Dispatch → Receive GRN (${pressed.join(' → ')})`);
    });
    await next();

    let inviteLink = null;
    await follow('When you are ready · 5 of 5', 'Invite a colleague', 'Add person', async () => {
      await pressSpot();
      await fill([['e.g. Ramesh', 'Ravi Colleague'], ['they sign in with this', INVITEE], ['^Role', 'Sales']], 'add person');
      ok(!!(await press('^Send invitation$')), 'Send invitation is there');
      await sleep(1200);
      inviteLink = await ev(() => (document.body.innerText.match(/https?:\/\/\S*accept-invite\S*/) || [])[0] || [...document.querySelectorAll('input')].map(i => i.value).find(v => /accept-invite/.test(v)) || null);
    });

    await sleep(600);
    ok(/See what you have done/.test(await coach()), 'after the last step the card offers “See what you have done”');
    await press('See what you have done', '.tut-coach');
    const all = await ev(() => document.querySelector('.tut-panel')?.innerText || '');
    ok(/11 of 11 done/.test(all) && /whole flow/.test(all), 'the panel shows 11 of 11 and the well-done message');
    ok(/all 11 steps done/.test(await ev(() => document.querySelector('.nav-rail-guide')?.getAttribute('aria-label'))), 'the Guide button says all 11 steps are done');
    await shot('all-done');

    /* ── the next sign-in ── */
    console.log('\n  ── signing in again');
    await ev(() => { localStorage.removeItem('nexus_token'); localStorage.removeItem('nexus_user'); sessionStorage.clear(); });
    await page.goto(`${UI}/login`, { waitUntil: 'networkidle2' });
    await ev(([em, pw]) => { const ins = [...document.querySelectorAll('input')]; window.__setV(ins.find(i => i.type === 'email'), em); window.__setV(ins.find(i => i.type === 'password'), pw); }, [EMAIL, PW]);
    await ev(() => window.__click('^(sign in|log in|login)')).catch(() => {});
    await waitFor(() => location.pathname === '/dashboard', 15000); await sleep(2000);
    ok(!(await ev(() => !!document.querySelector('.tut-panel'))), 'signing in again: the tutorial does not open by itself');
    ok(await ev(() => !!document.querySelector('.nav-rail-guide')), 'and ▶ Guide is there at the top left');

    /* ── the colleague accepts the invitation ── */
    console.log('\n  ── the invited colleague');
    ok(!!inviteLink, 'the invitation link is shown to the owner');
    if (inviteLink) {
      const ctx = await browser.createBrowserContext();
      const p2 = await newPage(ctx);
      await p2.goto(inviteLink.replace(/^https?:\/\/[^/]+/, UI), { waitUntil: 'networkidle2' });
      await p2.waitForFunction(() => document.querySelectorAll('input[type=password]').length > 0, { timeout: 10000 }).catch(() => {});
      await p2.evaluate((pw) => { window.__vis().filter(e => e.type === 'password').forEach(e => window.__setV(e, pw)); }, PW);
      await p2.evaluate(() => window.__click('^Set my password and sign in$')).catch(() => {});
      await p2.waitForFunction(() => location.pathname === '/dashboard', { timeout: 15000 }).catch(() => {});
      const opened = await p2.waitForFunction(() => /of \d+ done/.test(document.querySelector('.tut-progress')?.innerText || ''), { timeout: 12000 }).then(() => true).catch(() => false);
      const inv = await p2.evaluate(() => document.querySelector('.tut-panel')?.innerText.replace(/\s+/g, ' ') || '');
      const nSteps = await p2.evaluate(() => document.querySelectorAll('.tut-step').length);
      ok(opened, 'their first sign-in opens the tutorial');
      ok(nSteps === 5 && /5 of 5 done/.test(inv), `as Sales they see their 5 steps, already done by the company (${nSteps}; ${(inv.match(/\d+ of \d+ done/) || ['—'])[0]})`);
      ok(/already runs the whole flow/.test(inv) && !/Every step is done/.test(inv), 'with a welcome that maps where things are, not a congratulation');
      await p2.screenshot({ path: path.join(OUT, 'invitee.png') });
      await ctx.close();
    }

    console.log(`\n  ticks: ${timings.join(' · ')}`);
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.message}`);
    await shot('crash').catch(() => {});
  } finally {
    await browser.close();
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const ids = (await c.query('SELECT id FROM users WHERE LOWER(email) IN (LOWER($1), LOWER($2))', [EMAIL, INVITEE])).rows.map(r => r.id);
    await c.end();
    const n = ids.length ? await purge(ids) : 0;
    console.log(`\n   ✅ test accounts removed (${n})   screenshots: ${OUT}`);
    if (notes.length) console.log(`\n  notes:\n${notes.map(x => `   - ${x}`).join('\n')}`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
